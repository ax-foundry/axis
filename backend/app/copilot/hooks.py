from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

from app.copilot.tracing import get_copilot_tracer, safe_span_attrs

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from app.copilot.context import BaseCopilotContext


@asynccontextmanager
async def tool_span(
    deps: BaseCopilotContext,
    tool_name: str,
    cache_key: str,
    start_msg: str,
    input_dict: dict[str, Any] | None = None,
) -> AsyncGenerator[tuple[Any, Any, str | None], None]:
    """Span + cache check + emit_tool_use. Yields (_tracer, _span, cached_result).

    Usage::

        async with tool_span(deps, "my_tool", cache_str, "Doing work...") as (_tracer, _span, cached):
            if cached:
                return cached
            # ... business logic ...
            await deps.thought_stream.emit_observation("Done: N rows", tool_name="my_tool")
            out = _safe_json(result)
            deps.set_cached("my_tool", cache_str, out)
            _tracer.add_trace("info", "tool_complete", metadata={"result_len": len(out)})
            _span.set_output(out[:500])
            return out
    """
    _tracer = get_copilot_tracer()
    async with _tracer.async_span(
        "copilot.tool.call",
        input=input_dict or {},
        **safe_span_attrs(tool_name=tool_name, dataset=deps.dataset_label),
    ) as _span:
        cached = deps.get_cached(tool_name, cache_key)
        _tracer.add_trace("info", "cache_hit" if cached else "cache_miss")
        if not cached:
            await deps.thought_stream.emit_tool_use(start_msg, tool_name=tool_name)
        yield _tracer, _span, cached
