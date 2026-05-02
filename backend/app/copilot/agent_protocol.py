"""Protocol definition for pluggable copilot agents."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

if TYPE_CHECKING:
    from app.copilot.thoughts import ThoughtStream


@runtime_checkable
class CopilotAgentProtocol(Protocol):
    """Protocol that custom copilot agents must satisfy.

    Implement this interface to replace the built-in agent for any named
    ``agent_name`` value.  Register your class via ``register_agent()`` inside
    your plugin's ``register(app)`` hook and it will be selected automatically
    when a request arrives with a matching ``agent_name``.

    **Hard requirements** (enforced by ``register_agent()`` at startup):

    1. ``__init__`` **must** accept ``thought_stream=None`` and be cheap / side-effect-free.
       The registry probes it once to validate conformance; the router calls it again per
       request with a real ``ThoughtStream``.

    2. ``is_configured`` **must** be a ``@property`` that returns a plain ``bool``.
       Defining it as a regular method instead causes the router to treat the bound
       method object as truthy and never enter the "not configured" branch.

    3. ``process`` **must** be ``async def``.
       A sync ``def process`` passes the ``isinstance`` check but crashes mid-stream
       when the router tries to ``await`` it.

    Example::

        from app.copilot.thoughts import ThoughtStream

        class MyAgent:
            def __init__(self, thought_stream: ThoughtStream | None = None) -> None:
                self.thought_stream = thought_stream or ThoughtStream()

            @property
            def is_configured(self) -> bool:
                return True

            async def process(self, *, message, **kwargs):
                await self.thought_stream.emit_reasoning("Thinking...", node_name="MyAgent")
                return "Hello from MyAgent!", None, None
    """

    def __init__(self, thought_stream: ThoughtStream | None = None) -> None:  # noqa: D107
        ...

    @property
    def is_configured(self) -> bool:
        """Return True when the agent has valid credentials and is ready to run."""
        ...

    async def process(
        self,
        *,
        message: str,
        dataset_label: str | None = None,
        data_context: dict[str, Any] | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
        user_id: str | None = None,
        agent_name: str | None = None,
    ) -> tuple[str, dict[str, Any] | None, dict[str, Any] | None]:
        """Run the agent and return ``(response_text, chart_spec, download_spec)``.

        Emit thoughts via ``self.thought_stream`` during processing.
        The router guarantees the stream is closed after this method returns,
        so you do **not** need to call ``thought_stream.close()`` yourself.
        """
        ...
