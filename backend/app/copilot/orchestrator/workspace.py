"""Session-scoped workspace for inter-agent file exchange.

Each orchestrator request gets a temporary directory. Sub-agents write
parquet/CSV/JSON/PNG files here. The artifact manifest tracks lineage.
"""

from __future__ import annotations

import json
import logging
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

from app.copilot.orchestrator import config as cfg

logger = logging.getLogger(__name__)


class WorkspaceManager:
    """Manages the shared file workspace for one orchestrator request."""

    def __init__(self, request_id: str = "") -> None:
        self.root = Path(tempfile.mkdtemp(prefix=f"axis-ws-{request_id[:8]}-"))
        self.data_dir = self.root / "data"
        self.output_dir = self.root / "output"
        self.reports_dir = self.root / "reports"
        self.scripts_dir = self.root / "scripts"
        self._manifest_path = self.root / "_manifest.json"
        self._manifest: list[dict[str, Any]] = []

        # Create subdirs
        for d in (self.data_dir, self.output_dir, self.reports_dir, self.scripts_dir):
            d.mkdir(parents=True, exist_ok=True)

        self._write_manifest()

    def record_artifact(
        self,
        *,
        path: str,
        fmt: str,
        agent: str,
        delegation_id: str = "",
        description: str = "",
        rows: int | None = None,
        query_hash: str = "",
    ) -> None:
        """Record an artifact in the manifest for lineage tracking."""
        entry = {
            "path": path,
            "format": fmt,
            "agent": agent,
            "delegation_id": delegation_id,
            "description": description,
            "rows": rows,
            "query_hash": query_hash,
            "timestamp": time.time(),
        }
        self._manifest.append(entry)
        self._write_manifest()

    def list_data_files(self) -> list[dict[str, Any]]:
        """List all files in the data directory with metadata."""
        files = []
        for p in sorted(self.data_dir.iterdir()):
            if p.is_file():
                files.append({
                    "name": p.name,
                    "path": str(p.relative_to(self.root)),
                    "size_bytes": p.stat().st_size,
                    "format": p.suffix.lstrip("."),
                })
        return files

    def list_output_files(self) -> list[dict[str, Any]]:
        """List all files in the output directory."""
        files = []
        for p in sorted(self.output_dir.rglob("*")):
            if p.is_file():
                files.append({
                    "name": p.name,
                    "path": str(p.relative_to(self.root)),
                    "size_bytes": p.stat().st_size,
                    "format": p.suffix.lstrip("."),
                })
        return files

    def list_all_files(self) -> list[dict[str, Any]]:
        """List all artifact files across data/, output/, reports/."""
        return self.list_data_files() + self.list_output_files()

    def read_file(self, path: str) -> bytes:
        """Read a file by workspace-relative path. Enforces workspace confinement."""
        resolved = (self.root / path).resolve()
        if not str(resolved).startswith(str(self.root.resolve())):
            raise ValueError(f"Path escapes workspace: {path}")
        if not resolved.is_file():
            raise FileNotFoundError(f"File not found: {path}")
        return resolved.read_bytes()

    def write_file(self, path: str, data: bytes) -> Path:
        """Write a file by workspace-relative path. Enforces confinement and size limits."""
        resolved = (self.root / path).resolve()
        if not str(resolved).startswith(str(self.root.resolve())):
            raise ValueError(f"Path escapes workspace: {path}")
        if len(data) > cfg.PYTHON_MAX_FILE_BYTES:
            raise ValueError(
                f"File exceeds size limit: {len(data)} bytes "
                f"(max {cfg.PYTHON_MAX_FILE_BYTES})"
            )
        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_bytes(data)
        return resolved

    def disk_usage_bytes(self) -> int:
        """Total disk usage of the workspace."""
        total = 0
        for p in self.root.rglob("*"):
            if p.is_file():
                total += p.stat().st_size
        return total

    def check_disk_limit(self) -> str | None:
        """Return error message if workspace disk limit exceeded, else None."""
        usage = self.disk_usage_bytes()
        if usage >= cfg.MAX_WORKSPACE_DISK_BYTES:
            return (
                f"Workspace disk limit exceeded: {usage} bytes "
                f"(max {cfg.MAX_WORKSPACE_DISK_BYTES})"
            )
        return None

    async def cleanup(self) -> None:
        """Remove the temporary workspace directory."""
        try:
            shutil.rmtree(self.root, ignore_errors=True)
            logger.debug("Cleaned up workspace: %s", self.root)
        except Exception:
            logger.warning("Failed to clean up workspace: %s", self.root, exc_info=True)

    def _write_manifest(self) -> None:
        self._manifest_path.write_text(
            json.dumps(self._manifest, indent=2, default=str),
            encoding="utf-8",
        )
