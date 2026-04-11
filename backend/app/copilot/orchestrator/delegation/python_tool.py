"""Python delegation tool — sandboxed execution via UC session.

Creates a UC sandbox session (UnixLocal or Docker depending on config),
passes it to all Python agent tools, and runs the agent. All file I/O
and code execution flows through ``session.exec()``, ``session.read()``,
``session.write()`` — the same interface whether local or Docker.
"""

from __future__ import annotations

import logging
import time
from typing import Any, ClassVar

from pydantic import BaseModel, Field

from universal_computer import (
    Dir,
    Manifest,
    SandboxSession,
    UnixLocalSandboxClient,
)
from openai.types.responses import ResponseTextDoneEvent
from universal_computer.agents import Agent, ToolCalledEvent
from universal_computer.agents.plugins import Shell
from universal_computer.session.sandbox_client import BaseSandboxClient

from app.copilot.orchestrator import config as cfg
from app.copilot.orchestrator.contracts import ArtifactRef, DelegationResult
from app.copilot.orchestrator.delegation.base import BaseDelegationTool, DelegationArgs

logger = logging.getLogger(__name__)

PYTHON_AGENT_INSTRUCTIONS = """\
You are a Python data analysis agent. You execute code inside a sandbox.

IMPORTANT: You fetch your own data. Use the get_data tool to run SQL against DuckDB
and save results as parquet files in your sandbox. Do NOT expect files to already exist.

Your capabilities:
- Statistical tests (Mann-Whitney, t-test, chi-square, Kruskal-Wallis)
- Regression (linear, logistic, random forest feature importance)
- Clustering (K-means, DBSCAN, silhouette analysis)
- Time series (STL decomposition, changepoint detection, ARIMA)
- Correlation analysis (Pearson, Spearman, correlation matrices)
- Anomaly detection (IQR, isolation forest, z-scores)
- Cohort analysis (retention curves, cohort matrices)
- Visualization (Plotly charts, seaborn heatmaps)

Workflow:
1. FIRST use get_data(sql="SELECT ...", filename="mydata") to fetch data into data/mydata.parquet
2. Then use run_python to load data/mydata.parquet with pandas and analyze it
3. Print all results to stdout — this is how results are returned
4. Optionally save charts/files to output/ directory

Key tables: monitoring_data (metric_name, metric_score, timestamp, passed, source_component),
kpi_data (kpi_name, numeric_value, created_at), human_signals_cases (signal columns).
All data filtered to source_name='athena'.

Statistical rigor rules:
- Always check and report sample sizes per group
- Use non-parametric tests unless normality is confirmed (Shapiro-Wilk test)
- For multiple comparisons, apply Bonferroni correction
- Report confidence intervals alongside p-values
- Include effect sizes (Cohen's d, rank-biserial, eta-squared)
- If n < 30, warn that results may not be reliable
- State "Correlation does not imply causation" for any correlation/regression
"""


def _create_sandbox_client() -> BaseSandboxClient:
    """Create the appropriate sandbox client based on config.

    UnixLocalSandboxClient for dev, DockerSandboxClient for prod.
    Swap backends here — everything downstream uses the same session interface.
    """
    if getattr(cfg, "SANDBOX_BACKEND", "local") == "docker":
        try:
            from universal_computer import DockerSandboxClient, DockerSandboxClientOptions

            import docker

            docker_client = docker.from_env()
            return DockerSandboxClient(docker_client=docker_client)
        except Exception as e:
            logger.warning("Docker sandbox unavailable, falling back to local: %s", e)

    return UnixLocalSandboxClient()


class PythonDelegationArgs(BaseModel):
    task: str = Field(description="The analysis task to perform")
    data_files: list[str] = Field(
        default_factory=list,
        description="Workspace-relative paths to data files to analyze (e.g. ['data/scores.parquet'])",
    )
    context: str = Field(default="", description="Additional context or constraints")


