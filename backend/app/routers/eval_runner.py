import csv
import io
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from sse_starlette.sse import EventSourceResponse

from app.models.eval_runner_schemas import (
    AgentType,
    ColumnMapping,
    DatasetInfo,
    EvaluationResultResponse,
    EvaluationRunRequest,
    MetricsResponse,
    TestConnectionRequest,
    TestConnectionResponse,
    UploadResponse,
)
from app.services import eval_runner_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================
# Metrics Endpoints
# ============================================


@router.get("/metrics", response_model=MetricsResponse)
async def get_metrics() -> MetricsResponse:
    """Get all available evaluation metrics.

    Returns list of metrics with their configurations including:
    - Required and optional fields
    - Default thresholds
    - Tags for filtering
    - Whether LLM-based or heuristic
    """
    metrics = eval_runner_service.get_available_metrics()
    return MetricsResponse(success=True, metrics=metrics)


# ============================================
# Example Dataset Endpoints
# ============================================


@router.get("/example/sample")
async def get_example_dataset() -> UploadResponse:
    """Load the built-in example evaluation dataset."""
    from pathlib import Path

    file_path = Path(__file__).parent.parent.parent / "sample_data" / "eval_runner_sample.csv"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Example dataset not found")

    try:
        decoded = file_path.read_text(encoding="utf-8")
        reader = csv.DictReader(io.StringIO(decoded))

        rows: list[dict[str, Any]] = []
        for i, row in enumerate(reader):
            if i >= 10_000:
                break
            rows.append(dict(row))

        if not rows:
            raise HTTPException(status_code=400, detail="Example dataset is empty")

        columns = list(rows[0].keys())
        mapping = _suggest_column_mapping(columns)

        return UploadResponse(
            success=True,
            dataset=DatasetInfo(
                row_count=len(rows),
                columns=columns,
                preview=rows[:50],
            ),
            suggested_mapping=mapping,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error loading example dataset")
        raise HTTPException(status_code=500, detail=f"Failed to load example dataset: {e!s}")


# ============================================
# Upload Endpoints
# ============================================


@router.post("/upload", response_model=UploadResponse)
async def upload_dataset(file: UploadFile = File(...)) -> UploadResponse:
    """Upload a CSV dataset for evaluation.

    Accepts CSV files up to 10MB with up to 10,000 rows.
    Returns column names, preview data, and suggested column mapping.
    """
    # Validate file type
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    # Read and validate file size (10MB limit)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")

    try:
        # Parse CSV
        decoded = contents.decode("utf-8")
        reader = csv.DictReader(io.StringIO(decoded))

        rows: list[dict[str, Any]] = []
        for i, row in enumerate(reader):
            if i >= 10000:  # Row limit
                break
            # Filter out None keys (from trailing commas) and convert None values to empty strings
            cleaned_row = {k: (v if v is not None else "") for k, v in row.items() if k is not None}
            rows.append(cleaned_row)

        if not rows:
            raise HTTPException(status_code=400, detail="CSV file is empty or invalid")

        # Get columns from first row (already cleaned of None keys)
        columns = list(rows[0].keys())
        preview = rows[:5]  # First 5 rows for preview

        # Suggest column mapping based on common names
        suggested_mapping = _suggest_column_mapping(columns)

        return UploadResponse(
            success=True,
            dataset=DatasetInfo(
                columns=columns,
                preview=preview,
                row_count=len(rows),
            ),
            suggested_mapping=suggested_mapping,
        )

    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400, detail="File encoding not supported. Please use UTF-8."
        )
    except csv.Error as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV format: {e}")


def _suggest_column_mapping(columns: list[str]) -> ColumnMapping:
    """Suggest column mapping based on common column names."""
    mapping = ColumnMapping()

    # Common name variations for each field
    field_patterns = {
        "dataset_id": ["dataset_id", "record_id", "item_id", "row_id", "index"],
        "query": ["query", "question", "input", "prompt", "user_input", "user_message"],
        "actual_output": [
            "actual_output",
            "output",
            "response",
            "answer",
            "assistant_response",
            "completion",
            "generated",
        ],
        "expected_output": [
            "expected_output",
            "expected",
            "ground_truth",
            "reference",
            "target",
            "gold",
        ],
        "retrieved_content": [
            "retrieved_content",
            "context",
            "retrieved",
            "documents",
            "chunks",
            "sources",
        ],
        "conversation": ["conversation", "messages", "chat_history", "dialog"],
        "latency": ["latency", "response_time", "duration", "time_ms"],
        "tools_called": ["tools_called", "tools", "function_calls", "actions"],
        "expected_tools": ["expected_tools", "required_tools", "target_tools"],
        "acceptance_criteria": ["acceptance_criteria", "criteria", "requirements"],
        # New field patterns
        "additional_input": [
            "additional_input",
            "extra_input",
            "context",
            "additional_context",
        ],
        "document_text": [
            "document_text",
            "document",
            "doc_text",
            "text_content",
        ],
        "actual_reference": [
            "actual_reference",
            "reference",
            "citation",
            "source_reference",
        ],
        "expected_reference": [
            "expected_reference",
            "gold_reference",
            "target_reference",
        ],
        "trace_id": [
            "trace_id",
            "traceid",
            "span_id",
        ],
        "observation_id": [
            "observation_id",
            "observationid",
            "langfuse_id",
        ],
    }

    lower_columns = {c.lower(): c for c in columns}

    for field, patterns in field_patterns.items():
        for pattern in patterns:
            if pattern in lower_columns:
                setattr(mapping, field, lower_columns[pattern])
                break

    return mapping


