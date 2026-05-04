import asyncio
import contextlib
import hashlib
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.config.agents import agents_config
from app.config.constants import Headers
from app.config.env import settings
from app.copilot.agent_registry import get_agent_class, list_registered_agents
from app.copilot.oai_agent import OAICopilotAgent
from app.copilot.thoughts import ThoughtStream
from app.copilot.tracing import get_request_tracer, safe_span_attrs
from app.models.copilot_schemas import (
    CopilotRequest,
    CopilotResponse,
    SSEEventType,
    ThoughtSchema,
    ThoughtType,
    ToolInfoSchema,
    ToolsListResponse,
)

logger = logging.getLogger("axis.routers.ai")

router = APIRouter()


def _validate_agent_name(agent_name: str | None) -> None:
    """Raise HTTP 400 if agent_name is set but not in the agent registry or plugin registry."""
    if agent_name is None:
        return
    # Plugin-registered agents are always valid
    if get_agent_class(agent_name) is not None:
        return
    known = {a.name for a in agents_config}
    if known and agent_name not in known:
        all_known = sorted(known | set(list_registered_agents()))
        raise HTTPException(
            status_code=400,
            detail=f"Unknown agent '{agent_name}'. Available: {all_known}",
        )


def _resolve_user_id(http_request: Request, copilot_request: CopilotRequest) -> str | None:
    """Header always wins; body field is fallback for non-proxied/internal callers.

    Applies user_id_mode transformation (raw email, sub, or hashed).
    """
    raw = http_request.headers.get(Headers.X_AXIS_USER_ID) or copilot_request.user_id
    if not raw:
        return None

    mode = getattr(settings, "user_id_mode", "email")
    if mode == "hashed_email":
        return hashlib.sha256(raw.encode()).hexdigest()[:16]
    # "email" and "sub" pass through as-is
    return raw


class ChatMessage(BaseModel):
    """A single chat message with role and content."""

    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    """Request payload for the chat endpoint."""

    messages: list[ChatMessage]
    data_context: dict[str, Any] | None = None
    stream: bool = False


class QueryRequest(BaseModel):
    """Request payload for natural language data queries."""

    query: str
    data: list[dict[str, Any]] | None = None


