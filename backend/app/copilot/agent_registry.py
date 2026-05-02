"""Registry for pluggable copilot agent classes.

Usage inside a plugin's ``register(app)`` hook::

    from app.copilot.agent_registry import register_agent
    from .my_agent import MyAgent

    def register(app):
        register_agent("my_agent", MyAgent)

The name must match the ``agent_name`` field sent in ``CopilotRequest``.

Constraint: ``__init__(thought_stream=None)`` must be cheap and side-effect-free.
The registry probes it once at registration time to validate protocol conformance;
the router also calls it once per request.
"""

from __future__ import annotations

import inspect
import logging

logger = logging.getLogger("axis.copilot.agent_registry")

# Maps agent_name → agent class (not instance; instantiated per-request)
_registry: dict[str, type] = {}


def register_agent(name: str, agent_cls: type) -> None:
    """Register a custom agent class under ``name``.

    Validates that ``agent_cls`` satisfies ``CopilotAgentProtocol`` by probing
    it at registration time, so misconfigured plugins fail at startup rather
    than mid-stream.

    Raises:
        TypeError: if ``__init__`` raises or the class does not satisfy the protocol.
    """
    from app.copilot.agent_protocol import CopilotAgentProtocol

    # Probe __init__ with thought_stream=None (must be cheap + side-effect-free)
    try:
        probe = agent_cls(thought_stream=None)
    except Exception as exc:
        raise TypeError(
            f"Agent {agent_cls.__qualname__!r} __init__(thought_stream=None) failed: {exc}"
        ) from exc

    if not isinstance(probe, CopilotAgentProtocol):
        raise TypeError(
            f"Agent {agent_cls.__qualname__!r} does not satisfy CopilotAgentProtocol "
            f"(check: is_configured must be a @property, process() must be async def)"
        )

    # Fix A: isinstance only checks attribute presence — verify is_configured is a
    # property (returns bool), not an accidentally bare method (always truthy).
    if not isinstance(probe.is_configured, bool):
        raise TypeError(
            f"Agent {agent_cls.__qualname__!r}.is_configured must be a @property "
            f"returning bool, got {type(probe.is_configured).__name__!r}"
        )

    # Fix B: isinstance doesn't check async — verify process is a coroutine function
    # so the router can safely await it.
    if not inspect.iscoroutinefunction(agent_cls.process):
        raise TypeError(
            f"Agent {agent_cls.__qualname__!r}.process must be defined with `async def`"
        )

    if name in _registry:
        logger.warning(
            "Agent '%s' already registered — overwriting with %s", name, agent_cls.__qualname__
        )
    _registry[name] = agent_cls
    logger.info("Registered custom copilot agent '%s' → %s", name, agent_cls.__qualname__)


def get_agent_class(name: str | None) -> type | None:
    """Return the registered agent class for ``name``, or ``None`` if not found."""
    if name is None:
        return None
    return _registry.get(name)


def list_registered_agents() -> list[str]:
    """Return the names of all registered custom agents."""
    return list(_registry.keys())
