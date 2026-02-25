import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.models.copilot_schemas import SSEEventType, ThoughtType
from app.models.report_schemas import (
    InsightPatternSchema,
    InsightResultSchema,
)
from app.services.issue_extractor_service import (
    AVAILABLE_CONTEXT_FIELDS,
    ExtractionConfig,
    InsightResult,
    IssueExtractorService,
    ReportMode,
    ReportType,
    generate_insights,
    get_configured_llm_info,
)

logger = logging.getLogger("axis.routers.reports")

router = APIRouter()


def _insight_result_to_schema(result: InsightResult) -> InsightResultSchema:
    """Convert axion InsightResult dataclass to Pydantic schema."""
    patterns = [
        InsightPatternSchema(
            category=p.category,
            description=p.description,
            count=p.count,
            issue_ids=p.issue_ids,
            metrics_involved=p.metrics_involved,
            is_cross_metric=p.is_cross_metric,
            distinct_test_cases=p.distinct_test_cases,
            examples=p.examples,
            confidence=p.confidence,
        )
        for p in result.patterns
    ]

    from app.models.align_schemas import LearningArtifactSchema, PipelineResultSchema

    learnings = [
        LearningArtifactSchema(
            title=la.title,
            content=la.content,
            tags=la.tags,
            confidence=la.confidence,
            supporting_item_ids=la.supporting_item_ids,
            recommended_actions=la.recommended_actions,
            counterexamples=la.counterexamples,
            scope=la.scope,
            when_not_to_apply=la.when_not_to_apply,
        )
        for la in result.learnings
    ]

    pipeline_metadata = None
    if result.pipeline_result:
        pipeline_metadata = PipelineResultSchema(
            filtered_count=result.pipeline_result.filtered_count,
            deduplicated_count=result.pipeline_result.deduplicated_count,
            validation_repairs=result.pipeline_result.validation_repairs,
            total_analyzed=result.pipeline_result.total_analyzed,
            clustering_method=result.pipeline_result.clustering_method,
        )

    return InsightResultSchema(
        patterns=patterns,
        learnings=learnings,
        total_issues_analyzed=result.total_issues_analyzed,
        pipeline_metadata=pipeline_metadata,
    )


class ReportRequest:
    """Request model for report generation."""

    def __init__(
        self,
        mode: str = "low",
        report_type: str = "summary",
        metric_filter: str | None = None,
        score_threshold: float = 0.5,
        max_issues: int = 100,
        data: list[dict[str, Any]] | None = None,
        model: str = "gpt-4o-mini",
        provider: str = "openai",
    ) -> None:
        """Initialize the report request with generation parameters."""
        self.mode = mode
        self.report_type = report_type
        self.metric_filter = metric_filter
        self.score_threshold = score_threshold
        self.max_issues = max_issues
        self.data = data or []
        self.model = model
        self.provider = provider


