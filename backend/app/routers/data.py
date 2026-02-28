import io
import logging
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile

from app.models.schemas import (
    DataFormatResponse,
    UploadResponse,
)
from app.services.data_processor import (
    convert_tree_to_wide_format,
    detect_data_format,
    prepare_data_for_analytics,
    process_uploaded_data,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def clean_nan_values(df: pd.DataFrame) -> pd.DataFrame:
    """Replace NaN and inf values with None for JSON serialization.

    JSON doesn't support NaN or Infinity values.
    """
    return df.replace({np.nan: None, np.inf: None, -np.inf: None})


@router.post("/upload", response_model=UploadResponse)
async def upload_data(file: UploadFile = File(...)) -> UploadResponse:
    """Upload and process a CSV file.

    Detects data format and validates structure.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    try:
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))

        processed_df, format_type, message = process_uploaded_data(df)

        if format_type is None or format_type == "unknown" or processed_df is None:
            raise HTTPException(status_code=400, detail=message or "Could not process data")

        # Clean NaN values for JSON serialization
        processed_df = clean_nan_values(processed_df)

        # Convert to records for JSON response (pandas uses Hashable keys but our columns are strings)
        preview: list[dict[str, Any]] = processed_df.head(10).to_dict(orient="records")  # type: ignore[assignment]
        data_records: list[dict[str, Any]] = processed_df.to_dict(orient="records")  # type: ignore[assignment]

        return UploadResponse(
            success=True,
            format=format_type,
            row_count=len(processed_df),
            columns=list(processed_df.columns),
            preview=preview,
            message=message,
            data=data_records,
        )

    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="Empty CSV file")
    except pd.errors.ParserError as e:
        raise HTTPException(status_code=400, detail=f"CSV parsing error: {e!s}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {e!s}")


@router.post("/detect-format", response_model=DataFormatResponse)
async def detect_format(file: UploadFile = File(...)) -> DataFormatResponse:
    """Detect the format of an uploaded CSV without full processing."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    try:
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))

        format_type = detect_data_format(df)

        return DataFormatResponse(
            format=format_type,
            columns=list(df.columns),
            row_count=len(df),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection error: {e!s}")


@router.post("/convert-tree")
async def convert_tree(data: list[dict[str, Any]]) -> dict[str, object]:
    """Convert tree format data to wide format for analytics."""
    try:
        df = pd.DataFrame(data)
        wide_df = convert_tree_to_wide_format(df)
        wide_df = clean_nan_values(wide_df)
        return {
            "success": True,
            "data": wide_df.to_dict(orient="records"),
            "columns": list(wide_df.columns),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion error: {e!s}")


@router.post("/prepare-analytics")
async def prepare_analytics(
    data: list[dict[str, Any]], format_type: str, metric_type: str | None = None
) -> dict[str, object]:
    """Prepare data for analytics visualization."""
    try:
        analytics_df, metric_columns, mapping = prepare_data_for_analytics(
            data, format_type, metric_type
        )
        analytics_df = clean_nan_values(analytics_df)
        return {
            "success": True,
            "data": analytics_df.to_dict(orient="records"),
            "columns": list(analytics_df.columns),
            "metric_columns": metric_columns,
            "mapping": mapping,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preparation error: {e!s}")


@router.get("/example/{dataset_name}")
async def get_example_dataset(dataset_name: str) -> dict[str, object]:
    """Load an example dataset."""
    example_files = {
        "model": "sample_data/example_model.csv",
        "comparison": "sample_data/example_model_comparison.csv",
        "annotation": "sample_data/annotation_sample.csv",
        "align": "sample_data/caliber_hq.csv",
    }

    if dataset_name not in example_files:
        raise HTTPException(
            status_code=404, detail=f"Dataset not found. Available: {list(example_files.keys())}"
        )

    try:
        # Path: data.py -> routers -> app -> backend
        from pathlib import Path

        base_path = Path(__file__).parent.parent.parent
        file_path = base_path / example_files[dataset_name]

        df = pd.read_csv(file_path)
        processed_df, format_type, message = process_uploaded_data(df)

        if format_type is None or format_type == "unknown" or processed_df is None:
            raise HTTPException(status_code=400, detail=message or "Could not process example data")

        # Clean NaN values for JSON serialization
        processed_df = clean_nan_values(processed_df)

        return {
            "success": True,
            "format": format_type,
            "row_count": len(processed_df),
            "columns": list(processed_df.columns),
            "data": processed_df.to_dict(orient="records"),
            "message": message,
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Example file not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Loading error: {e!s}")


# ============================================
# Evaluation Database Auto-Load Endpoints
# ============================================

# Column normalization mapping for evaluation data
EVAL_COLUMN_NORMALIZATION = {
    # Identifiers
    "id": "dataset_id",
    "record_id": "dataset_id",
    "eval_id": "dataset_id",
    # Input/output
    "input": "query",
    "prompt": "query",
    "question": "query",
    "output": "actual_output",
    "response": "actual_output",
    "completion": "actual_output",
    "answer": "actual_output",
    "expected": "expected_output",
    "ground_truth": "expected_output",
    "reference": "expected_output",
    # Experiment
    "experiment": "evaluation_name",
    "run_name": "evaluation_name",
    "experiment_name": "evaluation_name",
    # Metrics
    "metric": "metric_name",
    "score": "metric_score",
    "metric_value": "metric_score",
    "value": "metric_score",
}


@router.get("/eval-db-config")
async def get_eval_db_config() -> dict[str, Any]:
    """Get the evaluation database configuration.

    Returns whether auto-load is enabled and configuration status.
    """
    from app.config.db.eval_db import eval_db_config

    return {
        "success": True,
        "configured": eval_db_config.is_configured,
        "auto_load": eval_db_config.auto_load and eval_db_config.is_configured,
        "has_query": eval_db_config.has_query,
        "row_limit": eval_db_config.row_limit,
        "query_timeout": eval_db_config.query_timeout,
    }


@router.post("/eval-db-import", response_model=UploadResponse)
async def auto_import_eval_from_database() -> UploadResponse:
    """Auto-import evaluation data from the configured database.

    Executes the pre-configured SQL query and returns processed data.
    """
    from app.config.db.eval_db import eval_db_config
    from app.services.db import get_backend

    if not eval_db_config.is_configured:
        raise HTTPException(
            status_code=400,
            detail="Database not configured. Set up config/eval_db.yaml or environment variables.",
        )

    if not eval_db_config.has_query:
        raise HTTPException(
            status_code=400,
            detail="No SQL queries configured. Set eval_db.dataset_query and eval_db.results_query in config.",
        )

    try:
        backend = get_backend(getattr(eval_db_config, "db_type", "postgres"))
        db_url = backend.build_url(eval_db_config)

        dataset_query = eval_db_config.dataset_query
        results_query = eval_db_config.results_query
        if not dataset_query or not results_query:
            raise HTTPException(
                status_code=400, detail="Both dataset_query and results_query are required"
            )

        row_limit = eval_db_config.row_limit
        timeout_ms = int(eval_db_config.query_timeout * 1000)

        logger.info("Connecting to eval database...")
        async with backend.connect(
            db_url,
            ssl_mode=eval_db_config.ssl_mode,
            statement_timeout_ms=timeout_ms,
        ) as conn:
            logger.info("Executing eval dataset query...")
            dataset_rows = await conn.fetch_all(
                f"SELECT * FROM ({dataset_query}) AS subq LIMIT {row_limit}"
            )
            logger.info("Executing eval results query...")
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
            logger.info("Joined result returned 0 rows")
            raise HTTPException(
                status_code=400,
                detail="Query returned no data. Check your SQL query configuration.",
            )

        columns = list(df.columns)
        logger.info(f"Query returned {len(df)} rows with columns: {columns}")

        # Normalize column names
        rename_map = {}
        custom_columns = eval_db_config.column_rename_map or {}

        for col in df.columns:
            if col in custom_columns:
                rename_map[col] = custom_columns[col]
            else:
                normalized = col.lower().strip().replace(" ", "_").replace("-", "_")
                if normalized in EVAL_COLUMN_NORMALIZATION:
                    rename_map[col] = EVAL_COLUMN_NORMALIZATION[normalized]
        if rename_map:
            # Avoid collisions: skip renaming if the target name already exists
            existing = set(df.columns)
            rename_map = {
                src: tgt for src, tgt in rename_map.items() if src == tgt or tgt not in existing
            }
            df = df.rename(columns=rename_map)
            logger.info(f"Normalized columns: {rename_map}")

        processed_df, format_type, message = process_uploaded_data(df)

        if format_type is None or format_type == "unknown" or processed_df is None:
            raise HTTPException(
                status_code=400,
                detail=message or "Could not process database data. Check column mapping.",
            )

        processed_df = clean_nan_values(processed_df)

        preview: list[dict[str, Any]] = processed_df.head(10).to_dict(orient="records")  # type: ignore[assignment]
        data_records: list[dict[str, Any]] = processed_df.to_dict(orient="records")  # type: ignore[assignment]

        logger.info(f"Successfully imported {len(processed_df)} records from database")

        return UploadResponse(
            success=True,
            format=format_type,
            row_count=len(processed_df),
            columns=list(processed_df.columns),
            preview=preview,
            message=f"Imported {len(processed_df)} records from database",
            data=data_records,
        )

    except HTTPException:
        raise

    except Exception as e:
        error_msg = str(e)
        if "cancel" in error_msg.lower() and "timeout" in error_msg.lower():
            logger.error("Query timeout exceeded")
            raise HTTPException(
                status_code=408,
                detail=f"Query timeout exceeded ({eval_db_config.query_timeout}s). "
                "Try a simpler query or increase query_timeout.",
            )
        if "could not connect" in error_msg.lower() or "connection refused" in error_msg.lower():
            if "@" in error_msg:
                error_msg = "Database connection failed. Check your connection settings."
            logger.error(f"Database connection error: {e}")
            raise HTTPException(status_code=400, detail=error_msg)
        if "@" in error_msg or "password" in error_msg.lower():
            error_msg = "Database import failed. Check your configuration."
        logger.exception("Eval database import error")
        raise HTTPException(status_code=500, detail=f"Import failed: {error_msg}")
