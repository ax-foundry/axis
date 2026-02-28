import io
import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile

logger = logging.getLogger(__name__)

router = APIRouter()

# Monitoring required columns - at minimum need dataset_id (timestamp will be auto-generated if missing)
MONITORING_REQUIRED_COLUMNS = {"dataset_id"}

MONITORING_OPTIONAL_COLUMNS = {
    "query",
    "actual_output",
    "expected_output",
    "evaluation_name",
    "model_name",
    "llm_provider",
    "environment",
    "latency",
    "has_errors",
    "metric_name",
    "metric_score",
    "metric_type",
    "parent",
    "weight",
    "passed",
    "threshold",
    "run_id",
    "metric_id",
    "signals",
    "explanation",
    "critique",
    "metric_category",
}

# Column name normalization mapping (lowercase -> standard name)
MONITORING_COLUMN_NORMALIZATION = {
    # Identifiers
    "dataset_id": "dataset_id",
    "id": "dataset_id",
    "record_id": "dataset_id",
    "metric_id": "metric_id",
    "run_id": "run_id",
    # Timestamp
    "timestamp": "timestamp",
    "time": "timestamp",
    "created_at": "timestamp",
    # Model/LLM
    "model_name": "model_name",
    "model": "model_name",
    "agent_name": "model_name",
    "agent": "model_name",
    "llm_provider": "llm_provider",
    # Latency
    "latency": "latency",
    "latency_ms": "latency",
    "response_time": "latency",
    # Errors
    "has_errors": "has_errors",
    "error": "has_errors",
    # Query/Input
    "query": "query",
    "input": "query",
    "prompt": "query",
    "user_input": "query",
    # Output
    "actual_output": "actual_output",
    "output": "actual_output",
    "response": "actual_output",
    "model_output": "actual_output",
    "completion": "actual_output",
    "expected_output": "expected_output",
    # Evaluation name
    "evaluation_name": "evaluation_name",
    "evaluationname": "evaluation_name",
    "eval_name": "evaluation_name",
    "experiment": "evaluation_name",
    "experiment_name": "evaluation_name",
    # Environment
    "environment": "environment",
    "env": "environment",
    "stage": "environment",
    # Metric fields
    "metric_name": "metric_name",
    "metric_score": "metric_score",
    "metric_type": "metric_type",
    "parent": "parent",
    "weight": "weight",
    "passed": "passed",
    "threshold": "threshold",
    "signals": "signals",
    "explanation": "explanation",
    "critique": "critique",
    "metric_category": "metric_category",
    # Source fields
    "source_type": "source_type",
    "source_name": "source_name",
    "source_component": "source_component",
    # Additional fields from evaluation view
    "trace_id": "trace_id",
    "observation_id": "observation_id",
    "dataset_created_at": "timestamp",  # Map view's dataset_created_at to timestamp as fallback
    "eval_mode": "eval_mode",
    "cost_estimate": "cost_estimate",
    "version": "version",
}


def clean_nan_values(df: pd.DataFrame) -> pd.DataFrame:
    """Replace NaN and inf values with None for JSON serialization."""
    return df.replace({np.nan: None, np.inf: None, -np.inf: None})


def normalize_column_names(
    df: pd.DataFrame, custom_columns: dict[str, str] | None = None
) -> pd.DataFrame:
    """Normalize column names to standard monitoring format.

    Args:
        df: DataFrame to normalize
        custom_columns: Optional custom column mappings that take precedence over defaults
    """
    rename_map = {}
    custom_columns = custom_columns or {}

    for col in df.columns:
        # Check custom mapping first (exact match)
        if col in custom_columns:
            rename_map[col] = custom_columns[col]
        else:
            # Fall back to default normalization
            normalized = col.lower().strip().replace(" ", "_").replace("-", "_")
            if normalized in MONITORING_COLUMN_NORMALIZATION:
                rename_map[col] = MONITORING_COLUMN_NORMALIZATION[normalized]
        # Keep score columns as-is (e.g., relevance_score, coherence_score)
    if rename_map:
        # Avoid collisions: skip renaming if the target name already exists
        existing = set(df.columns)
        rename_map = {
            src: tgt for src, tgt in rename_map.items() if src == tgt or tgt not in existing
        }
        df = df.rename(columns=rename_map)
    return df


