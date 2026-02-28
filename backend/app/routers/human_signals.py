import asyncio
import io
import json
import logging
from pathlib import Path
from typing import Any

import anyio
import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.duckdb_store import get_store
from app.services.human_signals_service import (
    aggregate_cases,
    build_metric_schema,
    detect_signals_format,
    detect_source_fields,
)
from app.services.signals_display_config import generate_display_config

logger = logging.getLogger(__name__)

router = APIRouter()


def clean_nan_values(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Clean values that can't be JSON-serialized (NaN, inf, numpy arrays)."""
    for record in records:
        for key, value in record.items():
            if isinstance(value, float) and (np.isnan(value) or np.isinf(value)):
                record[key] = None
            elif isinstance(value, np.ndarray):
                record[key] = value.tolist()
            elif isinstance(value, np.integer):
                record[key] = int(value)
            elif isinstance(value, np.floating):
                if np.isnan(value) or np.isinf(value):
                    record[key] = None
                else:
                    record[key] = float(value)
            elif isinstance(value, np.bool_):
                record[key] = bool(value)
    return records


def process_human_signals_data(
    df: pd.DataFrame,
) -> tuple[list[dict[str, Any]], str, str, dict[str, Any] | None, dict[str, Any] | None]:
    """Process uploaded human signals data.

    Returns: (records, format_type, message, metric_schema, display_config)
    """
    if df.empty:
        return [], "unknown", "Empty dataset", None, None

    if not detect_signals_format(df):
        return (
            [],
            "unknown",
            "Data does not appear to be in signals format. "
            "Required columns: metric_name, dataset_id, signals",
            None,
            None,
        )

    if not detect_source_fields(df):
        return (
            [],
            "unknown",
            "Data is missing required source fields (source_name). "
            "Please ensure source_name is present.",
            None,
            None,
        )

    metric_schema = build_metric_schema(df)
    display_config = generate_display_config(metric_schema)
    cases = aggregate_cases(df)
    cases = clean_nan_values(cases)
    return (
        cases,
        "hitl_feedback",
        f"Processed {len(cases)} cases",
        metric_schema,
        display_config,
    )


def _build_response(
    data_records: list[dict[str, Any]],
    format_type: str,
    message: str,
    metric_schema: dict[str, Any] | None,
    display_config: dict[str, Any] | None,
    source: str | None = None,
) -> dict[str, Any]:
    """Build a consistent response dict."""
    columns = list(data_records[0].keys()) if data_records else []
    response: dict[str, Any] = {
        "success": True,
        "format": format_type,
        "row_count": len(data_records),
        "columns": columns,
        "data": data_records,
        "message": message,
    }
    if metric_schema is not None:
        response["metric_schema"] = metric_schema
    if display_config is not None:
        response["display_config"] = display_config
    if source:
        response["source"] = source
    return response


@router.post("/upload")
async def upload_human_signals(file: UploadFile = File(...)) -> dict[str, Any]:
    """Upload and process a human signals CSV file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    try:
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))

        data_records, format_type, message, metric_schema, display_config = (
            process_human_signals_data(df)
        )

        if format_type == "unknown":
            raise HTTPException(status_code=400, detail=message)

        return _build_response(data_records, format_type, message, metric_schema, display_config)

    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="Empty CSV file")
    except pd.errors.ParserError as e:
        raise HTTPException(status_code=400, detail=f"CSV parsing error: {e!s}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Human signals upload error")
        raise HTTPException(status_code=500, detail=f"Processing error: {e!s}")


@router.get("/example/{dataset_name}")
async def get_example_human_signals_dataset(dataset_name: str) -> dict[str, Any]:
    """Load an example human signals dataset."""
    example_files = {
        "hitl": "sample_data/human_signals_sample.csv",
    }

    if dataset_name not in example_files:
        raise HTTPException(
            status_code=404,
            detail=f"Dataset not found. Available: {list(example_files.keys())}",
        )

    try:
        base_path = Path(__file__).parent.parent.parent
        file_path = base_path / example_files[dataset_name]

        if not file_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Example file not found: {example_files[dataset_name]}",
            )

        df = pd.read_csv(file_path)
        data_records, format_type, message, metric_schema, display_config = (
            process_human_signals_data(df)
        )

        if format_type == "unknown":
            raise HTTPException(status_code=400, detail=message)

        return _build_response(data_records, format_type, message, metric_schema, display_config)

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Example file not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Example dataset loading error")
        raise HTTPException(status_code=500, detail=f"Loading error: {e!s}")


# ============================================
# Database Auto-Connect Endpoints
# ============================================


@router.get("/db-config")
async def get_human_signals_db_config() -> dict[str, Any]:
    """Get the human signals database configuration."""
    from app.config.db.human_signals import human_signals_db_config

    return {
        "success": True,
        "configured": human_signals_db_config.is_configured,
        "auto_connect": human_signals_db_config.auto_connect
        and human_signals_db_config.is_configured,
        "auto_load": human_signals_db_config.should_auto_load,
        "has_query": human_signals_db_config.has_query,
        "row_limit": human_signals_db_config.row_limit,
        "query_timeout": human_signals_db_config.query_timeout,
        "connection": {
            "host": human_signals_db_config.host,
            "port": human_signals_db_config.port,
            "database": human_signals_db_config.database,
            "schema": human_signals_db_config.schema_name,
            "table": human_signals_db_config.table,
            "ssl_mode": human_signals_db_config.ssl_mode,
            "has_url": bool(human_signals_db_config.url),
        }
        if human_signals_db_config.is_configured
        else None,
    }


@router.post("/db-import")
async def auto_import_from_database() -> dict[str, Any]:
    """Auto-import human signals data from the configured database.

    When DuckDB is enabled and the database has a query configured, triggers
    a DuckDB sync (Postgres → DuckDB staging → atomic swap → derived tables).
    Falls back to legacy one-shot import otherwise.
    """
    from app.config.db.duckdb import duckdb_config
    from app.config.db.human_signals import human_signals_db_config

    if not human_signals_db_config.is_configured:
        raise HTTPException(
            status_code=400,
            detail="Database not configured. Set up config/human_signals_db.yaml or environment variables.",
        )

    # DuckDB sync path: chunked cursor + staging + derived tables
    if duckdb_config.enabled and human_signals_db_config.has_query:
        from app.services.sync_engine import sync_single

        store = get_store()
        status = store.get_sync_status("human_signals_raw")

        # If already syncing, wait for it to finish instead of erroring
        if status.state == "syncing":
            logger.info("Human signals sync already running, waiting for completion...")
            for _ in range(120):  # Wait up to 120s
                await asyncio.sleep(1)
                status = store.get_sync_status("human_signals_raw")
                if status.state != "syncing":
                    break
            if status.state == "syncing":
                raise HTTPException(408, "Human signals sync timed out")
        elif not store.has_table("human_signals_cases"):
            # No data yet — trigger sync and wait
            logger.info("Triggering human signals DuckDB sync...")
            result = await sync_single("human_signals", store)
            if result.status == "error":
                raise HTTPException(500, f"Sync failed: {result.error}")

        # Read from DuckDB and return full response
        return await _read_cases_from_duckdb(store)

    # Legacy fallback: one-shot import
    if human_signals_db_config.has_query:
        return await _import_with_custom_query(human_signals_db_config)

    if not human_signals_db_config.table:
        raise HTTPException(
            status_code=400,
            detail="No queries configured. Set human_signals_db.dataset_query and human_signals_db.results_query in config.",
        )

    return await _import_from_table(human_signals_db_config)


async def _import_with_custom_query(config: Any) -> dict[str, Any]:
    """Import human signals data using split SQL queries (dataset + results)."""
    from app.services.db import get_backend

    try:
        backend = get_backend(getattr(config, "db_type", "postgres"))
        db_url = backend.build_url(config)

        dataset_query = config.dataset_query
        results_query = config.results_query
        if not dataset_query or not results_query:
            raise HTTPException(
                status_code=400,
                detail="Both dataset_query and results_query are required",
            )

        row_limit = config.row_limit
        timeout_ms = int(config.query_timeout * 1000)

        logger.info("Connecting to human signals database...")
        async with backend.connect(
            db_url,
            ssl_mode=config.ssl_mode,
            statement_timeout_ms=timeout_ms,
        ) as conn:
            logger.info("Executing human signals dataset query...")
            dataset_rows = await conn.fetch_all(
                f"SELECT * FROM ({dataset_query}) AS subq LIMIT {row_limit}"
            )
            logger.info("Executing human signals results query...")
            results_rows = await conn.fetch_all(
                f"SELECT * FROM ({results_query}) AS subq LIMIT {row_limit}"
            )

        if not results_rows:
            logger.info("Results query returned 0 rows")
            raise HTTPException(
                status_code=400,
                detail="Results query returned no data. Check your SQL query configuration.",
            )

        # Join in-memory
        df_dataset = pd.DataFrame(dataset_rows) if dataset_rows else pd.DataFrame()
        df_results = pd.DataFrame(results_rows)

        if (
            not df_dataset.empty
            and "dataset_id" in df_dataset.columns
            and "dataset_id" in df_results.columns
        ):
            df = df_results.merge(
                df_dataset, on="dataset_id", how="left", suffixes=("", "_dataset")
            )
            df = df[[c for c in df.columns if not c.endswith("_dataset")]]
        else:
            df = df_results

        if df.empty:
            raise HTTPException(
                status_code=400,
                detail="Query returned no data. Check your SQL query configuration.",
            )

        logger.info(f"Query returned {len(df)} rows with columns: {list(df.columns)}")

        data_records, format_type, message, metric_schema, display_config = (
            process_human_signals_data(df)
        )

        if format_type == "unknown":
            raise HTTPException(
                status_code=400,
                detail=message or "Could not process database data. Check column mapping.",
            )

        logger.info(
            f"Successfully imported {len(data_records)} human signals records from database"
        )

        return _build_response(
            data_records, format_type, message, metric_schema, display_config, source="database"
        )

    except HTTPException:
        raise

    except Exception as e:
        error_msg = str(e)
        if "cancel" in error_msg.lower() and "timeout" in error_msg.lower():
            logger.error("Query timeout exceeded")
            raise HTTPException(
                status_code=408,
                detail=f"Query timeout exceeded ({config.query_timeout}s). "
                "Try a simpler query or increase query_timeout.",
            )
        if "could not connect" in error_msg.lower() or "connection refused" in error_msg.lower():
            if "@" in error_msg:
                error_msg = "Database connection failed. Check your connection settings."
            logger.error(f"Database connection error: {e}")
            raise HTTPException(status_code=400, detail=error_msg)
        if "@" in error_msg or "password" in error_msg.lower():
            error_msg = "Database import failed. Check your configuration."
        logger.exception("Human signals database import error")
        raise HTTPException(status_code=500, detail=f"Import failed: {error_msg}")


async def _import_from_table(config: Any) -> dict[str, Any]:
    """Import human signals data from a configured table (legacy method)."""
    from urllib.parse import urlparse

    from pydantic import SecretStr

    from app.models.database_schemas import (
        ColumnMapping,
        DatabaseConnectionRequest,
        SSLMode,
        TableIdentifier,
    )
    from app.services import database_service

    try:
        if config.url:
            parsed = urlparse(config.url)
            conn_request = DatabaseConnectionRequest(
                host=parsed.hostname or "localhost",
                port=parsed.port or 5432,
                database=parsed.path.lstrip("/") if parsed.path else "",
                username=parsed.username or "",
                password=SecretStr(parsed.password or ""),
                ssl_mode=SSLMode(config.ssl_mode),
            )
        else:
            conn_request = DatabaseConnectionRequest(
                host=config.host or "localhost",
                port=config.port,
                database=config.database or "",
                username=config.username or "",
                password=SecretStr(config.password or ""),
                ssl_mode=SSLMode(config.ssl_mode),
            )

        handle, error = await database_service.connect(conn_request)
        if error:
            raise HTTPException(status_code=400, detail=f"Connection failed: {error}")

        try:
            table_id = TableIdentifier(
                schema_name=config.schema_name,
                name=config.table,
            )

            schema_info = await database_service.get_schema(handle, table_id)
            db_columns = [col.name for col in schema_info.columns]

            mappings: list[ColumnMapping] = [
                ColumnMapping(source=col, target=col) for col in db_columns
            ]

            result = await database_service.import_data(
                handle=handle,
                table=table_id,
                mappings=mappings,
                filters=None,
                limit=config.row_limit,
                dedupe_on_id=True,
            )

            df = pd.DataFrame(result)
            if df.empty:
                raise HTTPException(
                    status_code=400,
                    detail=f"No data found in table {config.table}",
                )

            data_records, format_type, message, metric_schema, display_config = (
                process_human_signals_data(df)
            )

            if format_type == "unknown":
                raise HTTPException(status_code=400, detail=message)

            return _build_response(
                data_records,
                format_type,
                f"Imported {len(data_records)} records from {config.table}",
                metric_schema,
                display_config,
                source="database",
            )

        except database_service.DatabaseServiceError as e:
            raise HTTPException(status_code=400, detail=str(e))

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Database import error")
        raise HTTPException(status_code=500, detail=f"Database import failed: {e!s}")


async def _read_cases_from_duckdb(store: Any) -> dict[str, Any]:
    """Read all human signals cases from DuckDB and return full response.

    Used by db-import to return the same shape as upload/CSV endpoints.
    """
    if not store.has_table("human_signals_cases"):
        raise HTTPException(
            status_code=404,
            detail="Sync completed but no cases were generated. Check your data format.",
        )

    def _query() -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = store.query_list("SELECT * FROM human_signals_cases")
        return result

    rows = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)
    rows = clean_nan_values(rows)

    schema_json = store.get_kv("human_signals_metric_schema")
    metric_schema = json.loads(schema_json) if schema_json else None
    display_config = generate_display_config(metric_schema) if metric_schema else None

    columns = list(rows[0].keys()) if rows else []
    return {
        "success": True,
        "format": "hitl_feedback",
        "row_count": len(rows),
        "columns": columns,
        "data": rows,
        "message": f"Loaded {len(rows)} cases from database",
        "source": "duckdb",
        **({"metric_schema": metric_schema} if metric_schema else {}),
        **({"display_config": display_config} if display_config else {}),
    }


# ============================================
# DuckDB-backed query endpoints
# ============================================


@router.get("/cases")
async def get_human_signals_cases(
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    """Query pre-aggregated human signals cases from DuckDB.

    Returns the same shape as the upload/import response so the frontend
    can use a single code path regardless of data source.
    """
    store = get_store()
    if not store.has_table("human_signals_cases"):
        raise HTTPException(
            status_code=404,
            detail="No human signals data available. Upload a CSV or trigger a database sync.",
        )

    def _query() -> tuple[int, list[dict[str, Any]]]:
        total = store.query_value("SELECT COUNT(*) FROM human_signals_cases") or 0
        offset = (page - 1) * page_size
        rows = store.query_list(
            "SELECT * FROM human_signals_cases LIMIT ? OFFSET ?",
            [page_size, offset],
        )
        return total, rows

    total, rows = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)

    # Clean NaN values for JSON serialization
    rows = clean_nan_values(rows)

    # Determine format from metric schema presence
    schema_json = store.get_kv("human_signals_metric_schema")
    metric_schema = json.loads(schema_json) if schema_json else None
    display_config = generate_display_config(metric_schema) if metric_schema else None
    format_type = "hitl_feedback"

    columns = list(rows[0].keys()) if rows else []
    response: dict[str, Any] = {
        "success": True,
        "format": format_type,
        "row_count": total,
        "columns": columns,
        "data": rows,
        "page": page,
        "page_size": page_size,
        "message": f"{total} cases available",
        "source": "duckdb",
    }
    if metric_schema is not None:
        response["metric_schema"] = metric_schema
    if display_config is not None:
        response["display_config"] = display_config
    return response


@router.get("/metric-schema")
async def get_human_signals_metric_schema() -> dict[str, Any]:
    """Read the human signals metric schema from DuckDB metadata store."""
    store = get_store()
    schema_json = store.get_kv("human_signals_metric_schema")
    if not schema_json:
        raise HTTPException(
            status_code=404,
            detail="No human signals metric schema available.",
        )

    metric_schema = json.loads(schema_json)
    display_config = generate_display_config(metric_schema)

    return {
        "success": True,
        "metric_schema": metric_schema,
        "display_config": display_config,
    }
