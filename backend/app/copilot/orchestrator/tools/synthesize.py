"""Synthesize tool — reads workspace artifacts and provides a structured summary.

The orchestrator uses this to inspect what data files exist in the workspace
before composing a final response.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any, ClassVar

from pydantic import BaseModel, ConfigDict, Field

from universal_computer.agents.tools import FunctionTool

if TYPE_CHECKING:
    from app.copilot.orchestrator.workspace import WorkspaceManager

logger = logging.getLogger(__name__)


class SynthesizeArgs(BaseModel):
    """Arguments for the synthesize tool."""

    include_file_previews: bool = Field(
        default=False,
        description="If true, include first few rows/lines of data files",
    )


class SynthesizeTool(FunctionTool[SynthesizeArgs, str]):
    """List and summarize all artifacts in the shared workspace.

    Returns file names, sizes, formats, and optionally previews.
    Use this to inspect available data before composing a final response.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    tool_name: ClassVar[str] = "synthesize"
    args_model: ClassVar[type] = SynthesizeArgs
    description: ClassVar[str] = (
        "List and summarize all artifacts in the workspace produced by sub-agents. "
        "Returns file names, sizes, formats, and optionally data previews."
    )

    ws: Any = Field(default=None, exclude=True)

    def __init__(self, *, workspace: WorkspaceManager, **kwargs: Any) -> None:
        super().__init__(ws=workspace, **kwargs)

    def run(self, args: SynthesizeArgs) -> str:
        files = self.ws.list_all_files()
        if not files:
            return "No artifacts in workspace yet."

        lines = [f"Workspace artifacts ({len(files)} files):"]
        for f in files:
            size_kb = f["size_bytes"] / 1024
            lines.append(f"  {f['path']} ({f['format']}, {size_kb:.1f}KB)")

            if args.include_file_previews and f["format"] in ("csv", "json", "txt", "md"):
                try:
                    data = self.ws.read_file(f["path"])
                    preview = data[:500].decode("utf-8", errors="replace")
                    lines.append(f"    Preview: {preview[:300]}...")
                except Exception:
                    lines.append("    Preview: (could not read)")

            if args.include_file_previews and f["format"] == "parquet":
                try:
                    import pandas as pd
                    from pathlib import Path

                    full_path = self.ws.root / f["path"]
                    df = pd.read_parquet(full_path, engine="pyarrow")
                    lines.append(f"    Shape: {df.shape[0]} rows x {df.shape[1]} cols")
                    lines.append(f"    Columns: {', '.join(df.columns[:15])}")
                    if len(df.columns) > 15:
                        lines.append(f"    ... and {len(df.columns) - 15} more columns")
                except Exception:
                    lines.append("    Preview: (could not read parquet)")

        # Disk usage
        usage_mb = self.ws.disk_usage_bytes() / (1024 * 1024)
        lines.append(f"\nTotal disk usage: {usage_mb:.1f}MB")

        return "\n".join(lines)
