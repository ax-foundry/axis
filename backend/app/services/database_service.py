import logging
from typing import Any
from urllib.parse import quote_plus

from app.models.database_schemas import (
    ColumnInfo,
    ColumnMapping,
    DatabaseConnectionRequest,
    FilterCondition,
    TableIdentifier,
    TableInfo,
    TableSchemaResponse,
)
from app.services.connection_store import ConnectionInfo, get_connection_store
from app.services.db import get_backend, get_catalog

logger = logging.getLogger(__name__)

# Connection timeouts
CONNECT_TIMEOUT = 10  # seconds
QUERY_TIMEOUT = 30  # seconds
QUERY_TIMEOUT_MS = QUERY_TIMEOUT * 1000

# Chunk size for streaming imports
CHUNK_SIZE = 1000


class DatabaseServiceError(Exception):
    """Base exception for database service errors."""

    pass


class ConnectionExpiredError(DatabaseServiceError):
    """Raised when a connection handle has expired."""

    pass


class TableNotFoundError(DatabaseServiceError):
    """Raised when a table is not found."""

    pass


class InvalidColumnError(DatabaseServiceError):
    """Raised when an invalid column is referenced."""

    pass


def _get_connection_info(handle: str) -> ConnectionInfo:
    """Get connection info for a handle, raising if expired or not found."""
    store = get_connection_store()
    info = store.get_connection(handle)
    if info is None:
        raise ConnectionExpiredError(
            "Connection handle has expired or is invalid. Please reconnect."
        )
    return info


def _build_url(conn_info: ConnectionInfo) -> str:
    """Build a connection URL from ConnectionInfo."""
    encoded_password = quote_plus(conn_info.password)
    # For Postgres the URL scheme is postgresql://; other backends will
    # override build_url() entirely, but for the table-browser path we
    # build URLs from stored credentials.
    return (
        f"postgresql://{conn_info.username}:{encoded_password}"
        f"@{conn_info.host}:{conn_info.port}/{conn_info.database}"
    )


async def connect(conn: DatabaseConnectionRequest) -> tuple[str, str | None]:
    """Test connection and create a handle if successful.

    Args:
        conn: Database connection request

    Returns:
        Tuple of (handle, version) where version is the database version string

    Raises:
        DatabaseServiceError: If connection fails
    """
    store = get_connection_store()
    backend = get_backend(conn.db_type)

    encoded_password = quote_plus(conn.password.get_secret_value())
    url = (
        f"postgresql://{conn.username}:{encoded_password}"
        f"@{conn.host}:{conn.port}/{conn.database}"
    )
    ssl_mode = conn.ssl_mode.value if conn.ssl_mode.value != "disable" else None

    try:
        version = await backend.test_connection(
            url,
            ssl_mode=ssl_mode,
            connect_timeout=CONNECT_TIMEOUT,
            statement_timeout_ms=QUERY_TIMEOUT_MS,
        )

        handle = store.create_handle(
            host=conn.host,
            port=conn.port,
            database=conn.database,
            username=conn.username,
            password=conn.password.get_secret_value(),
            ssl_mode=conn.ssl_mode.value,
            db_type=conn.db_type,
        )

        logger.info(f"Database connection successful: {conn.database}")
        return handle, version

    except TimeoutError:
        raise DatabaseServiceError(
            f"Connection timed out after {CONNECT_TIMEOUT} seconds. "
            "Please verify the host is reachable from this server."
        )
    except Exception as e:
        error_msg = str(e)
        if "password" in error_msg.lower():
            error_msg = "Authentication failed. Please check your credentials."
        elif "could not connect" in error_msg.lower() or "connection refused" in error_msg.lower():
            error_msg = (
                "Could not connect to database. Please verify: "
                "1) Host and port are correct, "
                "2) Database is running and accepting connections, "
                "3) Firewall allows connections from this server."
            )
        elif "does not exist" in error_msg.lower():
            error_msg = f"Database '{conn.database}' does not exist."
        else:
            logger.error(f"Database connection error: {e}")
            error_msg = f"Connection failed: {error_msg}"
        raise DatabaseServiceError(error_msg)


