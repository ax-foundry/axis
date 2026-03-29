from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import anyio

from app.copilot.guardrails import RequestBlocked, sanitize_output
from app.copilot.request_classifier import PreparedRequest, prepare_request
from app.copilot.tracing import get_copilot_tracer, safe_span_attrs

if TYPE_CHECKING:
    from app.copilot.thoughts import ThoughtStream

logger = logging.getLogger("axis.copilot.request_router")

ContextFactory = Callable[
    [PreparedRequest, str | None, dict[str, Any] | None, str | None, str | None],
    Any,
]
"""(prepared, dataset_label, data_context, user_id, agent_name) → deps/context"""

AgentExecutor = Callable[[PreparedRequest, Any], Awaitable[str]]
"""(prepared, ctx) → raw output string (before sanitization)"""


@dataclass
class RequestResult:
    """Result of a copilot request."""

    response: str
    chart_spec: dict[str, Any] | None = None
    download_spec: dict[str, Any] | None = None


_GENERIC_ERROR = "I encountered an error processing your request. Please make sure you are asking about the current dataset and try again."


async def run_copilot_request(
    *,
    message: str,
    thought_stream: ThoughtStream,
    build_context: ContextFactory,
    execute: AgentExecutor,
    dataset_label: str | None = None,
    data_context: dict[str, Any] | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
    user_id: str | None = None,
    agent_name: str | None = None,
    provider_label: str = "pydantic_ai",
    agent_framework: str = "pydantic_ai",
) -> RequestResult:
    """Run the full copilot request lifecycle.

    1. Prepare request (sanitize + skill/example selection)
    2. Open tracer span
    3. Build framework-specific context
    4. Execute agent
    5. Sanitize output
    6. Return result

    Args:
        message: Raw user message.
        thought_stream: Stream for emitting thoughts to the client.
        build_context: Callback to construct framework-specific deps/context.
        execute: Callback to run the agent and return raw output.
        dataset_label: Dataset to query.
        data_context: Optional schema hints.
        conversation_history: Prior conversation turns.
        user_id: Resolved user identifier.
        agent_name: Agent/source filter.
        provider_label: Tracer attribute for provider (e.g. ``"pydantic_ai"``).
        agent_framework: Tracer attribute for framework (e.g. ``"pydantic_ai"``).
    """
    # 1. Prepare request — guardrails + skill/example selection
    try:
        prepared = prepare_request(message, conversation_history, agent_name)
    except RequestBlocked as exc:
        logger.warning("Input blocked by guardrail: %s", exc.response)
        await thought_stream.emit_decision("Request blocked by guardrails", node_name="Router")
        await thought_stream.close()
        return RequestResult(response=exc.response)

    # 2. Emit planning thought if skills were selected
    if prepared.selected_skill_names:
        await thought_stream.emit_planning(
            f"Applying skills: {', '.join(prepared.selected_skill_names)}",
            node_name="Router",
        )

    # 3. Emit reasoning thought
    await thought_stream.emit_reasoning(
        f"Processing: {prepared.message[:100]}...",
        node_name="Router",
    )

    tracer = get_copilot_tracer()
    async with tracer.async_span(
        "copilot.agent.run",
        input=prepared.message,
        **safe_span_attrs(
            provider=provider_label,
            agent_framework=agent_framework,
            dataset_label=dataset_label,
            msg_len=len(prepared.message),
        ),
    ) as _proc_span:
        try:
            # 4. Build context
            ctx = build_context(prepared, dataset_label, data_context, user_id, agent_name)

            # 5. Execute agent
            raw_output = await execute(prepared, ctx)

            # 6. Sanitize output
            safe_response = sanitize_output(raw_output)

            # 7. Extract chart/download specs
            chart_spec = getattr(ctx, "chart_spec", None)
            download_spec = getattr(ctx, "download_spec", None)

            await thought_stream.emit_success("Request completed", node_name="Router")
            _proc_span.set_output(
                safe_response[:500] if len(safe_response) > 500 else safe_response
            )

            # Fire-and-forget memory extraction (stored to satisfy RUF006)
            _mem_task = asyncio.create_task(_extract_memory_bg(ctx))
            _mem_task.add_done_callback(lambda _: None)  # prevent GC before completion

            return RequestResult(
                response=safe_response,
                chart_spec=chart_spec,
                download_spec=download_spec,
            )

        except Exception as e:
            logger.error("Agent error: %s", e, exc_info=True)
            await thought_stream.emit_error("Agent error", node_name="Router")
            tracer.add_trace("error", type(e).__name__)
            return RequestResult(response=_GENERIC_ERROR)

        finally:
            await thought_stream.close()


async def _extract_memory_bg(ctx: Any) -> None:
    """Fire-and-forget memory extraction. Never raises."""
    try:
        if not getattr(ctx, "sql_executed_this_turn", False):
            return
        from app.config.env import settings

        if not settings.copilot_memory_enabled:
            return

        from app.copilot.memory import get_copilot_memory_store, schema_fingerprint

        table = ctx.table_name
        store = ctx.store
        schema_fp = schema_fingerprint(store, table)
        known_cols = set(store.get_table_columns(table))

        agent_name = getattr(ctx, "agent_name", None)

        with anyio.fail_after(5):  # hard 5s timeout
            await anyio.to_thread.run_sync(
                lambda: get_copilot_memory_store().record(
                    table_name=table,
                    schema_fp=schema_fp,
                    turn_sql=ctx.turn_sql,
                    error_fixes=ctx.error_fixes,
                    known_columns=known_cols,
                    agent_name=agent_name,
                ),
            )
    except Exception:
        logger.debug("Memory extraction failed (non-fatal)", exc_info=True)