# ============================================
# Agent Connection Endpoints
# ============================================


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_agent_connection(request: TestConnectionRequest) -> TestConnectionResponse:
    """Test agent connection with a sample query.

    Validates that the agent API or prompt template works correctly.
    """
    if request.agent_config.type == AgentType.NONE:
        return TestConnectionResponse(
            success=True,
            sample_output="Using outputs from dataset",
        )

    try:
        output, latency = await eval_runner_service.call_agent_api(
            request.agent_config,
            request.sample_query,
        )
        return TestConnectionResponse(
            success=True,
            sample_output=output[:500] if len(output) > 500 else output,
            latency_ms=latency,
        )
    except eval_runner_service.AgentConnectionError as e:
        return TestConnectionResponse(
            success=False,
            error=str(e),
        )
    except Exception as e:
        logger.exception("Unexpected error testing agent connection")
        return TestConnectionResponse(
            success=False,
            error=f"Unexpected error: {e}",
        )


# ============================================
# Evaluation Run Endpoints
# ============================================


@router.post("/run", response_model=EvaluationResultResponse)
async def run_evaluation(request: EvaluationRunRequest) -> EvaluationResultResponse:
    """Run evaluation synchronously and return results.

    For smaller datasets or when SSE streaming is not needed.
    """
    try:
        summary = await eval_runner_service.run_evaluation(
            evaluation_name=request.evaluation_name,
            dataset_data=request.dataset.data,
            column_mapping=request.dataset.columns,
            metrics=request.metrics,
            model_name=request.model_name,
            llm_provider=request.llm_provider.value,
            max_concurrent=request.max_concurrent,
            thresholds=request.thresholds,
            agent_config=request.agent_config,
        )

        return EvaluationResultResponse(
            success=True,
            summary=summary,
        )

    except eval_runner_service.EvalRunnerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Evaluation run failed")
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {e}")


@router.post("/run/stream")
async def run_evaluation_stream(request: EvaluationRunRequest) -> EventSourceResponse:
    """Run evaluation with SSE streaming progress updates.

    Emits events:
    - progress: { current, total, metric, item_id, status }
    - log: { timestamp, level, message }
    - complete: { run_id, summary }
    - error: { message, details }
    """

    async def event_generator() -> AsyncGenerator[dict[str, str], None]:
        logger.info("=== EVAL RUNNER STREAM START ===")

        try:
            async for event in eval_runner_service.run_evaluation_stream(
                evaluation_name=request.evaluation_name,
                dataset_data=request.dataset.data,
                column_mapping=request.dataset.columns,
                metrics=request.metrics,
                model_name=request.model_name,
                llm_provider=request.llm_provider.value,
                max_concurrent=request.max_concurrent,
                thresholds=request.thresholds,
                agent_config=request.agent_config,
            ):
                yield {
                    "event": event["event"],
                    "data": json.dumps(event["data"]),
                }

        except Exception as e:
            logger.exception("Stream error in eval runner")
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)}),
            }

        finally:
            logger.info("=== EVAL RUNNER STREAM END ===")
            yield {"event": "done", "data": ""}

    return EventSourceResponse(event_generator())


# ============================================
# Results Export Endpoints
# ============================================


@router.get("/export/{run_id}/csv")
async def export_results_csv(run_id: str) -> dict[str, str]:
    """Export evaluation results as CSV.

    Note: In a production system, results would be stored and retrieved.
    This is a placeholder that returns instructions.
    """
    return {
        "message": "Results export not yet implemented. Results are returned in the evaluation response.",
        "run_id": run_id,
    }


@router.get("/export/{run_id}/json")
async def export_results_json(run_id: str) -> dict[str, str]:
    """Export evaluation results as JSON.

    Note: In a production system, results would be stored and retrieved.
    This is a placeholder that returns instructions.
    """
    return {
        "message": "Results export not yet implemented. Results are returned in the evaluation response.",
        "run_id": run_id,
    }