async def list_tables(handle: str) -> list[TableInfo]:
    """List tables with estimated row counts.

    Args:
        handle: Connection handle

    Returns:
        List of table information

    Raises:
        ConnectionExpiredError: If handle is invalid or expired
    """
    conn_info = _get_connection_info(handle)
    url = _build_url(conn_info)
    ssl = conn_info.ssl_mode if conn_info.ssl_mode != "disable" else None
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            url, ssl_mode=ssl, statement_timeout_ms=QUERY_TIMEOUT_MS
        ) as pg:
            rows = await catalog.list_tables(pg)

            tables = [
                TableInfo(
                    schema_name=row["schema_name"],
                    name=row["table_name"],
                    row_count_estimate=max(0, int(row["row_estimate"])),
                )
                for row in rows
            ]

            logger.debug(f"Found {len(tables)} tables/views for handle {handle[:8]}...")
            return tables

    except Exception as e:
        logger.error(f"Error listing tables: {e}")
        raise DatabaseServiceError(f"Failed to list tables/views: {e}")


async def get_schema(handle: str, table: TableIdentifier) -> TableSchemaResponse:
    """Get column schema and sample values for a table.

    Args:
        handle: Connection handle
        table: Table identifier

    Returns:
        Table schema response with columns and sample values

    Raises:
        ConnectionExpiredError: If handle is invalid or expired
        TableNotFoundError: If table doesn't exist
    """
    conn_info = _get_connection_info(handle)
    url = _build_url(conn_info)
    ssl = conn_info.ssl_mode if conn_info.ssl_mode != "disable" else None
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            url, ssl_mode=ssl, statement_timeout_ms=QUERY_TIMEOUT_MS
        ) as pg:
            # Verify table exists
            if not await catalog.table_exists(pg, table.schema_name, table.name):
                raise TableNotFoundError(f"Table '{table.schema_name}.{table.name}' not found")

            # Get column information
            column_rows = await catalog.get_columns(pg, table.schema_name, table.name)

            columns = [
                ColumnInfo(
                    name=r["column_name"],
                    data_type=r["data_type"],
                    nullable=r["is_nullable"] == "YES",
                )
                for r in column_rows
            ]

            # Get sample values (first 5 rows)
            sample_values: dict[str, list[Any]] = {}
            if columns:
                column_names = [col.name for col in columns]
                quoted_columns = ", ".join(
                    [backend.quote_identifier(name) for name in column_names]
                )
                quoted_table = backend.quote_table(table.schema_name, table.name)

                sample_rows = await pg.fetch_all(
                    f"SELECT {quoted_columns} FROM {quoted_table} LIMIT 5"
                )

                for col in columns:
                    sample_values[col.name] = [_serialize_value(r[col.name]) for r in sample_rows]

            return TableSchemaResponse(
                success=True,
                columns=columns,
                sample_values=sample_values,
            )

    except TableNotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting schema: {e}")
        raise DatabaseServiceError(f"Failed to get table schema: {e}")


async def get_distinct_values(
    handle: str, table: TableIdentifier, column: str, limit: int = 100
) -> list[str]:
    """Get distinct values for a column (for filter dropdowns).

    Args:
        handle: Connection handle
        table: Table identifier
        column: Column name
        limit: Maximum values to return

    Returns:
        List of distinct values as strings

    Raises:
        ConnectionExpiredError: If handle is invalid or expired
        InvalidColumnError: If column doesn't exist
    """
    conn_info = _get_connection_info(handle)
    url = _build_url(conn_info)
    ssl = conn_info.ssl_mode if conn_info.ssl_mode != "disable" else None
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            url, ssl_mode=ssl, statement_timeout_ms=QUERY_TIMEOUT_MS
        ) as pg:
            # Verify column exists
            missing = await catalog.validate_columns(pg, table.schema_name, table.name, [column])
            if missing:
                raise InvalidColumnError(
                    f"Column '{column}' not found in table '{table.schema_name}.{table.name}'"
                )

            # Get distinct values
            quoted_table = backend.quote_table(table.schema_name, table.name)
            quoted_column = backend.quote_identifier(column)
            cast_col = backend.cast_to_text(quoted_column)
            ph = backend.param_placeholder()

            rows = await pg.fetch_all(
                f"SELECT DISTINCT {cast_col} AS val FROM {quoted_table} "
                f"WHERE {quoted_column} IS NOT NULL "
                f"ORDER BY {cast_col} "
                f"LIMIT {ph}",
                (limit,),
            )

            return [str(r["val"]) for r in rows]

    except InvalidColumnError:
        raise
    except Exception as e:
        logger.error(f"Error getting distinct values: {e}")
        raise DatabaseServiceError(f"Failed to get distinct values: {e}")