class DelegateToPythonTool(BaseDelegationTool):
    """Delegate a statistical analysis task to the Python agent.

    Creates a UC sandbox session, binds all Python tools to it, and runs the agent.
    All execution (code, pip install, file I/O) flows through the session —
    same code works for UnixLocal (dev) and Docker (prod).
    """

    tool_name: ClassVar[str] = "delegate_to_python"
    args_model: ClassVar[type] = PythonDelegationArgs
    description: ClassVar[str] = (
        "Delegate a statistical analysis task to the Python agent. "
        "Use for statistical tests, regression, clustering, time series, "
        "correlation, anomaly detection, and custom visualizations. "
        "Runs in a sandboxed environment."
    )
    agent_name: str = "python"

    async def _execute(
        self, args: DelegationArgs, *, delegation_id: str
    ) -> DelegationResult:
        python_args = PythonDelegationArgs.model_validate(args.model_dump())

        from app.copilot.orchestrator.agents.python_agent import (
            GetDataTool,
            InstallPackageTool,
            ReadOutputTool,
            RunPythonTool,
        )

        # Build task description with file context
        task_desc = python_args.task
        if python_args.data_files:
            file_list = ", ".join(python_args.data_files)
            task_desc += f"\n\nAvailable data files: {file_list}"
        if python_args.context:
            task_desc += f"\n\nAdditional context: {python_args.context}"

        existing_files = self.workspace.list_data_files()
        if existing_files:
            file_desc = ", ".join(f["path"] for f in existing_files)
            task_desc += f"\n\nFiles already in workspace: {file_desc}"

        # Create sandbox client (UnixLocal or Docker)
        sandbox_client = _create_sandbox_client()

        # Build manifest for the Python sandbox workspace
        manifest = Manifest(
            root=str(self.workspace.root),
            entries={
                "data": Dir(description="Input data files (parquet, CSV)"),
                "output": Dir(description="Analysis output files (charts, tables, JSON)"),
                "scripts": Dir(description="Generated Python scripts"),
            },
        )

        start = time.monotonic()
        response_text = ""

        # Create a sandbox session — all tools bind to this
        session: SandboxSession = await sandbox_client.create(
            snapshot=None,
            manifest=manifest,
            options=self._sandbox_options(sandbox_client),
        )

        try:
            await session.start()

            # Build tools bound to the live sandbox session
            tools = [
                GetDataTool(session=session, workspace=self.workspace),
                RunPythonTool(session=session, workspace=self.workspace),
                ReadOutputTool(session=session),
                InstallPackageTool(session=session),
            ]

            # Build UC Agent with Shell plugin (gives exec_command to the LLM too)
            python_agent: Agent[None] = Agent(
                default_manifest=manifest,
                model=cfg.PYTHON_AGENT_MODEL,
                user_instructions=PYTHON_AGENT_INSTRUCTIONS,
                plugins=[],  # No plugins — tools handle everything via session
                tools=tools,
            )

            # Run with the pre-created session (caller-owned lifecycle)
            tool_outputs: list[str] = []

            async with python_agent.start(session=session) as task:
                async for event in task.run([{"role": "user", "content": task_desc}]):
                    if isinstance(event, ToolCalledEvent):
                        tool_name = event.tool_call.tool.as_responses_tool().get("name", "?")
                        await self.thought_stream.emit_tool_use(
                            f"Python agent: {event.tool_call.describe()[:100]}",
                            tool_name=tool_name,
                            node_name="Python Agent",
                        )
                        result = await event.tool_call(task)
                        # Capture tool outputs (function_call_output dicts)
                        if isinstance(result, dict) and result.get("output"):
                            tool_outputs.append(str(result["output"])[:2000])

                    elif isinstance(event, ResponseTextDoneEvent):
                        response_text = event.text

            # If no LLM response text, use the last tool output as summary
            if not response_text and tool_outputs:
                response_text = tool_outputs[-1]

        except Exception as e:
            return DelegationResult.error_result("python", f"Python agent failed: {e}")
        finally:
            # Caller-owned session: we clean up
            try:
                await session.stop()
            finally:
                await session.shutdown()

        latency_ms = (time.monotonic() - start) * 1000

        # Collect output artifacts
        artifacts = []
        for f in self.workspace.list_output_files():
            artifacts.append(
                DelegationResult.from_artifact(
                    ArtifactRef(
                        path=f["path"],
                        format=f["format"],
                        description="Python analysis output",
                    )
                )
            )

        if not response_text:
            response_text = "Python analysis completed."
            if artifacts:
                response_text += f" Generated {len(artifacts)} output file(s)."

        return DelegationResult(
            status="success",
            agent="python",
            summary=response_text,
            artifacts=artifacts,
            metrics={"latency_ms": round(latency_ms, 1)},
        )

    def _sandbox_options(self, client: BaseSandboxClient) -> Any:
        """Return backend-specific options (None for UnixLocal, image for Docker)."""
        if type(client).__name__ == "DockerSandboxClient":
            try:
                from universal_computer import DockerSandboxClientOptions

                return DockerSandboxClientOptions(
                    image=getattr(cfg, "DOCKER_PYTHON_IMAGE", "python:3.12-slim")
                )
            except ImportError:
                pass
        return None