def detect_metric_columns(df: pd.DataFrame) -> list[str]:
    """Detect metric columns based on data format.

    Two formats are supported:
    1. Long format: Has 'metric_name' and 'metric_score' columns - each row is one metric observation
    2. Wide format: Has columns ending with '_score' (e.g., 'relevance_score', 'coherence_score')
    """
    # Long format: metric_name + metric_score columns
    # In this case, metric_score is the only metric column
    if "metric_name" in df.columns and "metric_score" in df.columns:
        return ["metric_score"]

    # Wide format: detect columns ending with _score
    metric_cols = []
    for col in df.columns:
        if col.endswith("_score") and col != "metric_score":
            metric_cols.append(col)

    return metric_cols


def coerce_types(df: pd.DataFrame) -> pd.DataFrame:
    """Coerce column types to expected formats."""
    # Numeric columns
    if "latency" in df.columns:
        df["latency"] = pd.to_numeric(df["latency"], errors="coerce")

    # Detect and coerce score columns
    for col in df.columns:
        if col.endswith("_score"):
            df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def detect_monitoring_format(df: pd.DataFrame) -> bool:
    """Detect if the DataFrame is monitoring format.

    Returns True if required columns are present (dataset_id).
    Timestamp is optional and will be auto-generated if missing.
    """
    normalized_cols = {
        col.lower().strip().replace(" ", "_").replace("-", "_") for col in df.columns
    }

    # Check for dataset_id (or aliases) - timestamp is optional
    has_id = any(alias in normalized_cols for alias in ["dataset_id", "id", "record_id"])

    return has_id


def process_monitoring_data(
    df: pd.DataFrame,
    custom_columns: dict[str, str] | None = None,
) -> tuple[pd.DataFrame, str, str, list[str]]:
    """Process uploaded monitoring data.

    Args:
        df: DataFrame to process
        custom_columns: Optional custom column mappings that take precedence over defaults

    Returns: (processed_df, format_type, message, metric_columns)
    """
    if df.empty:
        return df, "unknown", "Empty dataset", []

    # Check if this is monitoring format
    if not detect_monitoring_format(df):
        return (
            df,
            "unknown",
            "Data does not appear to be monitoring format. Required column: dataset_id",
            [],
        )

    # Normalize column names (custom mappings take precedence)
    df = normalize_column_names(df, custom_columns)

    # Auto-generate timestamp if not present
    if "timestamp" not in df.columns:
        df["timestamp"] = pd.Timestamp.now()

    # Coerce types
    df = coerce_types(df)

    # Detect metric columns
    metric_columns = detect_metric_columns(df)

    # Clean NaN values
    df = clean_nan_values(df)

    return df, "monitoring", f"Processed {len(df)} monitoring records", metric_columns


