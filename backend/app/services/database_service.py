import logging
from typing import Any

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
from app.services.db._types import TableId

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


async def connect(conn: DatabaseConnectionRequest) -> tuple[str, str | None]:
    """Test connection and create a handle if successful.

    Returns:
        Tuple of (handle, version) where version is the database version string

    Raises:
        DatabaseServiceError: If connection fails
    """
    from app.services.db._errors import DatabaseBackendError

    store = get_connection_store()
    backend = get_backend(conn.db_type)

    try:
        params = backend.build_connection_params(conn)
    except DatabaseBackendError as e:
        raise DatabaseServiceError(str(e))

    try:
        version = await backend.test_connection(
            params,
            connect_timeout=CONNECT_TIMEOUT,
            statement_timeout_ms=QUERY_TIMEOUT_MS,
        )

        handle = store.create_handle(conn.db_type, params)
        logger.info(f"Database connection successful: {conn.db_type}")
        return handle, version

    except DatabaseBackendError as e:
        raise DatabaseServiceError(str(e))
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
            error_msg = f"Database '{getattr(conn, 'database', '')}' does not exist."
        else:
            logger.error(f"Database connection error: {e}")
            error_msg = f"Connection failed: {error_msg}"
        raise DatabaseServiceError(error_msg)


async def list_tables(handle: str) -> list[TableInfo]:
    """List tables with estimated row counts."""
    conn_info = _get_connection_info(handle)
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            conn_info.connection_params, statement_timeout_ms=QUERY_TIMEOUT_MS
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
    """Get column schema and sample values for a table."""
    conn_info = _get_connection_info(handle)
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            conn_info.connection_params, statement_timeout_ms=QUERY_TIMEOUT_MS
        ) as pg:
            if not await catalog.table_exists(pg, table.schema_name, table.name):
                raise TableNotFoundError(f"Table '{table.schema_name}.{table.name}' not found")

            column_rows = await catalog.get_columns(pg, table.schema_name, table.name)

            columns = [
                ColumnInfo(
                    name=r["column_name"],
                    data_type=r["data_type"],
                    nullable=r["is_nullable"] == "YES",
                )
                for r in column_rows
            ]

            sample_values: dict[str, list[Any]] = {}
            if columns:
                column_names = [col.name for col in columns]
                quoted_columns = ", ".join(
                    [backend.quote_identifier(name) for name in column_names]
                )
                table_id = TableId(schema=table.schema_name, table=table.name)
                quoted_table = backend.quote_table_id(table_id)

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
    """Get distinct values for a column (for filter dropdowns)."""
    conn_info = _get_connection_info(handle)
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            conn_info.connection_params, statement_timeout_ms=QUERY_TIMEOUT_MS
        ) as pg:
            missing = await catalog.validate_columns(pg, table.schema_name, table.name, [column])
            if missing:
                raise InvalidColumnError(
                    f"Column '{column}' not found in table '{table.schema_name}.{table.name}'"
                )

            table_id = TableId(schema=table.schema_name, table=table.name)
            quoted_table = backend.quote_table_id(table_id)
            quoted_column = backend.quote_identifier(column)
            cast_col = backend.cast_to_text(quoted_column)

            bp = backend.new_bound_params()
            limit_ph = backend.bind_param(bp, limit)

            rows = await pg.fetch_all(
                f"SELECT DISTINCT {cast_col} AS val FROM {quoted_table} "
                f"WHERE {quoted_column} IS NOT NULL "
                f"ORDER BY {cast_col} "
                f"LIMIT {limit_ph}",
                backend.to_params(bp),
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
    """Preview data with column mappings applied."""
    conn_info = _get_connection_info(handle)
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            conn_info.connection_params, statement_timeout_ms=QUERY_TIMEOUT_MS
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
    """Import data from database with column mappings."""
    conn_info = _get_connection_info(handle)
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            conn_info.connection_params, statement_timeout_ms=QUERY_TIMEOUT_MS
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

            if dedupe_on_id and all_data:
                id_target = None
                for m in mappings:
                    if m.target == "id":
                        id_target = "id"
                        break

                if id_target:
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

    Delegates all dialect-specific safety enforcement to the backend's
    ``execute_read_query`` method.

    Args:
        handle: Connection handle
        query: SQL query (already validated by schema — SELECT/WITH only,
               no semicolons)
        limit: Maximum rows to return
        timeout_ms: Statement timeout in milliseconds

    Returns:
        List of result dictionaries
    """
    from app.services.db._errors import DatabaseBackendError

    conn_info = _get_connection_info(handle)
    backend = get_backend(conn_info.db_type)

    try:
        rows = await backend.execute_read_query(
            conn_info.connection_params,
            query,
            max_rows=limit,
            statement_timeout_ms=timeout_ms,
        )
        return [{k: _serialize_value(v) for k, v in row.items()} for row in rows]

    except DatabaseBackendError as e:
        raise QuerySafetyError(str(e))
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
    """Preview all columns from a table (no mapping step)."""
    conn_info = _get_connection_info(handle)
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            conn_info.connection_params, statement_timeout_ms=QUERY_TIMEOUT_MS
        ) as pg:
            if filters:
                filter_columns = [f.column for f in filters]
                await _validate_columns(pg, catalog, table, filter_columns)

            qi = backend.quote_identifier
            table_id = TableId(schema=table.schema_name, table=table.name)
            quoted_table = backend.quote_table_id(table_id)

            bp = backend.new_bound_params()
            where_clause = ""
            if filters:
                conditions = []
                for f in filters:
                    ph = backend.bind_param(bp, f.value)
                    conditions.append(f"{qi(f.column)} = {ph}")
                where_clause = "WHERE " + " AND ".join(conditions)

            limit_ph = backend.bind_param(bp, limit)
            query_str = f"SELECT * FROM {quoted_table} {where_clause} LIMIT {limit_ph}"
            rows = await pg.fetch_all(query_str, backend.to_params(bp))
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
    """Import all columns from a table (no mapping step)."""
    conn_info = _get_connection_info(handle)
    backend = get_backend(conn_info.db_type)
    catalog = get_catalog(conn_info.db_type)

    try:
        async with backend.pooled_connection(
            conn_info.connection_params, statement_timeout_ms=QUERY_TIMEOUT_MS
        ) as pg:
            if filters:
                filter_columns = [f.column for f in filters]
                await _validate_columns(pg, catalog, table, filter_columns)

            qi = backend.quote_identifier
            table_id = TableId(schema=table.schema_name, table=table.name)
            quoted_table = backend.quote_table_id(table_id)

            # Build base WHERE clause params
            base_bp = backend.new_bound_params()
            where_clause = ""
            if filters:
                conditions = []
                for f in filters:
                    ph = backend.bind_param(base_bp, f.value)
                    conditions.append(f"{qi(f.column)} = {ph}")
                where_clause = "WHERE " + " AND ".join(conditions)

            all_data: list[dict[str, Any]] = []
            offset = 0

            while True:
                bp = backend.new_bound_params()
                bp._items = list(base_bp._items)  # copy filter params
                chunk_limit = min(CHUNK_SIZE, limit - len(all_data))
                limit_ph = backend.bind_param(bp, chunk_limit)
                offset_ph = backend.bind_param(bp, offset)
                query_str = (
                    f"SELECT * FROM {quoted_table} {where_clause} "
                    f"LIMIT {limit_ph} OFFSET {offset_ph}"
                )
                chunk = await pg.fetch_all(query_str, backend.to_params(bp))

                if not chunk:
                    break

                all_data.extend({k: _serialize_value(v) for k, v in row.items()} for row in chunk)
                offset += len(chunk)

                if len(all_data) >= limit:
                    break

            if dedupe_on_id and all_data:
                id_key = None
                for candidate in ("dataset_id", "id"):
                    if candidate in all_data[0]:
                        id_key = candidate
                        break
                if id_key:
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
    """Validate that all columns exist in the table."""
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
    """Execute SELECT query with mappings and filters using BoundParams."""
    qi = backend.quote_identifier
    table_id = TableId(schema=table.schema_name, table=table.name)
    quoted_table = backend.quote_table_id(table_id)

    select_parts = [f"{qi(m.source)} AS {qi(m.target)}" for m in mappings]
    select_clause = ", ".join(select_parts)

    bp = backend.new_bound_params()
    where_clause = ""
    if filters:
        conditions = []
        for f in filters:
            ph = backend.bind_param(bp, f.value)
            conditions.append(f"{qi(f.column)} = {ph}")
        where_clause = "WHERE " + " AND ".join(conditions)

    limit_ph = backend.bind_param(bp, limit)
    offset_ph = backend.bind_param(bp, offset)

    query_str = f"""
        SELECT {select_clause}
        FROM {quoted_table}
        {where_clause}
        LIMIT {limit_ph} OFFSET {offset_ph}
    """

    rows = await pg.fetch_all(query_str, backend.to_params(bp))

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
