"""Python sub-agent — sandboxed execution via universal_computer session.

All 4 tools operate through the UC ``SandboxSession`` interface:
- ``session.exec()`` for running Python scripts
- ``session.write()`` / ``session.read()`` for file I/O
- Same interface works for UnixLocal (dev) and Docker (prod)

This is the entire point of the UC SDK — swap sandbox backends with zero code changes.
"""

from __future__ import annotations

import base64
import io
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any, Awaitable, ClassVar

from pydantic import BaseModel, ConfigDict, Field

from universal_computer.agents.tools import FunctionTool

from app.copilot.orchestrator import config as cfg

if TYPE_CHECKING:
    from universal_computer import SandboxSession

    from app.copilot.orchestrator.workspace import WorkspaceManager

logger = logging.getLogger(__name__)


# ── get_data ──────────────────────────────────────────────────────────────────


class GetDataArgs(BaseModel):
    sql: str = Field(description="SELECT query to run against DuckDB")
    format: str = Field(
        default="parquet",
        description="Output format: 'parquet' or 'csv'",
    )
    filename: str = Field(
        default="data",
        description="Output filename (without extension)",
    )


class GetDataTool(FunctionTool[GetDataArgs, str]):
    """Run a SQL query against DuckDB and save results to the sandbox workspace.

    The data file can then be loaded by run_python for analysis.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    tool_name: ClassVar[str] = "get_data"
    args_model: ClassVar[type] = GetDataArgs
    description: ClassVar[str] = (
        "Run a SQL SELECT query against DuckDB and save results as parquet or CSV "
        "in the sandbox workspace. Returns the file path and row count."
    )

    sandbox_session: Any = Field(default=None, exclude=True)
    ws: Any = Field(default=None, exclude=True)

    def __init__(
        self,
        *,
        session: SandboxSession,
        workspace: WorkspaceManager,
        **kwargs: Any,
    ) -> None:
        super().__init__(sandbox_session=session, ws=workspace, **kwargs)

    def run(self, args: GetDataArgs) -> Awaitable[str]:
        return self._run(args)

    async def _run(self, args: GetDataArgs) -> str:
        try:
            from app.services.duckdb_store import get_store
        except ImportError:
            return "Error: DuckDB store not available"

        store = get_store()

        sql_upper = args.sql.strip().upper()
        if not sql_upper.startswith("SELECT"):
            return "Error: Only SELECT queries are allowed"

        try:
            df = store.query_df(args.sql)
        except Exception as e:
            return f"Error executing SQL: {e}"

        ext = "parquet" if args.format == "parquet" else "csv"
        filename = f"{args.filename}.{ext}"

        # Write through the sandbox session (works for both UnixLocal and Docker)
        try:
            buf = io.BytesIO()
            if ext == "parquet":
                df.to_parquet(buf, index=False)
            else:
                df.to_csv(buf, index=False)
            buf.seek(0)
            await self.sandbox_session.write(Path("data") / filename, buf)
        except Exception as e:
            return f"Error writing data to sandbox: {e}"

        self.ws.record_artifact(
            path=f"data/{filename}",
            fmt=ext,
            agent="python",
            description=f"Query result: {args.sql[:80]}...",
            rows=len(df),
        )

        cols = ", ".join(df.columns[:10])
        more = f" + {len(df.columns) - 10} more" if len(df.columns) > 10 else ""
        return f"{len(df)} rows written to data/{filename} ({len(df.columns)} columns: {cols}{more})"


# ── run_python ────────────────────────────────────────────────────────────────


class RunPythonArgs(BaseModel):
    code: str = Field(description="Python code to execute in the sandbox")


class RunPythonTool(FunctionTool[RunPythonArgs, str]):
    """Execute Python code via the UC sandbox session.

    The code is written to ``scripts/script.py`` inside the sandbox workspace,
    then executed via ``session.exec()``. This uses the same execution path
    whether the sandbox is UnixLocal (dev) or Docker (prod).

    Pre-imported: pandas, numpy. Others available: scipy, sklearn, statsmodels,
    plotly, seaborn. Working directory: workspace root. Output files: write to output/.
    Timeout: 60 seconds.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    tool_name: ClassVar[str] = "run_python"
    args_model: ClassVar[type] = RunPythonArgs
    description: ClassVar[str] = (
        "Execute Python code in the sandbox via session.exec(). "
        "Pre-imported: pandas, numpy. Available: scipy, sklearn, statsmodels, plotly, seaborn. "
        "Read data from data/ dir, write outputs to output/ dir. Timeout: 60s."
    )

    sandbox_session: Any = Field(default=None, exclude=True)
    ws: Any = Field(default=None, exclude=True)

    def __init__(
        self,
        *,
        session: SandboxSession,
        workspace: WorkspaceManager,
        **kwargs: Any,
    ) -> None:
        super().__init__(sandbox_session=session, ws=workspace, **kwargs)

    def run(self, args: RunPythonArgs) -> Awaitable[str]:
        return self._run(args)

    async def _run(self, args: RunPythonArgs) -> str:
        preamble = (
            "import os, sys, warnings\n"
            "warnings.filterwarnings('ignore')\n"
            "import pandas as pd\n"
            "import numpy as np\n"
            "os.makedirs('output', exist_ok=True)\n"
        )
        full_code = preamble + "\n" + args.code

        # Write script to sandbox via session.write()
        try:
            await self.sandbox_session.write(
                Path("scripts/script.py"),
                io.BytesIO(full_code.encode("utf-8")),
            )
        except Exception as e:
            return f"Error writing script to sandbox: {e}"

        # Execute via session.exec() — this is the UC sandbox execution path
        # Works identically for UnixLocal and Docker backends
        try:
            result = await self.sandbox_session.exec(
                "python", "scripts/script.py",
                timeout=float(cfg.PYTHON_TIMEOUT_S),
                shell=False,
            )
        except Exception as e:
            err_type = type(e).__name__
            return f"Error: Python execution failed ({err_type}): {e}"

        stdout = result.stdout.decode("utf-8", errors="replace")
        stderr = result.stderr.decode("utf-8", errors="replace")

        # Truncate large outputs
        stdout = stdout[:cfg.PYTHON_MAX_OUTPUT_BYTES]
        stderr = stderr[:cfg.PYTHON_MAX_OUTPUT_BYTES]

        # List generated output files via session.exec(ls)
        output_files = await self._list_output_files()

        parts = []
        if stdout.strip():
            parts.append(f"stdout:\n{stdout}")
        if stderr.strip():
            # Always show stderr — the LLM needs to see import errors, warnings, etc.
            parts.append(f"stderr:\n{stderr}")
        if not result.ok():
            parts.append(f"Exit code: {result.exit_code}")
        if output_files:
            parts.append("Generated files:\n" + "\n".join(f"  {f}" for f in output_files))
        elif result.ok():
            parts.append("No output files generated.")

        return "\n\n".join(parts) if parts else "Script completed with no output."

    async def _list_output_files(self) -> list[str]:
        """List files in output/ dir via sandbox session."""
        files = []
        try:
            entries = await self.sandbox_session.ls(Path("output"))
            for entry in entries:
                name = Path(entry.path).name
                if not entry.is_dir():
                    files.append(name)
                    self.ws.record_artifact(
                        path=f"output/{name}",
                        fmt=Path(name).suffix.lstrip("."),
                        agent="python",
                        description="Python output",
                    )
        except Exception:
            # ls may fail if output/ doesn't exist yet
            pass
        return files


