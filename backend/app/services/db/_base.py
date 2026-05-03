"""Abstract base classes for database backends.

## Contract for implementors

Required (abstract):
  build_connection_params, build_url_from_params,
  connect, pooled_connection, chunked_read,
  close_all_pools, test_connection

Optional overrides (have usable defaults):
  copy_to_csv       — raise NotImplementedError; sync_engine falls back to chunked_read
  execute_read_query — raise NotImplementedError; database_service delegates to backends
  bind_param        — appends raw value, returns %s  (Postgres default)
  to_params         — returns tuple(builder._items)  (Postgres default)
  quote_identifier  — double-quotes (ANSI SQL default)
  quote_table       — "schema"."table"
  quote_table_id    — delegates to quote_table (ignores project)
  cast_to_text      — expr::text  (Postgres default)
  limit_clause      — LIMIT n

Adding a new backend (Snowflake, Trino, …) is mechanical: implement the
required methods and override only the dialect helpers that differ.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd

from app.services.db._types import DatabaseType, TableId


@dataclass
class BoundParams:
    """Dialect-aware SQL parameter accumulator.

    Use ``backend.new_bound_params()`` to create one, then
    ``backend.bind_param(bp, value)`` to add each parameter.
    Pass the finished builder to ``backend.to_params(bp)`` to get
    the dialect-appropriate args for ``AsyncConnection.fetch_all``.
    """

    _items: list[Any] = field(default_factory=list)

    def is_empty(self) -> bool:
        return len(self._items) == 0


class AsyncConnection(ABC):
    """Backend-agnostic async database connection."""

    @abstractmethod
    async def fetch_all(
        self,
        query: str,
        params: tuple[Any, ...] | list[Any] | dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Execute a query and return all rows as dicts."""

    @abstractmethod
    async def fetch_one(
        self,
        query: str,
        params: tuple[Any, ...] | list[Any] | dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Execute a query and return a single row."""

    @abstractmethod
    async def execute(
        self,
        query: str,
        params: tuple[Any, ...] | list[Any] | dict[str, Any] | None = None,
    ) -> None:
        """Execute a statement (no result)."""

    @abstractmethod
    async def commit(self) -> None:
        """Commit the current transaction."""


class DatabaseBackend(ABC):
    """Layer 1: Connection lifecycle, pooling, chunked reads, SQL dialect helpers.

    All methods that previously accepted ``url: str`` and ``ssl_mode: str | None``
    now accept a ``params: dict[str, Any]`` dict whose keys are backend-specific.
    Postgres params: host, port, database, username, password, ssl_mode (and
    optionally url for direct URL config). BigQuery params: project_id, dataset,
    location, sa_client_email, sa_private_key.
    """

    @property
    @abstractmethod
    def db_type(self) -> DatabaseType: ...

    @abstractmethod
    def build_connection_params(self, source: Any) -> dict[str, Any]:
        """Normalize *source* (config dataclass, Pydantic request, or dict)
        into the backend's params dict.

        Raises:
            DatabaseBackendError: If required keys are missing, with a
                user-facing message naming the missing key.
        """

    @abstractmethod
    def build_url_from_params(self, params: dict[str, Any]) -> str:
        """Build a loggable URL from *params*.

        Postgres: a real ``postgresql://`` URL.
        BigQuery: sentinel ``bigquery://{project}/{dataset}`` for log lines only.
        """

    def build_url(self, config: Any) -> str:
        """Build a connection URL from a config object.

        Deprecated: callers should use ``build_connection_params`` +
        ``build_url_from_params``. This shim exists for the sync_engine
        transition period.
        """
        return self.build_url_from_params(self.build_connection_params(config))

    @abstractmethod
    @asynccontextmanager
    async def connect(
        self,
        params: dict[str, Any],
        connect_timeout: int = 10,
        statement_timeout_ms: int = 60_000,
    ) -> AsyncIterator[AsyncConnection]:
        """Create a single async connection."""
        yield  # type: ignore[misc]

    @abstractmethod
    @asynccontextmanager
    async def pooled_connection(
        self,
        params: dict[str, Any],
        statement_timeout_ms: int = 60_000,
        connect_timeout: int = 10,
        min_size: int = 0,
        max_size: int = 10,
    ) -> AsyncIterator[AsyncConnection]:
        """Get a connection from a pool."""
        yield  # type: ignore[misc]

    @abstractmethod
    async def chunked_read(
        self,
        params: dict[str, Any],
        query: str,
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
        params: dict[str, Any],
        connect_timeout: int = 10,
        statement_timeout_ms: int = 30_000,
    ) -> str | None:
        """Test connectivity and return version string, or None on failure."""

    async def copy_to_csv(
        self,
        params: dict[str, Any],
        query: str,
        dest_path: str | Path,
        connect_timeout: int = 10,
        statement_timeout_ms: int = 600_000,
    ) -> int:
        """COPY query results to a CSV file. Returns row count.

        Backends that don't support COPY should leave this unimplemented;
        the sync engine will fall back to chunked_read.
        """
        raise NotImplementedError

    async def execute_read_query(
        self,
        params: dict[str, Any],
        query: str,
        *,
        max_rows: int = 100,
        statement_timeout_ms: int = 30_000,
    ) -> list[dict[str, Any]]:
        """Execute a safe read-only query and return rows as dicts.

        Implementations MUST call assert_read_only(query) first.
        Postgres enforces read-only at the session level + appends LIMIT.
        BigQuery enforces read-only via assert_read_only and applies max_rows
        via row-iterator truncation.
        """
        raise NotImplementedError

    # ------------------------------------------------------------------
    # Parameter binding helpers
    # ------------------------------------------------------------------

    def new_bound_params(self) -> BoundParams:
        """Create a new empty parameter accumulator."""
        return BoundParams()

    def bind_param(
        self,
        builder: BoundParams,
        value: Any,
        name: str | None = None,
        sql_type: str | None = None,
    ) -> str:
        """Add *value* to *builder* and return the SQL placeholder string.

        Postgres default: appends raw value, returns ``%s``.
        BigQuery override: appends ``ScalarQueryParameter``, returns ``@name``.
        """
        builder._items.append(value)
        return "%s"

    def to_params(self, builder: BoundParams) -> tuple[Any, ...] | list[Any]:
        """Convert *builder* to args suitable for ``AsyncConnection.fetch_all``.

        Postgres default: returns a tuple of raw values.
        BigQuery override: returns the list of ``ScalarQueryParameter`` objects.
        """
        return tuple(builder._items)

    # ------------------------------------------------------------------
    # SQL dialect helpers
    # ------------------------------------------------------------------

    def param_placeholder(self) -> str:
        """Return the positional parameter placeholder for this dialect.

        Deprecated: use ``bind_param()`` instead. Kept for backward
        compatibility with code that hasn't migrated to ``BoundParams`` yet.
        """
        return "%s"

    def quote_identifier(self, name: str) -> str:
        """Quote a single identifier (default: ANSI double-quote)."""
        return f'"{name}"'

    def quote_table(self, schema: str, table: str) -> str:
        """Quote a schema-qualified table name."""
        return f"{self.quote_identifier(schema)}.{self.quote_identifier(table)}"

    def quote_table_id(self, table: TableId) -> str:
        """Quote a TableId. Postgres ignores project; BigQuery uses it."""
        return self.quote_table(table.schema, table.table)

    def cast_to_text(self, expr: str) -> str:
        """Cast an expression to text (default: Postgres-style ::text)."""
        return f"{expr}::text"

    def limit_clause(self, n: int) -> str:
        """Return a LIMIT clause string.

        BigQuery overrides to return ``""`` and enforces max_rows via
        row-iterator truncation in execute_read_query / chunked_read.
        """
        return f"LIMIT {n}"


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
