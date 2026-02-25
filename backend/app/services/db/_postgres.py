import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, cast

import pandas as pd
import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.services.db._base import AsyncConnection, CatalogBackend, DatabaseBackend
from app.services.db._types import DatabaseType

logger = logging.getLogger(__name__)

# Defaults
DEFAULT_CONNECT_TIMEOUT = 10  # seconds
DEFAULT_STATEMENT_TIMEOUT_MS = 60_000  # 60 seconds
DEFAULT_CHUNK_SIZE = 5_000
DEFAULT_POOL_MIN_SIZE = 0
DEFAULT_POOL_MAX_SIZE = 10


# ---------------------------------------------------------------------------
# Connection wrapper
# ---------------------------------------------------------------------------


class PostgresConnection(AsyncConnection):
    """Wraps a single ``psycopg.AsyncConnection`` with dict_row."""

    def __init__(self, conn: psycopg.AsyncConnection[dict[str, Any]]) -> None:
        self._conn = conn

    async def fetch_all(
        self,
        query: str,
        params: tuple[Any, ...] | dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        async with self._conn.cursor() as cur:
            await cur.execute(query, params)
            rows = await cur.fetchall()
            return rows  # type: ignore[return-value]

    async def fetch_one(
        self,
        query: str,
        params: tuple[Any, ...] | dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        async with self._conn.cursor() as cur:
            await cur.execute(query, params)
            return await cur.fetchone()  # type: ignore[return-value]

    async def execute(
        self,
        query: str,
        params: tuple[Any, ...] | dict[str, Any] | None = None,
    ) -> None:
        async with self._conn.cursor() as cur:
            await cur.execute(query, params)

    async def commit(self) -> None:
        await self._conn.commit()

    @property
    def raw(self) -> psycopg.AsyncConnection[dict[str, Any]]:
        """Access the underlying psycopg connection for advanced use."""
        return self._conn


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_conninfo(
    url: str,
    ssl_mode: str | None = None,
    connect_timeout: int = DEFAULT_CONNECT_TIMEOUT,
    application_name: str = "axis-backend",
) -> str:
    """Build a conninfo string from a URL, appending connection options."""
    parts = [url]
    sep = "&" if "?" in url else "?"

    if connect_timeout:
        parts.append(f"{sep}connect_timeout={connect_timeout}")
        sep = "&"

    if application_name:
        parts.append(f"{sep}application_name={application_name}")
        sep = "&"

    if ssl_mode and ssl_mode != "disable":
        parts.append(f"{sep}sslmode={ssl_mode}")

    return "".join(parts)


async def _set_statement_timeout(
    conn: psycopg.AsyncConnection[Any],
    timeout_ms: int,
) -> None:
    if timeout_ms > 0:
        await conn.execute(sql.SQL("SET statement_timeout = {}").format(sql.Literal(timeout_ms)))


# ---------------------------------------------------------------------------
# PostgresBackend
# ---------------------------------------------------------------------------


class PostgresBackend(DatabaseBackend):
    """Postgres implementation of ``DatabaseBackend``."""

    def __init__(self) -> None:
        self._pools: dict[str, AsyncConnectionPool] = {}

    @property
    def db_type(self) -> DatabaseType:
        return DatabaseType.POSTGRES

    def build_url(self, config: Any) -> str:
        if getattr(config, "url", None):
            return str(config.url)
        from urllib.parse import quote_plus

        password = quote_plus(str(config.password or ""))
        user = config.username or ""
        host = config.host or "localhost"
        port = config.port or 5432
        database = config.database or ""
        return f"postgresql://{user}:{password}@{host}:{port}/{database}"

    @asynccontextmanager
    async def connect(
        self,
        url: str,
        ssl_mode: str | None = None,
        connect_timeout: int = DEFAULT_CONNECT_TIMEOUT,
        statement_timeout_ms: int = DEFAULT_STATEMENT_TIMEOUT_MS,
    ) -> AsyncIterator[PostgresConnection]:
        conninfo = _build_conninfo(url, ssl_mode, connect_timeout)
        conn = await psycopg.AsyncConnection.connect(
            conninfo,
            row_factory=dict_row,
            autocommit=True,
        )
        try:
            await _set_statement_timeout(conn, statement_timeout_ms)
            yield PostgresConnection(conn)
        finally:
            await conn.close()

    @asynccontextmanager
    async def pooled_connection(
        self,
        url: str,
        ssl_mode: str | None = None,
        statement_timeout_ms: int = DEFAULT_STATEMENT_TIMEOUT_MS,
        connect_timeout: int = DEFAULT_CONNECT_TIMEOUT,
        min_size: int = DEFAULT_POOL_MIN_SIZE,
        max_size: int = DEFAULT_POOL_MAX_SIZE,
    ) -> AsyncIterator[PostgresConnection]:
        pool = await self._get_pool(url, ssl_mode, connect_timeout, min_size, max_size)
        async with pool.connection() as raw_conn:
            conn = cast("psycopg.AsyncConnection[dict[str, Any]]", raw_conn)
            await _set_statement_timeout(conn, statement_timeout_ms)
            yield PostgresConnection(conn)

    async def chunked_read(
        self,
        url: str,
        query: str,
        ssl_mode: str | None = None,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        max_rows: int = 0,
        connect_timeout: int = DEFAULT_CONNECT_TIMEOUT,
        statement_timeout_ms: int = DEFAULT_STATEMENT_TIMEOUT_MS,
    ) -> AsyncIterator[tuple[pd.DataFrame, bool]]:
        conninfo = _build_conninfo(url, ssl_mode, connect_timeout)

        # autocommit=False required for server-side cursors
        conn = await psycopg.AsyncConnection.connect(
            conninfo,
            row_factory=dict_row,
            autocommit=False,
        )
        total_rows = 0
        try:
            await _set_statement_timeout(conn, statement_timeout_ms)

            async with conn.cursor(name="axis_sync_cursor") as cur:
                await cur.execute(query)
                while True:
                    rows = await cur.fetchmany(chunk_size)
                    if not rows:
                        break
                    df = pd.DataFrame(rows)
                    total_rows += len(df)
                    if max_rows > 0 and total_rows > max_rows:
                        excess = total_rows - max_rows
                        df = df.iloc[: len(df) - excess]
                        yield df, True
                        return
                    yield df, False
        finally:
            await conn.close()

    async def close_all_pools(self) -> None:
        for conninfo, pool in self._pools.items():
            await pool.close()
            logger.info(f"Closed connection pool for {conninfo[:40]}...")
        self._pools.clear()

    async def test_connection(
        self,
        url: str,
        ssl_mode: str | None = None,
        connect_timeout: int = DEFAULT_CONNECT_TIMEOUT,
        statement_timeout_ms: int = 30_000,
    ) -> str | None:
        async with self.connect(url, ssl_mode, connect_timeout, statement_timeout_ms) as conn:
            row = await conn.fetch_one("SELECT version()")
            return row["version"] if row else None

    async def copy_to_csv(
        self,
        url: str,
        query: str,
        dest_path: str | Path,
        ssl_mode: str | None = None,
        connect_timeout: int = DEFAULT_CONNECT_TIMEOUT,
        statement_timeout_ms: int = 600_000,
    ) -> int:
        """COPY query results to a CSV file via Postgres COPY TO STDOUT."""
        conninfo = _build_conninfo(url, ssl_mode, connect_timeout)
        async with await psycopg.AsyncConnection.connect(conninfo, autocommit=True) as raw_conn:
            conn = cast("psycopg.AsyncConnection[dict[str, Any]]", raw_conn)
            await _set_statement_timeout(conn, statement_timeout_ms)
            copy_sql = f"COPY ({query}) TO STDOUT WITH (FORMAT CSV, HEADER)"
            with Path(dest_path).open("wb") as f:
                async with conn.copy(copy_sql) as copy:  # type: ignore[attr-defined]
                    async for data in copy:
                        f.write(data)
        # Count rows (header line excluded)
        with Path(dest_path).open("rb") as f:
            row_count = sum(1 for _ in f) - 1  # subtract header
        return max(row_count, 0)

    # -- SQL dialect helpers (defaults from base class are already Postgres) --

    # -- Internal pool management --

    async def _get_pool(
        self,
        url: str,
        ssl_mode: str | None = None,
        connect_timeout: int = DEFAULT_CONNECT_TIMEOUT,
        min_size: int = DEFAULT_POOL_MIN_SIZE,
        max_size: int = DEFAULT_POOL_MAX_SIZE,
    ) -> AsyncConnectionPool:
        conninfo = _build_conninfo(url, ssl_mode, connect_timeout)

        if conninfo not in self._pools:
            pool = AsyncConnectionPool(
                conninfo=conninfo,
                min_size=min_size,
                max_size=max_size,
                kwargs={"row_factory": dict_row, "autocommit": True},
                open=False,
            )
            await pool.open()
            self._pools[conninfo] = pool
            logger.info(
                f"Created connection pool (min={min_size}, max={max_size}) " f"for {url[:40]}..."
            )

        return self._pools[conninfo]


# ---------------------------------------------------------------------------
# PostgresCatalog
# ---------------------------------------------------------------------------


class PostgresCatalog(CatalogBackend):
    """Postgres implementation of ``CatalogBackend``."""

    async def list_tables(self, conn: AsyncConnection) -> list[dict[str, Any]]:
        rows = await conn.fetch_all("""
            SELECT
                n.nspname AS schema_name,
                c.relname AS table_name,
                COALESCE(c.reltuples, 0)::bigint AS row_estimate
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r', 'v')
            AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            ORDER BY n.nspname, c.relname
        """)
        return rows

    async def table_exists(self, conn: AsyncConnection, schema: str, table: str) -> bool:
        row = await conn.fetch_one(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = %s AND table_name = %s
            )
            """,
            (schema, table),
        )
        if not row:
            return False
        return bool(next(iter(row.values())))

    async def get_columns(
        self, conn: AsyncConnection, schema: str, table: str
    ) -> list[dict[str, Any]]:
        return await conn.fetch_all(
            """
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
            """,
            (schema, table),
        )

    async def validate_columns(
        self, conn: AsyncConnection, schema: str, table: str, columns: list[str]
    ) -> set[str]:
        if not columns:
            return set()

        rows = await conn.fetch_all(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            """,
            (schema, table),
        )
        existing = {row["column_name"] for row in rows}
        return set(columns) - existing