@router.post("/chat")
async def chat(request: ChatRequest) -> dict[str, object]:
    """Chat with the AI copilot.

    Returns analysis and insights about evaluation data.
    """
    try:
        # Check if OpenAI is configured
        if not settings.gateway_api_key and not settings.openai_api_base:
            return {
                "success": False,
                "message": "AI features require OpenAI API configuration",
                "response": None,
            }

        # For now, return a placeholder response
        # Full implementation will use pydantic-ai or langchain
        return {
            "success": True,
            "response": {
                "role": "assistant",
                "content": "AI Copilot is being configured. Full implementation coming soon.",
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {e!s}")


@router.post("/query")
async def query_data(request: QueryRequest) -> dict[str, object]:
    """Query the evaluation data using natural language."""
    try:
        if not request.data:
            return {
                "success": False,
                "message": "No data provided for query",
            }

        # Placeholder for NL query implementation
        return {
            "success": True,
            "query": request.query,
            "results": [],
            "message": "Natural language query processing coming soon",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query error: {e!s}")


@router.post("/analyze")
async def analyze_data(data: list[dict[str, Any]], focus: str | None = None) -> dict[str, object]:
    """Generate automated analysis of evaluation data."""
    try:
        import numpy as np
        import pandas as pd

        df = pd.DataFrame(data)

        # Basic automated insights
        insights = []

        # Find numeric columns
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

        for col in numeric_cols[:5]:  # Limit to first 5 metrics
            values = df[col].dropna()
            if len(values) > 0:
                mean_val = values.mean()
                if mean_val < 0.5:
                    insights.append(
                        {
                            "type": "warning",
                            "metric": col,
                            "message": f"{col} has a low average score ({mean_val:.2f})",
                        }
                    )
                elif mean_val > 0.8:
                    insights.append(
                        {
                            "type": "success",
                            "metric": col,
                            "message": f"{col} is performing well ({mean_val:.2f})",
                        }
                    )

                # Check for high variance
                if len(values) > 1 and values.std() > 0.3:
                    insights.append(
                        {
                            "type": "info",
                            "metric": col,
                            "message": f"{col} shows high variance (std={values.std():.2f})",
                        }
                    )

        return {
            "success": True,
            "insights": insights,
            "summary": f"Analyzed {len(df)} records across {len(numeric_cols)} metrics",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {e!s}")


@router.get("/status")
async def ai_status() -> dict[str, object]:
    """Check AI service status and configuration."""
    from app.copilot.llm.provider import LLMProvider

    return {
        "configured": bool(
            settings.gateway_api_key or settings.openai_api_key or settings.anthropic_api_key
        ),
        "model": settings.llm_model_name,
        "providers": {
            "openai": LLMProvider.is_configured("openai"),
            "anthropic": LLMProvider.is_configured("anthropic"),
        },
        "features": {
            "chat": True,
            "query": True,
            "analyze": True,
            "stream": True,
            "copilot": True,
        },
    }


# ============================================
# Copilot SSE Streaming Endpoints
# ============================================


async def _copilot_stream_generator(
    agent_class: type,
    route_name: str,
    request: CopilotRequest,
    http_request: Request,
) -> AsyncGenerator[dict[str, str], None]:
    """SSE generator for copilot streams.

    Provider/framework labels are NOT router concerns — the agent wrapper
    passes them into ``run_copilot_request()`` internally.
    """
    logger.info("=== %s START ===", route_name.upper().replace(".", " "))
    logger.info("Message: %s...", request.message[:100])
    logger.info("Dataset: %s", request.dataset_label)

    # Plugin agents take priority over the built-in agent_class
    effective_cls = get_agent_class(request.agent_name) or agent_class

    # Provider label for tracing — plugin agents report as "plugin"
    provider = "plugin" if effective_cls is not agent_class else "oai_agents"

    tracer = get_request_tracer(
        route_name=route_name,
        environment=getattr(settings, "environment", None),
        session_id=request.session_id,
        user_id=_resolve_user_id(http_request, request),
    )

    thought_stream = ThoughtStream()
    try:
        agent = effective_cls(thought_stream=thought_stream)
        configured = agent.is_configured
    except Exception as exc:
        logger.exception("Agent %s failed to initialize", effective_cls.__qualname__)
        yield {
            "event": SSEEventType.ERROR.value,
            "data": json.dumps({"error": f"Agent init failed: {exc}"}),
        }
        yield {"event": SSEEventType.DONE.value, "data": ""}
        return

    if not configured:
        logger.warning("Ask Copilot not configured - no API credentials")
        yield {
            "event": SSEEventType.ERROR.value,
            "data": json.dumps(
                {
                    "error": (
                        "Ask Copilot is not configured. "
                        "Please set up OpenAI or Anthropic API credentials."
                    )
                }
            ),
        }
        yield {"event": SSEEventType.DONE.value, "data": ""}
        return

    # Prepare data context (schema hints only — data lives in DuckDB)
    data_context: dict[str, object] = {}
    if request.data_context:
        data_context = {
            "format": request.data_context.format,
            "row_count": request.data_context.row_count,
            "metric_columns": request.data_context.metric_columns,
            "columns": request.data_context.columns,
        }

    async with tracer.async_span(
        "copilot.pipeline",
        input=request.message,
        **safe_span_attrs(
            route_name=route_name,
            provider=provider,
            dataset_label=request.dataset_label,
            msg_len=len(request.message),
            history_len=len(request.conversation_history or []),
        ),
    ) as _root_span:
        # Wrap process() so the thought stream is always closed on completion.
        # Built-in agents close it inside run_copilot_request(); closing twice is
        # idempotent.  Plugin agents are not required to close it themselves.
        _process_kwargs = {
            "message": request.message,
            "dataset_label": request.dataset_label,
            "data_context": data_context,
            "conversation_history": request.conversation_history,
            "user_id": _resolve_user_id(http_request, request),
            "agent_name": request.agent_name,
        }

        async def _run_agent() -> tuple[str, dict[str, Any] | None, dict[str, Any] | None]:
            try:
                result: tuple[
                    str, dict[str, Any] | None, dict[str, Any] | None
                ] = await agent.process(**_process_kwargs)
                return result
            finally:
                await thought_stream.close()  # idempotent

        task = asyncio.create_task(_run_agent())

        try:
            subscriber = await thought_stream.subscribe()

            async for thought in subscriber:
                yield {"event": SSEEventType.THOUGHT.value, "data": thought.to_json()}

            response, chart, download = await task
            logger.info("Task completed. Response length: %d", len(response) if response else 0)

            _root_span.set_output(response or "")
            tracer.add_trace(
                "info",
                "response_ready",
                metadata={
                    "response_len": len(response or ""),
                    "has_chart": bool(chart),
                    "has_download": bool(download),
                    "thoughts_count": len(thought_stream.thoughts),
                },
            )
            tracer.complete(output_data={"response_len": len(response or "")})

            yield {
                "event": SSEEventType.RESPONSE.value,
                "data": json.dumps(
                    {
                        "success": True,
                        "response": response,
                        "thoughts_count": len(thought_stream.thoughts),
                        "chart": chart,
                        "download": download,
                    }
                ),
            }

        except asyncio.CancelledError:
            tracer.add_trace("info", "client_disconnected")
            if not task.done():
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
            raise

        except Exception as e:
            logger.error("%s error: %s", route_name, e, exc_info=True)
            tracer.fail(error=type(e).__name__)
            yield {"event": SSEEventType.ERROR.value, "data": json.dumps({"error": str(e)})}
            if not task.done():
                task.cancel()

        finally:
            logger.info("=== %s END ===", route_name.upper().replace(".", " "))
            yield {"event": SSEEventType.DONE.value, "data": ""}


@router.post("/copilot/stream")
async def copilot_stream(request: CopilotRequest, http_request: Request) -> EventSourceResponse:
    r"""Stream copilot responses with real-time thoughts via Server-Sent Events.

    Events: ``thought``, ``response``, ``error``, ``done``.
    """
    _validate_agent_name(request.agent_name)
    return EventSourceResponse(
        _copilot_stream_generator(OAICopilotAgent, "copilot.stream", request, http_request)
    )


@router.post("/copilot/chat")
async def copilot_chat(request: CopilotRequest, http_request: Request) -> CopilotResponse:
    """Non-streaming copilot endpoint for simple requests.

    Returns the complete response with all thoughts after processing.
    Use /copilot/stream for real-time thought streaming.
    """
    _validate_agent_name(request.agent_name)

    thought_stream = ThoughtStream()
    agent_cls = get_agent_class(request.agent_name) or OAICopilotAgent
    agent = agent_cls(thought_stream=thought_stream)

    if not agent.is_configured:
        return CopilotResponse(
            success=False,
            response="Ask Copilot is not configured. Please set up OpenAI or Anthropic API credentials.",
            thoughts=[],
            tools_used=[],
        )

    # Prepare data context (schema hints only — data lives in DuckDB)
    data_context: dict[str, object] = {}
    if request.data_context:
        data_context = {
            "format": request.data_context.format,
            "row_count": request.data_context.row_count,
            "metric_columns": request.data_context.metric_columns,
            "columns": request.data_context.columns,
        }

    tracer = get_request_tracer(
        route_name="copilot.chat",
        environment=getattr(settings, "environment", None),
        session_id=request.session_id,
        user_id=_resolve_user_id(http_request, request),
    )
    async with tracer.async_span(
        "copilot.pipeline",
        input=request.message,
        **safe_span_attrs(
            route_name="copilot.chat",
            provider="oai_agents",
            dataset_label=request.dataset_label,
            msg_len=len(request.message),
            history_len=len(request.conversation_history or []),
        ),
    ) as _root_span:
        try:
            response, _chart, _download = await agent.process(
                message=request.message,
                dataset_label=request.dataset_label,
                data_context=data_context,
                conversation_history=request.conversation_history,
                user_id=_resolve_user_id(http_request, request),
                agent_name=request.agent_name,
            )

            # Convert thoughts to schema
            thoughts = [
                ThoughtSchema(
                    id=t.id,
                    type=ThoughtType(t.type.value),
                    content=t.content,
                    node_name=t.node_name,
                    tool_name=t.tool_name,
                    metadata=t.metadata,
                    timestamp=t.timestamp.isoformat(),
                    color=t.to_dict()["color"],
                )
                for t in thought_stream.thoughts
            ]

            # Get tools used
            tools_used = list({t.tool_name for t in thought_stream.thoughts if t.tool_name})

            _root_span.set_output(response or "")
            tracer.complete(output_data={"response_len": len(response or "")})
            return CopilotResponse(
                success=True,
                response=response,
                thoughts=thoughts,
                tools_used=tools_used,
            )

        except Exception as e:
            logger.error(f"Copilot chat error: {e}", exc_info=True)
            tracer.fail(error=type(e).__name__)
            return CopilotResponse(
                success=False,
                response=f"An error occurred: {e}",
                thoughts=[],
                tools_used=[],
            )


@router.get("/copilot/tools")
async def list_copilot_tools() -> ToolsListResponse:
    """List available copilot tools.

    Returns information about all available tools including
    their descriptions and capabilities.
    """
    agent = OAICopilotAgent()
    tools = agent.get_available_tools()

    tool_infos = []
    for tool in tools:
        tool_infos.append(
            ToolInfoSchema(
                name=tool["name"],
                description=tool["description"],
                version="1.0.0",
                parameters=[],  # Tools use native function calling, no explicit params
                tags=[],
                enabled=True,
            )
        )

    return ToolsListResponse(
        success=True,
        tools=tool_infos,
        total=len(tool_infos),
    )


@router.get("/copilot/schema-dump")
async def schema_dump() -> dict[str, Any]:
    """Return raw DuckDB table metadata and metric catalog for all loaded tables.

    Used by scripts/generate_schema_hints.py and scripts/generate_metric_catalog.py
    to generate config scaffolds without needing direct DuckDB file access
    (which is blocked while the backend runs).
    """
    from app.copilot.metric_catalog import get_metric_catalog_store
    from app.services.duckdb_store import DATASET_TABLE_MAP, get_store

    store = get_store()
    tables: dict[str, Any] = {}

    seen: set[str] = set()
    for table in DATASET_TABLE_MAP.values():
        if table in seen:
            continue
        seen.add(table)
        if not store.has_table(table):
            continue
        meta = store.get_metadata(table)
        tables[table] = {
            "columns": meta.get("columns", []),
            "filter_values": meta.get("filter_values", {}),
            "row_count": meta.get("row_count", 0),
        }

    # Include the rich human-signals metric schema KV
    hs_schema = store.get_kv("human_signals_metric_schema")

    # Include current metric catalog (what's loaded in memory)
    catalog_store = get_metric_catalog_store()
    catalog_summary: dict[str, Any] = {}
    for domain in catalog_store.all_domains():
        catalog_summary[domain] = [
            {
                "name": e.name,
                "description": e.description,
                "category": e.category,
                "score_range": e.score_range,
                "has_signals": e.signals is not None,
            }
            for e in catalog_store.list_entries(domain)
        ]

    return {
        "tables": tables,
        "human_signals_metric_schema": hs_schema,
        "metric_catalog": catalog_summary,
    }