@router.post("/generate/stream")
async def generate_report_stream(request: dict[str, Any]) -> EventSourceResponse:
    """Stream report generation with real-time thought updates via SSE.

    Events:
    - `thought`: Progress updates during generation
    - `insights`: Structured insight patterns (before response)
    - `response`: Final report when complete
    - `error`: Error occurred
    - `done`: Stream complete
    """

    async def event_generator() -> AsyncGenerator[dict[str, str], None]:
        logger.info("=== REPORT STREAM START ===")

        try:
            # Parse request
            mode = request.get("mode", "low")
            report_type_str = request.get("report_type", "summary")
            metric_filter = request.get("metric_filter")
            data = request.get("data", [])
            model = request.get("model", "gpt-4o-mini")
            provider = request.get("provider", "openai")

            # Parse extraction config
            config_data = request.get("extraction_config", {})
            extraction_config = ExtractionConfig(
                score_threshold=config_data.get("score_threshold", 0.5),
                include_nan=config_data.get("include_nan", False),
                metric_filters=config_data.get("metric_filters", []),
                max_issues=config_data.get("max_issues", 100),
                sample_rate=config_data.get("sample_rate", 1.0),
                include_context_fields=config_data.get(
                    "include_context_fields",
                    ["query", "actual_output", "expected_output", "signals"],
                ),
            )

            logger.info(
                f"Request: mode={mode}, type={report_type_str}, "
                f"filter={metric_filter}, config={extraction_config}, "
                f"records={len(data)}"
            )

            # Validate
            if not data:
                error_data = json.dumps({"error": "No data provided for report generation"})
                yield {"event": SSEEventType.ERROR.value, "data": error_data}
                yield {"event": SSEEventType.DONE.value, "data": ""}
                return

            # Check LLM configuration for the specific requested provider
            llm_info = get_configured_llm_info()
            if not llm_info["providers"].get(provider, False):
                error_data = json.dumps(
                    {
                        "error": f"LLM provider '{provider}' is not configured. "
                        f"Available providers: {[p for p, v in llm_info['providers'].items() if v]}"
                    }
                )
                yield {"event": SSEEventType.ERROR.value, "data": error_data}
                yield {"event": SSEEventType.DONE.value, "data": ""}
                return

            # Emit: Starting extraction
            config_summary = f"threshold={extraction_config.score_threshold}, sample={extraction_config.sample_rate*100:.0f}%"
            if extraction_config.metric_filters:
                config_summary += f", metrics={extraction_config.metric_filters}"
            thought_data = json.dumps(
                {
                    "id": "extract-1",
                    "type": ThoughtType.PLANNING.value,
                    "content": f"Extracting {mode}-scoring issues from {len(data)} records ({config_summary})...",
                    "node_name": None,
                    "skill_name": "issue_extractor",
                    "metadata": {"config": extraction_config.model_dump()},
                    "timestamp": "",
                    "color": "#F59E0B",
                }
            )
            yield {"event": SSEEventType.THOUGHT.value, "data": thought_data}
            await asyncio.sleep(0.1)

            # Extract issues
            service = IssueExtractorService(mode=mode, config=extraction_config)
            extraction_result = service.extract_issues(
                data=data,
                metric_filter=metric_filter,
            )

            # Emit: Extraction complete
            thought_data = json.dumps(
                {
                    "id": "extract-2",
                    "type": ThoughtType.OBSERVATION.value,
                    "content": f"Found {extraction_result.issues_found} issues across {len(extraction_result.metrics_covered)} metrics",
                    "node_name": None,
                    "skill_name": "issue_extractor",
                    "metadata": {
                        "issues_found": extraction_result.issues_found,
                        "metrics": extraction_result.metrics_covered,
                    },
                    "timestamp": "",
                    "color": "#10B981",
                }
            )
            yield {"event": SSEEventType.THOUGHT.value, "data": thought_data}
            await asyncio.sleep(0.1)

            if extraction_result.issues_found == 0:
                response_data = json.dumps(
                    {
                        "success": True,
                        "report_text": f"No {mode}-scoring issues found with threshold {extraction_config.score_threshold}.",
                        "issues_analyzed": 0,
                        "metrics_covered": [],
                    }
                )
                yield {"event": SSEEventType.RESPONSE.value, "data": response_data}
                yield {"event": SSEEventType.DONE.value, "data": ""}
                return

            # Emit: Generating report + analyzing patterns
            thought_data = json.dumps(
                {
                    "id": "generate-1",
                    "type": ThoughtType.REASONING.value,
                    "content": f"Generating {report_type_str} report and analyzing patterns across metrics using {model}...",
                    "node_name": None,
                    "skill_name": "report_generator",
                    "metadata": {"model": model, "provider": provider},
                    "timestamp": "",
                    "color": "#3B82F6",
                }
            )
            yield {"event": SSEEventType.THOUGHT.value, "data": thought_data}
            await asyncio.sleep(0.1)

            # Run report generation and insight extraction concurrently
            report_type = ReportType(report_type_str)
            report_coro = service.generate_report(
                issues=extraction_result,
                report_type=report_type,
                model=model,
                provider=provider,
            )
            insights_coro = generate_insights(
                extraction_result=extraction_result,
                model=model,
                provider=provider,
            )

            results = await asyncio.gather(report_coro, insights_coro, return_exceptions=True)

            report_result = results[0]
            insights_result = results[1]

            # Handle report result
            if isinstance(report_result, BaseException):
                raise report_result
            report_text: str = report_result

            # Handle insights result (graceful degradation)
            insights_schema: InsightResultSchema | None = None
            if isinstance(insights_result, Exception):
                logger.warning(
                    f"Insight extraction failed (report still succeeded): {insights_result}"
                )
            else:
                try:
                    insights_schema = _insight_result_to_schema(insights_result)
                except Exception as e:
                    logger.warning(f"Failed to convert insights to schema: {e}")

            # Emit: Complete
            thought_data = json.dumps(
                {
                    "id": "complete-1",
                    "type": ThoughtType.SUCCESS.value,
                    "content": f"Report generated successfully ({len(report_text)} characters)"
                    + (
                        f" with {len(insights_schema.patterns)} patterns discovered"
                        if insights_schema and insights_schema.patterns
                        else ""
                    ),
                    "node_name": None,
                    "skill_name": "report_generator",
                    "metadata": {},
                    "timestamp": "",
                    "color": "#22C55E",
                }
            )
            yield {"event": SSEEventType.THOUGHT.value, "data": thought_data}

            # Emit insights event (before response) if available
            if insights_schema:
                insights_data = json.dumps(insights_schema.model_dump())
                yield {"event": SSEEventType.INSIGHTS.value, "data": insights_data}

            # Send final response
            response_payload: dict[str, Any] = {
                "success": True,
                "report_text": report_text,
                "issues_analyzed": extraction_result.issues_found,
                "metrics_covered": extraction_result.metrics_covered,
            }
            if insights_schema:
                response_payload["insights"] = insights_schema.model_dump()

            response_data = json.dumps(response_payload)
            yield {"event": SSEEventType.RESPONSE.value, "data": response_data}

        except Exception as e:
            logger.error(f"Report stream error: {e}", exc_info=True)
            error_data = json.dumps({"error": str(e)})
            yield {"event": SSEEventType.ERROR.value, "data": error_data}

        finally:
            logger.info("=== REPORT STREAM END ===")
            yield {"event": SSEEventType.DONE.value, "data": ""}

    return EventSourceResponse(event_generator())