# ── read_output ───────────────────────────────────────────────────────────────


class ReadOutputArgs(BaseModel):
    path: str = Field(
        description="Workspace-relative path to read (e.g. 'output/chart.png', 'data/results.csv')"
    )


class ReadOutputTool(FunctionTool[ReadOutputArgs, str]):
    """Read a file from the sandbox workspace via session.read().

    Returns text content for text files, base64 for binary files.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    tool_name: ClassVar[str] = "read_output"
    args_model: ClassVar[type] = ReadOutputArgs
    description: ClassVar[str] = (
        "Read a file from the sandbox workspace. Returns text for text files, "
        "base64-encoded content for binary files (images, etc)."
    )

    sandbox_session: Any = Field(default=None, exclude=True)

    def __init__(self, *, session: SandboxSession, **kwargs: Any) -> None:
        super().__init__(sandbox_session=session, **kwargs)

    def run(self, args: ReadOutputArgs) -> Awaitable[str]:
        return self._run(args)

    async def _run(self, args: ReadOutputArgs) -> str:
        try:
            handle = await self.sandbox_session.read(Path(args.path))
        except Exception as e:
            return f"Error reading file: {e}"

        try:
            payload = handle.read()
        finally:
            try:
                handle.close()
            except Exception:
                pass

        if isinstance(payload, str):
            data = payload.encode("utf-8")
        elif isinstance(payload, (bytes, bytearray)):
            data = bytes(payload)
        else:
            data = str(payload).encode("utf-8")

        # Enforce output size limit
        if len(data) > cfg.MAX_OUTPUT_SIZE_BYTES:
            data = data[: cfg.MAX_OUTPUT_SIZE_BYTES]

        # Try text decode
        try:
            text = data.decode("utf-8")
            return text
        except UnicodeDecodeError:
            encoded = base64.b64encode(data).decode("ascii")
            if len(encoded) > 1000:
                return f"[base64:{args.path}]{encoded[:1000]}..."
            return f"[base64:{args.path}]{encoded}"


# ── install_package ───────────────────────────────────────────────────────────


class InstallPackageArgs(BaseModel):
    package_name: str = Field(description="Package name to install (must be on allowlist)")


class InstallPackageTool(FunctionTool[InstallPackageArgs, str]):
    """Install a Python package in the sandbox via session.exec('pip install ...').

    Only packages on the allowlist can be installed. In production, runtime
    installs are disabled — packages are pre-baked into the Docker image.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    tool_name: ClassVar[str] = "install_package"
    args_model: ClassVar[type] = InstallPackageArgs
    description: ClassVar[str] = (
        "Install a Python package in the sandbox (must be on the allowlist). "
        "Available: scipy, scikit-learn, statsmodels, seaborn, matplotlib, plotly, "
        "networkx, textblob, nltk, xgboost, lightgbm."
    )

    sandbox_session: Any = Field(default=None, exclude=True)

    def __init__(self, *, session: SandboxSession, **kwargs: Any) -> None:
        super().__init__(sandbox_session=session, **kwargs)

    def run(self, args: InstallPackageArgs) -> Awaitable[str]:
        return self._run(args)

    async def _run(self, args: InstallPackageArgs) -> str:
        pkg = args.package_name.strip().lower()

        if not cfg.PYTHON_RUNTIME_INSTALL_ENABLED:
            return (
                f"Runtime package installation is disabled. "
                f"Pre-installed packages: {', '.join(cfg.PYTHON_PREINSTALLED)}"
            )

        if pkg not in cfg.PYTHON_INSTALL_ALLOWLIST:
            return (
                f"Package '{pkg}' is not on the allowlist. "
                f"Allowed: {', '.join(sorted(cfg.PYTHON_INSTALL_ALLOWLIST))}"
            )

        # Install via sandbox session — works for both UnixLocal and Docker
        try:
            result = await self.sandbox_session.exec(
                "pip", "install", "--quiet", pkg,
                timeout=60.0,
                shell=False,
            )
        except Exception as e:
            return f"Error installing '{pkg}': {e}"

        if not result.ok():
            err = result.stderr.decode("utf-8", errors="replace")[:500]
            return f"Error installing '{pkg}': {err}"

        logger.info("Installed package via sandbox: %s", pkg)
        return f"Installed {pkg}"
