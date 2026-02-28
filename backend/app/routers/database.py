import contextlib
import logging
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import SecretStr

from app.config.db import get_import_config
from app.models.database_schemas import (
    ConnectResponse,
    DatabaseConnectionRequest,
    DatabaseDefaults,
    DatabaseImportRequest,
    DistinctValuesRequest,
    DistinctValuesResponse,
    PreviewRequest,
    PreviewResponse,
    QueryImportRequest,
    QueryPreviewRequest,
    TableIdentifier,
    TableSchemaResponse,
    TablesListResponse,
)
from app.models.schemas import UploadResponse
from app.routers.monitoring import MONITORING_COLUMN_NORMALIZATION
from app.services import database_service
from app.services.connection_store import get_connection_store
from app.services.data_processor import process_uploaded_data


def _normalize_monitoring_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names using monitoring column mapping."""
    rename_map = {}
    for col in df.columns:
        normalized = col.lower().strip().replace(" ", "_").replace("-", "_")
        if normalized in MONITORING_COLUMN_NORMALIZATION:
            target = MONITORING_COLUMN_NORMALIZATION[normalized]
            if target != col:  # Only rename if different
                rename_map[col] = target
    if rename_map:
        df = df.rename(columns=rename_map)
    return df


# Canonical columns that indicate usable data
_USABLE_COLUMNS = {
    "query",
    "dataset_id",
    "metric_name",
    "metric_score",
    "actual_output",
    "evaluation_name",
}

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/defaults", response_model=DatabaseDefaults)
async def get_defaults(
    store: str = Query(
        default="data", description="Target store: data, monitoring, or human_signals"
    ),
) -> DatabaseDefaults:
    """Get default database connection values from YAML config or env vars.

    YAML config > env vars > hardcoded defaults.
    """
    try:
        cfg = get_import_config(store)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown store: {store!r}. Valid stores: data, monitoring, human_signals",
        )

    has_defaults = cfg.is_configured

    # Build the query field: prefer dataset_query (used for auto-load split queries)
    query = cfg.dataset_query

    # Resolve connection fields: prefer explicit fields, fall back to parsing URL.
    # The URL itself is NEVER sent to the frontend (it contains the password).
    host = cfg.host
    port = cfg.port
    database = cfg.database
    username = cfg.username
    has_password = bool(cfg.password)
    ssl_mode = cfg.ssl_mode

    if cfg.url and not host:
        # Parse non-sensitive parts out of the connection URL
        from urllib.parse import parse_qs, urlparse

        try:
            parsed = urlparse(cfg.url)
            host = parsed.hostname or host
            port = parsed.port or port
            database = (parsed.path or "").lstrip("/") or database
            username = parsed.username or username
            has_password = has_password or bool(parsed.password)
            qs_ssl = parse_qs(parsed.query).get("sslmode")
            if qs_ssl:
                ssl_mode = qs_ssl[0]
        except Exception:
            pass  # Fall back to whatever fields we already have

    return DatabaseDefaults(
        url=None,  # Never expose the URL
        host=host,
        port=port,
        database=database,
        username=username,
        has_password=has_password,
        ssl_mode=ssl_mode,
        table=None,  # Table is selected interactively now
        has_defaults=has_defaults,
        tables=cfg.tables,
        filters=cfg.filters,
        column_rename_map=cfg.column_rename_map,
        query=query,
        query_timeout=cfg.query_timeout,
        row_limit=cfg.row_limit,
    )


_PASSWORD_SENTINEL = "********"


@router.post("/connect", response_model=ConnectResponse)
async def connect_database(
    request: DatabaseConnectionRequest,
    store: str = Query(default="data", description="Target store for credential lookup"),
) -> ConnectResponse:
    """Test database connection and return a handle for subsequent requests.

    The handle is valid for 15 minutes and can be used to browse tables,
    preview data, and import data without re-sending credentials.

    If the password is the sentinel '********', the real password is
    substituted from the server-side config for the given store.
    """
    # Substitute sentinel password with real config password
    if request.password.get_secret_value() == _PASSWORD_SENTINEL:
        try:
            cfg = get_import_config(store)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown store: {store!r}",
            )

        # Resolve password: prefer explicit field, fall back to URL
        real_password = cfg.password
        if not real_password and cfg.url:
            from urllib.parse import urlparse

            with contextlib.suppress(Exception):
                real_password = urlparse(cfg.url).password

        if not real_password:
            raise HTTPException(
                status_code=400,
                detail="No password configured on the server. Please enter one manually.",
            )
        request = request.model_copy(update={"password": SecretStr(real_password)})

    try:
        handle, version = await database_service.connect(request)
        return ConnectResponse(
            success=True,
            handle=handle,
            message="Connection successful",
            version=version,
        )
    except database_service.DatabaseServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        # Rate limit exceeded
        raise HTTPException(status_code=429, detail=str(e))
    except Exception:
        logger.exception("Unexpected error during database connection")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again.",
        )


@router.get("/{handle}/tables", response_model=TablesListResponse)
async def list_tables(handle: str) -> TablesListResponse:
    """List available tables in the connected database.

    Returns table names with schema and estimated row counts.
    """
    try:
        tables = await database_service.list_tables(handle)
        return TablesListResponse(success=True, tables=tables)
    except database_service.ConnectionExpiredError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except database_service.DatabaseServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected error listing tables")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again.",
        )


@router.get("/{handle}/schema", response_model=TableSchemaResponse)
async def get_table_schema(
    handle: str,
    schema_name: str = Query(default="public", alias="schema"),
    name: str = Query(..., alias="table"),
) -> TableSchemaResponse:
    """Get column schema and sample values for a table.

    Returns column names, types, nullability, and sample values (first 5 rows).
    """
    try:
        table = TableIdentifier(schema_name=schema_name, name=name)
        return await database_service.get_schema(handle, table)
    except database_service.ConnectionExpiredError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except database_service.TableNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except database_service.DatabaseServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected error getting table schema")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again.",
        )


@router.post("/{handle}/distinct-values", response_model=DistinctValuesResponse)
async def get_distinct_values(
    handle: str,
    request: DistinctValuesRequest,
) -> DistinctValuesResponse:
    """Get distinct values for a column (for filter dropdowns)."""
    try:
        values = await database_service.get_distinct_values(
            handle, request.table, request.column, request.limit
        )
        return DistinctValuesResponse(success=True, values=values)
    except database_service.ConnectionExpiredError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except database_service.InvalidColumnError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except database_service.DatabaseServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected error getting distinct values")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again.",
        )


@router.post("/{handle}/preview", response_model=PreviewResponse)
async def preview_data(
    handle: str,
    request: PreviewRequest,
) -> PreviewResponse:
    """Preview data with optional column mappings.

    If mappings are provided, applies them (legacy behavior).
    If mappings are None, returns all columns as-is.
    """
    try:
        if request.mappings:
            data = await database_service.preview_data(
                handle,
                request.table,
                request.mappings,
                request.filters,
                request.limit,
            )
        else:
            data = await database_service.preview_data_all_columns(
                handle,
                request.table,
                request.filters,
                request.limit,
            )
        return PreviewResponse(
            success=True,
            data=data,
            row_count=len(data),
        )
    except database_service.ConnectionExpiredError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except database_service.InvalidColumnError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except database_service.DatabaseServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected error previewing data")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again.",
        )


@router.post("/{handle}/query", response_model=PreviewResponse)
async def query_preview(
    handle: str,
    request: QueryPreviewRequest,
) -> PreviewResponse:
    """Preview results of a SQL query.

    Only SELECT queries are allowed. The session is forced read-only.
    """
    try:
        data = await database_service.execute_query(handle, request.query, request.limit)
        return PreviewResponse(
            success=True,
            data=data,
            row_count=len(data),
        )
    except database_service.ConnectionExpiredError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except database_service.DatabaseServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected error executing query preview")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again.",
        )


@router.post("/{handle}/query-import", response_model=UploadResponse)
async def query_import(
    handle: str,
    request: QueryImportRequest,
) -> UploadResponse:
    """Import data from a SQL query.

    Only SELECT queries are allowed. The session is forced read-only.
    Applies column_rename_map from config if available.
    """
    if request.handle != handle:
        raise HTTPException(
            status_code=400,
            detail="Handle in URL must match handle in request body",
        )

    try:
        data = await database_service.execute_query(handle, request.query, request.limit)
        return _process_import_data(data, "sql_query")

    except database_service.ConnectionExpiredError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except database_service.DatabaseServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected error importing query data")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again.",
        )


@router.post("/{handle}/import", response_model=UploadResponse)
async def import_data(
    handle: str,
    request: DatabaseImportRequest,
) -> UploadResponse:
    """Import data from database into AXIS.

    Returns the same response format as CSV upload for consistency.
    If mappings are provided, uses them. Otherwise imports all columns.
    """
    # Validate handle matches request
    if request.handle != handle:
        raise HTTPException(
            status_code=400,
            detail="Handle in URL must match handle in request body",
        )

    try:
        if request.mappings:
            data = await database_service.import_data(
                handle,
                request.table,
                request.mappings,
                request.filters,
                request.limit,
                request.dedupe_on_id,
            )
        else:
            data = await database_service.import_data_all_columns(
                handle,
                request.table,
                request.filters,
                request.limit,
                request.dedupe_on_id,
            )

        source = f"{request.table.schema_name}.{request.table.name}"
        return _process_import_data(data, source)

    except database_service.ConnectionExpiredError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except database_service.InvalidColumnError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except database_service.DatabaseServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected error importing data")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again.",
        )


@router.delete("/{handle}")
async def disconnect(handle: str) -> dict[str, Any]:
    """Explicitly disconnect and invalidate a connection handle.

    This is optional - handles automatically expire after 15 minutes.
    """
    store = get_connection_store()
    deleted = store.delete_handle(handle)
    if deleted:
        return {"success": True, "message": "Connection closed"}
    else:
        return {"success": False, "message": "Handle not found or already expired"}


@router.get("/stats")
async def get_connection_stats() -> dict[str, Any]:
    """Get connection pool statistics (for monitoring)."""
    store = get_connection_store()
    return store.get_stats()


def _process_import_data(data: list[dict[str, Any]], source: str) -> UploadResponse:
    """Shared processing for table imports and query imports."""
    if not data:
        return UploadResponse(
            success=True,
            format="database_import",
            row_count=0,
            columns=[],
            preview=[],
            data=[],
            message="No data found matching the specified criteria",
        )

    df = pd.DataFrame(data)

    # Apply column_rename_map from config (if the store config has one)
    # This is applied before standard processing so renamed columns are recognized
    try:
        cfg = get_import_config("data")
        if cfg.column_rename_map:
            applicable = {k: v for k, v in cfg.column_rename_map.items() if k in df.columns}
            if applicable:
                df = df.rename(columns=applicable)
    except ValueError:
        pass

    # Process through standard pipeline
    processed_df, format_type, message = process_uploaded_data(df)

    if processed_df is None:
        processed_df = df

    # Apply monitoring column normalization
    processed_df = _normalize_monitoring_columns(processed_df)

    # Pre-import validation: warn if no usable columns found
    result_cols = set(processed_df.columns)
    has_usable = bool(result_cols & _USABLE_COLUMNS)
    warning = ""
    if not has_usable:
        warning = (
            " Warning: no canonical columns (query, dataset_id, metric_name, "
            "metric_score) detected. Data may need custom downstream processing."
        )

    # Clean NaN values
    processed_df = _clean_nan_values(processed_df)

    records: list[dict[str, Any]] = processed_df.to_dict(orient="records")  # type: ignore[assignment]

    if records:
        logger.info(f"DB import - sample record keys: {list(records[0].keys())}")

    logger.info(f"Successfully imported {len(records)} rows from {source}")

    base_message = message or f"Imported {len(records)} rows from database"

    return UploadResponse(
        success=True,
        format=format_type or "database_import",
        row_count=len(records),
        columns=list(processed_df.columns),
        preview=records[:10],
        data=records,
        message=f"{base_message}{warning}",
    )


def _clean_nan_values(df: pd.DataFrame) -> pd.DataFrame:
    """Replace NaN/None values with None for JSON serialization."""
    return df.where(pd.notnull(df), None)  # type: ignore[return-value,call-overload,no-any-return,arg-type]