async def preview_data(
    handle: str,
    table: TableIdentifier,
    mappings: list[ColumnMapping],
    filters: list[FilterCondition] | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Preview data with column mappings applied.

    Args:
        handle: Connection handle
        table: Table identifier
        mappings: Column mappings to apply
        filters: Optional filter conditions
        limit: Number of rows to preview

    Returns:
        List of dictionaries with mapped column names

    Raises:
        ConnectionExpiredError: If handle is invalid or expired
        InvalidColumnError: If a mapped column doesn't exist
    """
    conn_info = _get_connection_info(handle)
    url = _build_url(conn_info)
    ssl = conn_info.ssl_mode if conn_info.ssl_mode != "disable" else None
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            url, ssl_mode=ssl, statement_timeout_ms=QUERY_TIMEOUT_MS
        ) as pg:
            source_columns = [m.source for m in mappings]
            await _validate_columns(pg, catalog, table, source_columns)

            if filters:
                filter_columns = [f.column for f in filters]
                await _validate_columns(pg, catalog, table, filter_columns)

            return await _execute_select(pg, backend, table, mappings, filters, limit)

    except InvalidColumnError:
        raise
    except Exception as e:
        logger.error(f"Error previewing data: {e}")
        raise DatabaseServiceError(f"Failed to preview data: {e}")


async def import_data(
    handle: str,
    table: TableIdentifier,
    mappings: list[ColumnMapping],
    filters: list[FilterCondition] | None = None,
    limit: int = 10000,
    dedupe_on_id: bool = True,
) -> list[dict[str, Any]]:
    """Import data from database with column mappings.

    Args:
        handle: Connection handle
        table: Table identifier
        mappings: Column mappings to apply
        filters: Optional filter conditions
        limit: Maximum rows to import
        dedupe_on_id: Whether to deduplicate by id column

    Returns:
        List of dictionaries with mapped column names

    Raises:
        ConnectionExpiredError: If handle is invalid or expired
        InvalidColumnError: If a mapped column doesn't exist
    """
    conn_info = _get_connection_info(handle)
    url = _build_url(conn_info)
    ssl = conn_info.ssl_mode if conn_info.ssl_mode != "disable" else None
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            url, ssl_mode=ssl, statement_timeout_ms=QUERY_TIMEOUT_MS
        ) as pg:
            source_columns = [m.source for m in mappings]
            await _validate_columns(pg, catalog, table, source_columns)

            if filters:
                filter_columns = [f.column for f in filters]
                await _validate_columns(pg, catalog, table, filter_columns)

            all_data: list[dict[str, Any]] = []
            offset = 0

            while True:
                chunk = await _execute_select(
                    pg,
                    backend,
                    table,
                    mappings,
                    filters,
                    min(CHUNK_SIZE, limit - len(all_data)),
                    offset,
                )

                if not chunk:
                    break

                all_data.extend(chunk)
                offset += len(chunk)

                if len(all_data) >= limit:
                    break

            # Apply deduplication if requested
            if dedupe_on_id and all_data:
                id_target = None
                for m in mappings:
                    if m.target == "id":
                        id_target = "id"
                        break

                if id_target:
                    # Long format: dedup on (id, metric_name) to keep all metrics
                    has_metric_name = "metric_name" in all_data[0]
                    seen_ids: set[Any] = set()
                    deduped_data: list[dict[str, Any]] = []
                    for row in all_data:
                        dedup_key: Any
                        if has_metric_name:
                            dedup_key = (row.get(id_target), row.get("metric_name"))
                        else:
                            dedup_key = row.get(id_target)
                        if dedup_key not in seen_ids:
                            seen_ids.add(dedup_key)
                            deduped_data.append(row)
                    all_data = deduped_data

            logger.info(
                f"Imported {len(all_data)} rows from "
                f"{table.schema_name}.{table.name} (handle {handle[:8]}...)"
            )

            return all_data

    except InvalidColumnError:
        raise
    except Exception as e:
        logger.error(f"Error importing data: {e}")
        raise DatabaseServiceError(f"Failed to import data: {e}")


class QuerySafetyError(DatabaseServiceError):
    """Raised when a query violates safety constraints."""

    pass


async def execute_query(
    handle: str,
    query: str,
    limit: int = 10,
    timeout_ms: int = 60000,
) -> list[dict[str, Any]]:
    """Execute an arbitrary SELECT query with safety guards.

    Safety layers:
    1. Session-level read-only mode
    2. Session-level statement timeout
    3. Single-statement enforcement (done at schema validation)
    4. LIMIT appended to query

    Args:
        handle: Connection handle
        query: SQL query (already validated by schema)
        limit: Maximum rows to return
        timeout_ms: Statement timeout in milliseconds

    Returns:
        List of result dictionaries
    """
    conn_info = _get_connection_info(handle)
    url = _build_url(conn_info)
    ssl = conn_info.ssl_mode if conn_info.ssl_mode != "disable" else None
    backend = get_backend(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            url, ssl_mode=ssl, statement_timeout_ms=timeout_ms
        ) as pg:
            # Layer 2: Session-level read-only + timeout
            await pg.execute("SET default_transaction_read_only = on")
            await pg.execute(f"SET statement_timeout = '{timeout_ms}'")

            # Append LIMIT (query already has trailing ; stripped by schema validator)
            ph = backend.param_placeholder()
            limited_query = f"{query} LIMIT {ph}"

            rows = await pg.fetch_all(limited_query, (limit,))
            return [{k: _serialize_value(v) for k, v in row.items()} for row in rows]

    except QuerySafetyError:
        raise
    except Exception as e:
        logger.error(f"Error executing query: {e}")
        raise DatabaseServiceError(f"Query execution failed: {e}")


async def preview_data_all_columns(
    handle: str,
    table: TableIdentifier,
    filters: list[FilterCondition] | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Preview all columns from a table (no mapping step).

    Args:
        handle: Connection handle
        table: Table identifier
        filters: Optional filter conditions
        limit: Number of rows to preview

    Returns:
        List of raw dictionaries with all columns
    """
    conn_info = _get_connection_info(handle)
    url = _build_url(conn_info)
    ssl = conn_info.ssl_mode if conn_info.ssl_mode != "disable" else None
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            url, ssl_mode=ssl, statement_timeout_ms=QUERY_TIMEOUT_MS
        ) as pg:
            if filters:
                filter_columns = [f.column for f in filters]
                await _validate_columns(pg, catalog, table, filter_columns)

            qi = backend.quote_identifier
            ph = backend.param_placeholder()
            quoted_table = backend.quote_table(table.schema_name, table.name)

            where_clause = ""
            params: list[Any] = []
            if filters:
                conditions = []
                for f in filters:
                    conditions.append(f"{qi(f.column)} = {ph}")
                    params.append(f.value)
                where_clause = "WHERE " + " AND ".join(conditions)

            params.append(limit)
            query_str = f"SELECT * FROM {quoted_table} {where_clause} LIMIT {ph}"
            rows = await pg.fetch_all(query_str, tuple(params))
            return [{k: _serialize_value(v) for k, v in row.items()} for row in rows]

    except InvalidColumnError:
        raise
    except Exception as e:
        logger.error(f"Error previewing data (all columns): {e}")
        raise DatabaseServiceError(f"Failed to preview data: {e}")