@router.post("/generate")
async def generate_report(request: dict[str, Any]) -> dict[str, Any]:
    """Non-streaming report generation endpoint.

    Returns the complete report after processing.
    """
    logger.info("=== REPORT GENERATE START ===")

    try:
        # Parse request
        mode = request.get("mode", "low")
        report_type_str = request.get("report_type", "summary")
        metric_filter = request.get("metric_filter")
        data = request.get("data", [])
        model = request.get("model", "gpt-4o-mini")
        provider = request.get("provider", "openai")

        # Parse extraction config
        config_data = request.get("extraction_config", {})
        extraction_config = ExtractionConfig(
            score_threshold=config_data.get("score_threshold", 0.5),
            include_nan=config_data.get("include_nan", False),
            metric_filters=config_data.get("metric_filters", []),
            max_issues=config_data.get("max_issues", 100),
            sample_rate=config_data.get("sample_rate", 1.0),
            include_context_fields=config_data.get(
                "include_context_fields", ["query", "actual_output", "expected_output", "signals"]
            ),
        )

        logger.info(
            f"Request: mode={mode}, type={report_type_str}, "
            f"filter={metric_filter}, config={extraction_config}, "
            f"records={len(data)}"
        )

        if not data:
            raise HTTPException(status_code=400, detail="No data provided for report generation")

        # Check LLM configuration for the specific requested provider
        llm_info = get_configured_llm_info()
        if not llm_info["providers"].get(provider, False):
            configured = [p for p, v in llm_info["providers"].items() if v]
            raise HTTPException(
                status_code=400,
                detail=f"LLM provider '{provider}' is not configured. Available: {configured}",
            )

        # Extract issues
        service = IssueExtractorService(mode=mode, config=extraction_config)
        extraction_result = service.extract_issues(
            data=data,
            metric_filter=metric_filter,
        )

        if extraction_result.issues_found == 0:
            return {
                "success": True,
                "report_text": f"No {mode}-scoring issues found with threshold {extraction_config.score_threshold}.",
                "issues_analyzed": 0,
                "metrics_covered": [],
                "insights": None,
            }

        # Run report generation and insight extraction concurrently
        report_type = ReportType(report_type_str)
        report_coro = service.generate_report(
            issues=extraction_result,
            report_type=report_type,
            model=model,
            provider=provider,
        )
        insights_coro = generate_insights(
            extraction_result=extraction_result,
            model=model,
            provider=provider,
        )

        results = await asyncio.gather(report_coro, insights_coro, return_exceptions=True)

        report_result = results[0]
        insights_result = results[1]

        # Handle report result
        if isinstance(report_result, BaseException):
            raise report_result
        report_text: str = report_result

        # Handle insights result (graceful degradation)
        insights_dict: dict[str, Any] | None = None
        if isinstance(insights_result, Exception):
            logger.warning(f"Insight extraction failed: {insights_result}")
        else:
            try:
                insights_dict = _insight_result_to_schema(insights_result).model_dump()
            except Exception as e:
                logger.warning(f"Failed to convert insights to schema: {e}")

        return {
            "success": True,
            "report_text": report_text,
            "issues_analyzed": extraction_result.issues_found,
            "metrics_covered": extraction_result.metrics_covered,
            "insights": insights_dict,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        logger.info("=== REPORT GENERATE END ===")


@router.post("/extract-issues")
async def extract_issues_preview(request: dict[str, Any]) -> dict[str, Any]:
    """Extract issues without LLM generation (preview before report).

    Useful for showing the user what will be analyzed before generating.
    """
    logger.info("=== EXTRACT ISSUES PREVIEW ===")

    try:
        mode = request.get("mode", "low")
        metric_filter = request.get("metric_filter")
        data = request.get("data", [])

        # Parse extraction config
        config_data = request.get("extraction_config", {})
        extraction_config = ExtractionConfig(
            score_threshold=config_data.get("score_threshold", 0.5),
            include_nan=config_data.get("include_nan", False),
            metric_filters=config_data.get("metric_filters", []),
            max_issues=config_data.get("max_issues", 100),
            sample_rate=config_data.get("sample_rate", 1.0),
            include_context_fields=config_data.get(
                "include_context_fields", ["query", "actual_output", "expected_output", "signals"]
            ),
        )

        if not data:
            raise HTTPException(status_code=400, detail="No data provided")

        service = IssueExtractorService(mode=mode, config=extraction_config)
        extraction_result = service.extract_issues(
            data=data,
            metric_filter=metric_filter,
        )

        # Convert issues to serializable format
        issues_dict = [
            {
                "id": issue.id,
                "metric_name": issue.metric_name,
                "score": issue.score,
                "query": issue.query[:200] if issue.query else "",
                "actual_output": issue.actual_output[:200] if issue.actual_output else "",
                "expected_output": issue.expected_output[:150] if issue.expected_output else None,
            }
            for issue in extraction_result.issues[:20]  # Limit preview to 20
        ]

        return {
            "success": True,
            "issues": issues_dict,
            "total_issues": extraction_result.issues_found,
            "metrics_covered": extraction_result.metrics_covered,
            "mode": extraction_result.mode,
            "threshold": extraction_result.threshold,
            "config": extraction_config.model_dump(),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Extract issues error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def report_status() -> dict[str, Any]:
    """Check report generation service status."""
    llm_info = get_configured_llm_info()

    return {
        "available": llm_info["configured"],
        "providers": llm_info["providers"],
        "default_model": llm_info["default_model"],
        "report_types": [rt.value for rt in ReportType],
        "report_modes": [rm.value for rm in ReportMode],
        "available_context_fields": AVAILABLE_CONTEXT_FIELDS,
    }