@router.post("/upload")
async def upload_monitoring(file: UploadFile = File(...)) -> dict[str, Any]:
    """Upload and process a monitoring CSV file.

    Detects monitoring format, normalizes column names, and coerces types.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    try:
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))

        processed_df, format_type, message, metric_columns = process_monitoring_data(df)

        if format_type == "unknown":
            raise HTTPException(status_code=400, detail=message)

        # Convert to records for JSON response
        data_records: list[dict[str, Any]] = processed_df.to_dict(orient="records")  # type: ignore[assignment]

        return {
            "success": True,
            "format": format_type,
            "row_count": len(processed_df),
            "columns": list(processed_df.columns),
            "metric_columns": metric_columns,
            "data": data_records,
            "message": message,
        }

    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="Empty CSV file")
    except pd.errors.ParserError as e:
        raise HTTPException(status_code=400, detail=f"CSV parsing error: {e!s}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Monitoring upload error")
        raise HTTPException(status_code=500, detail=f"Processing error: {e!s}")


@router.get("/example/{dataset_name}")
async def get_example_monitoring_dataset(dataset_name: str) -> dict[str, Any]:
    """Load an example monitoring dataset."""
    example_files = {
        "monitoring": "sample_data/monitoring_sample.csv",
    }

    if dataset_name not in example_files:
        raise HTTPException(
            status_code=404,
            detail=f"Dataset not found. Available: {list(example_files.keys())}",
        )

    try:
        # Path: monitoring.py -> routers -> app -> backend
        base_path = Path(__file__).parent.parent.parent
        file_path = base_path / example_files[dataset_name]

        if not file_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Example file not found: {example_files[dataset_name]}",
            )

        df = pd.read_csv(file_path)
        processed_df, format_type, message, metric_columns = process_monitoring_data(df)

        if format_type == "unknown":
            raise HTTPException(status_code=400, detail=message)

        # Convert to records for JSON response
        data_records: list[dict[str, Any]] = processed_df.to_dict(orient="records")  # type: ignore[assignment]

        return {
            "success": True,
            "format": format_type,
            "row_count": len(processed_df),
            "columns": list(processed_df.columns),
            "metric_columns": metric_columns,
            "data": data_records,
            "message": message,
        }

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
async def get_monitoring_db_config() -> dict[str, Any]:
    """Get the monitoring database configuration.

    Returns connection details and whether auto-connect/auto-load is enabled.
    """
    from app.config.db.monitoring import monitoring_db_config

    return {
        "success": True,
        "configured": monitoring_db_config.is_configured,
        "auto_connect": monitoring_db_config.auto_connect and monitoring_db_config.is_configured,
        "auto_load": monitoring_db_config.should_auto_load,
        "has_query": monitoring_db_config.has_query,
        "row_limit": monitoring_db_config.row_limit,
        "query_timeout": monitoring_db_config.query_timeout,
        "connection": {
            "host": monitoring_db_config.host,
            "port": monitoring_db_config.port,
            "database": monitoring_db_config.database,
            "schema": monitoring_db_config.schema_name,
            "table": monitoring_db_config.table,
            "ssl_mode": monitoring_db_config.ssl_mode,
            "has_url": bool(monitoring_db_config.url),
        }
        if monitoring_db_config.is_configured
        else None,
        "thresholds": {
            "default": {
                "good": monitoring_db_config.thresholds_default_good,
                "pass": monitoring_db_config.thresholds_default_pass,
            },
            "per_source": monitoring_db_config.thresholds_per_source,
        },
        "anomaly_detection": {
            "enabled": monitoring_db_config.anomaly_detection.enabled,
            "min_data_points": monitoring_db_config.anomaly_detection.min_data_points,
            "z_score": {
                "enabled": monitoring_db_config.anomaly_detection.z_score_enabled,
                "threshold": monitoring_db_config.anomaly_detection.z_score_threshold,
                "severity": monitoring_db_config.anomaly_detection.z_score_severity,
                "lookback_window": monitoring_db_config.anomaly_detection.z_score_lookback_window,
                "metrics": monitoring_db_config.anomaly_detection.z_score_metrics,
            },
            "moving_average": {
                "enabled": monitoring_db_config.anomaly_detection.ma_enabled,
                "window_size": monitoring_db_config.anomaly_detection.ma_window_size,
                "deviation_threshold": monitoring_db_config.anomaly_detection.ma_deviation_threshold,
                "severity": monitoring_db_config.anomaly_detection.ma_severity,
                "metrics": monitoring_db_config.anomaly_detection.ma_metrics,
            },
            "rate_of_change": {
                "enabled": monitoring_db_config.anomaly_detection.roc_enabled,
                "threshold": monitoring_db_config.anomaly_detection.roc_threshold,
                "severity": monitoring_db_config.anomaly_detection.roc_severity,
                "metrics": monitoring_db_config.anomaly_detection.roc_metrics,
            },
        },
    }


@router.post("/db-import")
async def auto_import_from_database() -> dict[str, Any]:
    """Auto-import monitoring data from the configured database.

    Supports custom SQL queries or table-based import.
    Uses the connection settings from YAML config or environment variables.
    """
    from app.config.db.monitoring import monitoring_db_config

    if not monitoring_db_config.is_configured:
        raise HTTPException(
            status_code=400,
            detail="Database not configured. Set up config/monitoring_db.yaml or environment variables.",
        )

    # If split queries are configured, use direct database connection
    if monitoring_db_config.has_query:
        return await _import_with_custom_query(monitoring_db_config)

    # Fall back to table-based import
    if not monitoring_db_config.table:
        raise HTTPException(
            status_code=400,
            detail="No queries configured. Set monitoring_db.dataset_query and monitoring_db.results_query in config.",
        )

    return await _import_from_table(monitoring_db_config)


async def _import_with_custom_query(config: Any) -> dict[str, Any]:
    """Import monitoring data using split SQL queries (dataset + results)."""
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

        logger.info("Connecting to monitoring database...")
        async with backend.connect(
            db_url,
            ssl_mode=config.ssl_mode,
            statement_timeout_ms=timeout_ms,
        ) as conn:
            logger.info("Executing monitoring dataset query...")
            dataset_rows = await conn.fetch_all(
                f"SELECT * FROM ({dataset_query}) AS subq LIMIT {row_limit}"
            )
            logger.info("Executing monitoring results query...")
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
            # Drop _dataset suffixed duplicates — results table already has the columns
            df = df[[c for c in df.columns if not c.endswith("_dataset")]]
        else:
            df = df_results

        if df.empty:
            raise HTTPException(
                status_code=400,
                detail="Query returned no data. Check your SQL query configuration.",
            )

        logger.info(f"Query returned {len(df)} rows with columns: {list(df.columns)}")

        custom_columns = config.columns if hasattr(config, "columns") else {}
        processed_df, format_type, message, metric_columns = process_monitoring_data(
            df, custom_columns
        )

        logger.info(f"Processed columns: {list(processed_df.columns)}")
        logger.info(f"Detected metric columns: {metric_columns}")

        if format_type == "unknown":
            raise HTTPException(
                status_code=400,
                detail=message or "Could not process database data. Check column mapping.",
            )

        processed_df = clean_nan_values(processed_df)
        data_records: list[dict[str, Any]] = processed_df.to_dict(orient="records")  # type: ignore[assignment]

        logger.info(f"Successfully imported {len(processed_df)} monitoring records from database")

        return {
            "success": True,
            "format": format_type,
            "row_count": len(processed_df),
            "columns": list(processed_df.columns),
            "metric_columns": metric_columns,
            "data": data_records,
            "message": f"Imported {len(processed_df)} records from database query",
            "source": "database",
        }

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
        logger.exception("Monitoring database import error")
        raise HTTPException(status_code=500, detail=f"Import failed: {error_msg}")


async def _import_from_table(config: Any) -> dict[str, Any]:
    """Import monitoring data from a configured table (legacy method)."""
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
        # Build connection request
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

        # Connect to database
        handle, error = await database_service.connect(conn_request)
        if error:
            raise HTTPException(status_code=400, detail=f"Connection failed: {error}")

        try:
            # Get table schema to auto-map columns
            table_id = TableIdentifier(
                schema_name=config.schema_name,
                name=config.table,
            )

            schema_info = await database_service.get_schema(handle, table_id)
            db_columns = [col.name for col in schema_info.columns]

            # Auto-map columns using monitoring naming conventions
            mappings: list[ColumnMapping] = []
            logger.info(f"DB columns found: {db_columns}")
            for col in db_columns:
                normalized = col.lower().strip().replace(" ", "_").replace("-", "_")
                target = MONITORING_COLUMN_NORMALIZATION.get(normalized)
                if target:
                    mappings.append(ColumnMapping(source=col, target=target))
                    logger.info(f"Column mapping: {col} -> {target}")
                else:
                    mappings.append(ColumnMapping(source=col, target=col))
                    logger.info(f"Column unmapped (keeping original): {col}")

            # Import data
            result = await database_service.import_data(
                handle=handle,
                table=table_id,
                mappings=mappings,
                filters=None,
                limit=config.row_limit,
                dedupe_on_id=True,
            )

            # Process the imported data
            df = pd.DataFrame(result)
            logger.info(f"DB import raw DataFrame columns: {list(df.columns)}")
            logger.info(f"DB import raw DataFrame shape: {df.shape}")
            if not df.empty:
                logger.info(f"DB import sample row: {df.iloc[0].to_dict()}")
            if df.empty:
                raise HTTPException(
                    status_code=400,
                    detail=f"No data found in table {config.table}",
                )

            processed_df, format_type, message, metric_columns = process_monitoring_data(df)
            logger.info(f"DB import processed columns: {list(processed_df.columns)}")
            logger.info(f"DB import detected metric columns: {metric_columns}")
            logger.info(f"DB import format_type: {format_type}")

            if format_type == "unknown":
                raise HTTPException(status_code=400, detail=message)

            processed_df = clean_nan_values(processed_df)

            data_records: list[dict[str, Any]] = processed_df.to_dict(orient="records")  # type: ignore[assignment]

            return {
                "success": True,
                "format": format_type,
                "row_count": len(processed_df),
                "columns": list(processed_df.columns),
                "metric_columns": metric_columns,
                "data": data_records,
                "message": f"Imported {len(processed_df)} records from {config.table}",
                "source": "database",
            }

        except database_service.DatabaseServiceError as e:
            raise HTTPException(status_code=400, detail=str(e))

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Database import error")
        raise HTTPException(status_code=500, detail=f"Database import failed: {e!s}")
