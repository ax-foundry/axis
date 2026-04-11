"""Typed result envelope for all delegation tools.

Every delegation tool returns a ``DelegationResult``. This single contract
makes synthesis, retries, observability, and testing uniform across agents.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, Field


@dataclass
class ArtifactRef:
    """Pointer to a file produced by a sub-agent in the shared workspace."""

    path: str  # workspace-relative path
    format: str  # "parquet", "csv", "json", "png", "html"
    rows: int | None = None  # row count if tabular
    description: str = ""  # what this artifact contains


class DelegationResult(BaseModel):
    """Typed result envelope returned by every delegation tool."""

    status: Literal["success", "partial", "error"] = "success"
    agent: str = ""  # "sql", "python", "reporting", "research"
    summary: str = ""  # human-readable summary (fed to orchestrator LLM)
    artifacts: list[dict[str, Any]] = Field(default_factory=list)  # ArtifactRef dicts
    chart_spec: dict[str, Any] | None = None  # Plotly chart spec if generated
    download_spec: dict[str, Any] | None = None  # download metadata if generated
    metrics: dict[str, Any] = Field(default_factory=dict)  # rows_scanned, execution_time_ms, etc.
    confidence: float | None = None  # 0.0-1.0 self-assessed confidence
    assumptions: list[str] = Field(default_factory=list)  # what the agent assumed
    errors: list[str] = Field(default_factory=list)  # errors encountered
    warnings: list[str] = Field(default_factory=list)  # non-fatal issues

    def to_tool_output(self) -> str:
        """Serialize for FunctionTool output (JSON string for the orchestrator LLM)."""
        return self.model_dump_json(exclude_none=True)

    @staticmethod
    def error_result(agent: str, message: str) -> DelegationResult:
        return DelegationResult(
            status="error",
            agent=agent,
            summary=f"Error: {message}",
            errors=[message],
        )

    @staticmethod
    def from_artifact(ref: ArtifactRef) -> dict[str, Any]:
        """Convert ArtifactRef to a JSON-safe dict for the artifacts list."""
        return {
            "path": ref.path,
            "format": ref.format,
            "rows": ref.rows,
            "description": ref.description,
        }
