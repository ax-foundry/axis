from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pandas as pd

from app.services.db._types import DatabaseType


class AsyncConnection(ABC):
    """Backend-agnostic async database connection."""

    @abstractmethod
    async def fetch_all(
        self,
        query: str,
        params: tuple[Any, ...] | dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Execute a query and return all rows as dicts."""

    @abstractmethod
    async def fetch_one(
        self,
        query: str,
        params: tuple[Any, ...] | dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Execute a query and return a single row."""

    @abstractmethod
    async def execute(
        self,
        query: str,
        params: tuple[Any, ...] | dict[str, Any] | None = None,
    ) -> None:
        """Execute a statement (no result)."""

    @abstractmethod
    async def commit(self) -> None:
        """Commit the current transaction."""


class DatabaseBackend(ABC):
    """Layer 1: Connection lifecycle, pooling, chunked reads, SQL dialect helpers."""

    @property
    @abstractmethod
    def db_type(self) -> DatabaseType: ...

    @abstractmethod
    def build_url(self, config: Any) -> str:
        """Build a connection URL from a config object."""

    @abstractmethod
    @asynccontextmanager
    async def connect(
        self,
        url: str,
        ssl_mode: str | None = None,
        connect_timeout: int = 10,
        statement_timeout_ms: int = 60_000,
    ) -> AsyncIterator[AsyncConnection]:
        """Create a single async connection with timeouts."""
        yield  # type: ignore[misc]

    @abstractmethod
    @asynccontextmanager
    async def pooled_connection(
        self,
        url: str,
        ssl_mode: str | None = None,
        statement_timeout_ms: int = 60_000,
        connect_timeout: int = 10,
        min_size: int = 0,
        max_size: int = 10,
    ) -> AsyncIterator[AsyncConnection]:
        """Get a connection from a pool, with automatic return."""
        yield  # type: ignore[misc]

    @abstractmethod
    async def chunked_read(
        self,
        url: str,
        query: str,
        ssl_mode: str | None = None,
        chunk_size: int = 5_000,
        max_rows: int = 0,
        connect_timeout: int = 10,
        statement_timeout_ms: int = 60_000,
    ) -> AsyncIterator[tuple[pd.DataFrame, bool]]:
        """Stream query results as DataFrames in chunks."""
        yield  # type: ignore[misc]

    @abstractmethod
    async def close_all_pools(self) -> None:
        """Close all cached connection pools. Call on app shutdown."""

    @abstractmethod
    async def test_connection(
        self,
        url: str,
        ssl_mode: str | None = None,
        connect_timeout: int = 10,
        statement_timeout_ms: int = 30_000,
    ) -> str | None:
        """Test connectivity and return version string, or None on failure."""

    async def copy_to_csv(
        self,
        url: str,
        query: str,
        dest_path: str | Path,
        ssl_mode: str | None = None,
        connect_timeout: int = 10,
        statement_timeout_ms: int = 600_000,
    ) -> int:
        """COPY query results to a CSV file. Returns row count.

        Backends that don't support COPY should leave this unimplemented;
        the sync engine will fall back to chunked_read.
        """
        raise NotImplementedError

    def param_placeholder(self) -> str:
        """Parameter placeholder for this dialect (default: %s)."""
        return "%s"

    def quote_identifier(self, name: str) -> str:
        """Quote a single identifier (default: double-quote)."""
        return f'"{name}"'

    def quote_table(self, schema: str, table: str) -> str:
        """Quote a schema-qualified table name."""
        return f"{self.quote_identifier(schema)}.{self.quote_identifier(table)}"

    def cast_to_text(self, expr: str) -> str:
        """Cast an expression to text (default: Postgres-style ::text)."""
        return f"{expr}::text"


class CatalogBackend(ABC):
    """Layer 2: Metadata queries for the table browser UI."""

    @abstractmethod
    async def list_tables(self, conn: AsyncConnection) -> list[dict[str, Any]]:
        """List tables with schema_name, table_name, row_estimate."""

    @abstractmethod
    async def table_exists(self, conn: AsyncConnection, schema: str, table: str) -> bool:
        """Check whether a table exists."""

    @abstractmethod
    async def get_columns(
        self, conn: AsyncConnection, schema: str, table: str
    ) -> list[dict[str, Any]]:
        """Get columns with column_name, data_type, is_nullable."""

    @abstractmethod
    async def validate_columns(
        self, conn: AsyncConnection, schema: str, table: str, columns: list[str]
    ) -> set[str]:
        """Return set of column names from *columns* that do NOT exist in the table."""