async def import_data_all_columns(
    handle: str,
    table: TableIdentifier,
    filters: list[FilterCondition] | None = None,
    limit: int = 10000,
    dedupe_on_id: bool = True,
) -> list[dict[str, Any]]:
    """Import all columns from a table (no mapping step).

    Args:
        handle: Connection handle
        table: Table identifier
        filters: Optional filter conditions
        limit: Maximum rows to import
        dedupe_on_id: Whether to deduplicate by dataset_id or id column

    Returns:
        List of raw dictionaries
    """
    conn_info = _get_connection_info(handle)
    url = _build_url(conn_info)
    ssl = conn_info.ssl_mode if conn_info.ssl_mode != "disable" else None
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            url, ssl_mode=ssl, statement_timeout_ms=QUERY_TIMEOUT_MS
        ) as pg:
            if filters:
                filter_columns = [f.column for f in filters]
                await _validate_columns(pg, catalog, table, filter_columns)

            qi = backend.quote_identifier
            ph = backend.param_placeholder()
            quoted_table = backend.quote_table(table.schema_name, table.name)

            where_clause = ""
            base_params: list[Any] = []
            if filters:
                conditions = []
                for f in filters:
                    conditions.append(f"{qi(f.column)} = {ph}")
                    base_params.append(f.value)
                where_clause = "WHERE " + " AND ".join(conditions)

            all_data: list[dict[str, Any]] = []
            offset = 0

            while True:
                chunk_limit = min(CHUNK_SIZE, limit - len(all_data))
                params = [*base_params, chunk_limit, offset]
                query_str = f"SELECT * FROM {quoted_table} {where_clause} LIMIT {ph} OFFSET {ph}"
                chunk = await pg.fetch_all(query_str, tuple(params))

                if not chunk:
                    break

                all_data.extend({k: _serialize_value(v) for k, v in row.items()} for row in chunk)
                offset += len(chunk)

                if len(all_data) >= limit:
                    break

            # Deduplicate
            if dedupe_on_id and all_data:
                id_key = None
                for candidate in ("dataset_id", "id"):
                    if candidate in all_data[0]:
                        id_key = candidate
                        break
                if id_key:
                    # Long format (metric_name column): dedup on (id, metric_name)
                    # to preserve one row per metric per record.
                    has_metric_name = "metric_name" in all_data[0]
                    seen: set[Any] = set()
                    deduped: list[dict[str, Any]] = []
                    for row in all_data:
                        dedup_key: Any
                        if has_metric_name:
                            dedup_key = (row.get(id_key), row.get("metric_name"))
                        else:
                            dedup_key = row.get(id_key)
                        if dedup_key not in seen:
                            seen.add(dedup_key)
                            deduped.append(row)
                    all_data = deduped

            logger.info(
                f"Imported {len(all_data)} rows (all columns) from "
                f"{table.schema_name}.{table.name} (handle {handle[:8]}...)"
            )
            return all_data

    except InvalidColumnError:
        raise
    except Exception as e:
        logger.error(f"Error importing data (all columns): {e}")
        raise DatabaseServiceError(f"Failed to import data: {e}")


