import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.copilot.agent import CopilotAgent
from app.copilot.thoughts import ThoughtStream
from app.models.copilot_schemas import (
    CopilotRequest,
    CopilotResponse,
    SkillInfoSchema,
    SkillsListResponse,
    SSEEventType,
    ThoughtSchema,
    ThoughtType,
)

logger = logging.getLogger("axis.routers.ai")

router = APIRouter()


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


@router.post("/copilot/stream")
async def copilot_stream(request: CopilotRequest) -> EventSourceResponse:
    r"""Stream copilot responses with real-time thoughts via Server-Sent Events.

    This endpoint provides transparency into the AI's reasoning process
    by streaming thoughts as they occur, followed by the final response.

    Events:
    - `thought`: Individual thought from the copilot (reasoning, tool_use, etc.)
    - `response`: Final response when processing is complete
    - `error`: Error occurred during processing
    - `done`: Stream is complete

    Example usage with curl:
    ```
    curl -N -X POST http://localhost:8500/api/ai/copilot/stream \
      -H "Content-Type: application/json" \
      -d '{"message": "Summarize my evaluation data"}'
    ```
    """

    async def event_generator() -> AsyncGenerator[dict[str, str], None]:
        logger.info("=== COPILOT STREAM START ===")
        logger.info(f"Message: {request.message[:100]}...")
        logger.info(f"Data context: {request.data_context}")
        logger.info(f"Data rows: {len(request.data) if request.data else 0}")

        thought_stream = ThoughtStream()
        agent = CopilotAgent(thought_stream=thought_stream)

        logger.info(f"Agent configured: {agent.is_configured}")

        # Check if copilot is configured
        if not agent.is_configured:
            logger.warning("Copilot not configured - no API credentials")
            error_data = json.dumps(
                {
                    "error": "AI copilot is not configured. Please set up OpenAI or Anthropic API credentials.",
                }
            )
            yield {"event": SSEEventType.ERROR.value, "data": error_data}
            yield {"event": SSEEventType.DONE.value, "data": ""}
            return

        # Prepare data context
        data_context = {}
        if request.data_context:
            data_context = {
                "format": request.data_context.format,
                "row_count": request.data_context.row_count,
                "metric_columns": request.data_context.metric_columns,
                "columns": request.data_context.columns,
            }
        logger.info(f"Prepared data context: {data_context}")

        # Start processing in a task
        logger.info("Starting agent.process task...")
        task = asyncio.create_task(
            agent.process(
                message=request.message,
                data_context=data_context,
                data=request.data,
            )
        )

        # Stream thoughts as they arrive
        try:
            logger.info("Subscribing to thought stream...")
            subscriber = await thought_stream.subscribe()
            logger.info("Subscribed, waiting for thoughts...")

            thought_count = 0
            async for thought in subscriber:
                thought_count += 1
                logger.info(
                    f"Received thought #{thought_count}: type={thought.type.value}, content={thought.content[:50]}..."
                )
                thought_data = thought.to_json()
                yield {"event": SSEEventType.THOUGHT.value, "data": thought_data}

            logger.info(f"Thought stream ended. Total thoughts: {thought_count}")

            # Wait for final response
            logger.info("Waiting for task to complete...")
            response = await task
            logger.info(f"Task completed. Response length: {len(response) if response else 0}")

            # Send final response
            response_data = json.dumps(
                {
                    "success": True,
                    "response": response,
                    "thoughts_count": len(thought_stream.thoughts),
                }
            )
            logger.info("Sending response event")
            yield {"event": SSEEventType.RESPONSE.value, "data": response_data}

        except Exception as e:
            logger.error(f"Copilot stream error: {e}", exc_info=True)
            error_data = json.dumps({"error": str(e)})
            yield {"event": SSEEventType.ERROR.value, "data": error_data}

            # Cancel the task if still running
            if not task.done():
                task.cancel()

        finally:
            logger.info("=== COPILOT STREAM END ===")
            yield {"event": SSEEventType.DONE.value, "data": ""}

    return EventSourceResponse(event_generator())


@router.post("/copilot/chat")
async def copilot_chat(request: CopilotRequest) -> CopilotResponse:
    """Non-streaming copilot endpoint for simple requests.

    Returns the complete response with all thoughts after processing.
    Use /copilot/stream for real-time thought streaming.
    """
    thought_stream = ThoughtStream()
    agent = CopilotAgent(thought_stream=thought_stream)

    if not agent.is_configured:
        return CopilotResponse(
            success=False,
            response="AI copilot is not configured. Please set up OpenAI or Anthropic API credentials.",
            thoughts=[],
            skills_used=[],
        )

    # Prepare data context
    data_context = {}
    if request.data_context:
        data_context = {
            "format": request.data_context.format,
            "row_count": request.data_context.row_count,
            "metric_columns": request.data_context.metric_columns,
            "columns": request.data_context.columns,
        }

    try:
        response = await agent.process(
            message=request.message,
            data_context=data_context,
            data=request.data,
        )

        # Convert thoughts to schema
        thoughts = [
            ThoughtSchema(
                id=t.id,
                type=ThoughtType(t.type.value),
                content=t.content,
                node_name=t.node_name,
                skill_name=t.skill_name,
                metadata=t.metadata,
                timestamp=t.timestamp.isoformat(),
                color=t.to_dict()["color"],
            )
            for t in thought_stream.thoughts
        ]

        # Get skills used
        skills_used = list({t.skill_name for t in thought_stream.thoughts if t.skill_name})

        return CopilotResponse(
            success=True,
            response=response,
            thoughts=thoughts,
            skills_used=skills_used,
        )

    except Exception as e:
        logger.error(f"Copilot chat error: {e}", exc_info=True)
        return CopilotResponse(
            success=False,
            response=f"An error occurred: {e}",
            thoughts=[],
            skills_used=[],
        )


@router.get("/copilot/skills")
async def list_copilot_skills() -> SkillsListResponse:
    """List available copilot tools (formerly called skills).

    Returns information about all available tools including
    their descriptions and capabilities.
    """
    agent = CopilotAgent()
    tools = agent.get_available_tools()

    skill_infos = []
    for tool in tools:
        skill_infos.append(
            SkillInfoSchema(
                name=tool["name"],
                description=tool["description"],
                version="1.0.0",
                parameters=[],  # Tools use native function calling, no explicit params
                tags=[],
                enabled=True,
            )
        )

    return SkillsListResponse(
        success=True,
        skills=skill_infos,
        total=len(skill_infos),
    )