async def _validate_columns(
    pg: Any,
    catalog: Any,
    table: TableIdentifier,
    columns: list[str],
) -> None:
    """Validate that all columns exist in the table.

    Raises:
        InvalidColumnError: If any column doesn't exist
    """
    if not columns:
        return

    missing = await catalog.validate_columns(pg, table.schema_name, table.name, columns)
    if missing:
        raise InvalidColumnError(f"Columns not found in table: {', '.join(sorted(missing))}")


async def _execute_select(
    pg: Any,
    backend: Any,
    table: TableIdentifier,
    mappings: list[ColumnMapping],
    filters: list[FilterCondition] | None,
    limit: int,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Execute SELECT query with mappings and filters.

    Returns data with target column names from mappings.
    """
    qi = backend.quote_identifier
    ph = backend.param_placeholder()

    # Build column selection with aliases
    select_parts = [f"{qi(m.source)} AS {qi(m.target)}" for m in mappings]
    select_clause = ", ".join(select_parts)

    # Build WHERE clause with parameterized filters
    where_clause = ""
    params: list[Any] = []
    if filters:
        conditions = []
        for f in filters:
            conditions.append(f"{qi(f.column)} = {ph}")
            params.append(f.value)
        where_clause = "WHERE " + " AND ".join(conditions)

    params.extend([limit, offset])

    quoted_table = backend.quote_table(table.schema_name, table.name)
    query_str = f"""
        SELECT {select_clause}
        FROM {quoted_table}
        {where_clause}
        LIMIT {ph} OFFSET {ph}
    """

    rows = await pg.fetch_all(query_str, tuple(params))

    # Map dict keys to target names (dict_row already uses alias names)
    target_names = [m.target for m in mappings]
    return [{col: _serialize_value(row.get(col)) for col in target_names} for row in rows]


def _serialize_value(value: Any) -> Any:
    """Serialize a database value to JSON-compatible format."""
    if value is None:
        return None
    if isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, list | dict):
        return value
    return str(value)
