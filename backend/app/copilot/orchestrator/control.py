"""Control plane: budgets, hop tracking, circuit breaker, cancellation.

Shared across all delegation tools via reference. Enforces operational
safety limits so the orchestrator cannot loop indefinitely or blow budgets.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.copilot.orchestrator import config as cfg

logger = logging.getLogger(__name__)


@dataclass
class DelegationMetrics:
    """Metrics collected per delegation call."""

    delegation_id: str = ""
    agent: str = ""
    latency_ms: float = 0
    input_tokens: int = 0
    output_tokens: int = 0
    status: str = ""
    error: str | None = None


class CircuitBreaker:
    """Per-agent circuit breaker.

    States: closed (normal) → open (failing) → half-open (probing).
    """

    def __init__(
        self,
        threshold: int = cfg.CIRCUIT_BREAKER_THRESHOLD,
        reset_s: float = cfg.CIRCUIT_BREAKER_RESET_S,
        window_s: float = cfg.CIRCUIT_BREAKER_WINDOW_S,
    ):
        self._threshold = threshold
        self._reset_s = reset_s
        self._window_s = window_s
        self._failures: dict[str, list[float]] = {}  # agent → list of failure timestamps
        self._open_until: dict[str, float] = {}  # agent → time when half-open

    def is_open(self, agent: str) -> bool:
        """Check if circuit is open (blocking requests) for this agent."""
        open_until = self._open_until.get(agent)
        if open_until is None:
            return False
        now = time.monotonic()
        if now >= open_until:
            # Half-open: allow one probe
            del self._open_until[agent]
            return False
        return True

    def record_success(self, agent: str) -> None:
        """Reset failure counter on success."""
        self._failures.pop(agent, None)
        self._open_until.pop(agent, None)

    def record_failure(self, agent: str) -> None:
        """Record a failure. Opens circuit if threshold exceeded."""
        now = time.monotonic()
        fails = self._failures.setdefault(agent, [])
        # Prune old failures outside the window
        cutoff = now - self._window_s
        fails[:] = [t for t in fails if t > cutoff]
        fails.append(now)

        if len(fails) >= self._threshold:
            self._open_until[agent] = now + self._reset_s
            logger.warning(
                "Circuit breaker OPEN for agent=%s (failures=%d in %ds, reset in %ds)",
                agent,
                len(fails),
                self._window_s,
                self._reset_s,
            )


class CancellationToken:
    """Cooperative cancellation for delegation tools."""

    def __init__(self) -> None:
        self._cancelled = False

    def cancel(self) -> None:
        self._cancelled = True

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled


class ControlPlane:
    """Tracks budgets, hops, and operational limits for one orchestrator request.

    Created per-request. Shared by reference across all delegation tools.
    """

    def __init__(self, request_id: str | None = None) -> None:
        self.request_id: str = request_id or str(uuid.uuid4())
        self.wall_clock_start: float = time.monotonic()
        self.hop_count: int = 0
        self.total_tool_calls: int = 0
        self.token_budget_used: int = 0
        self.delegations: list[DelegationMetrics] = []
        self.cancellation = CancellationToken()
        self.circuit_breaker = CircuitBreaker()

    # ── Pre-delegation checks ──

    def check_hops(self) -> str | None:
        """Return error message if hop limit exceeded, else None."""
        if self.hop_count >= cfg.MAX_DELEGATION_HOPS:
            return f"Max delegation depth exceeded ({cfg.MAX_DELEGATION_HOPS} hops)"
        return None

    def check_budget(self) -> str | None:
        """Return error message if token budget exhausted, else None."""
        if self.token_budget_used >= cfg.MAX_TOKEN_BUDGET:
            return f"Token budget exhausted ({self.token_budget_used}/{cfg.MAX_TOKEN_BUDGET})"
        return None

    def check_wall_clock(self) -> str | None:
        """Return error message if wall-clock limit exceeded, else None."""
        elapsed = time.monotonic() - self.wall_clock_start
        if elapsed >= cfg.MAX_WALL_CLOCK_S:
            return f"Wall-clock limit exceeded ({elapsed:.0f}s/{cfg.MAX_WALL_CLOCK_S}s)"
        return None

    def check_tool_calls(self) -> str | None:
        """Return error message if tool call limit exceeded, else None."""
        if self.total_tool_calls >= cfg.MAX_TOOL_CALLS_PER_REQUEST:
            return f"Tool call limit exceeded ({cfg.MAX_TOOL_CALLS_PER_REQUEST})"
        return None

    def pre_check(self, agent: str) -> str | None:
        """Run all pre-delegation checks. Returns first error or None."""
        if self.cancellation.is_cancelled:
            return "Request cancelled"
        for check in (self.check_hops, self.check_budget, self.check_wall_clock, self.check_tool_calls):
            err = check()
            if err:
                return err
        if self.circuit_breaker.is_open(agent):
            return f"Agent '{agent}' circuit breaker is open (too many recent failures)"
        return None

    def budget_warning(self) -> str | None:
        """Return a warning string if budget is nearly exhausted, else None."""
        if self.token_budget_used >= cfg.MAX_TOKEN_BUDGET * cfg.TOKEN_BUDGET_WARNING_PCT:
            remaining = cfg.MAX_TOKEN_BUDGET - self.token_budget_used
            return (
                f"Budget nearly exhausted ({self.token_budget_used}/{cfg.MAX_TOKEN_BUDGET} tokens). "
                f"~{remaining} tokens remaining. Synthesize with current results."
            )
        return None

    # ── Recording ──

    def record_delegation(self, metrics: DelegationMetrics) -> None:
        """Record a completed delegation call."""
        self.hop_count += 1
        self.total_tool_calls += 1
        self.token_budget_used += metrics.input_tokens + metrics.output_tokens
        self.delegations.append(metrics)

        if metrics.status == "error":
            self.circuit_breaker.record_failure(metrics.agent)
        else:
            self.circuit_breaker.record_success(metrics.agent)

    def record_tool_call(self) -> None:
        """Record a non-delegation tool call (search_schema, synthesize)."""
        self.total_tool_calls += 1

    # ── Summary ──

    def elapsed_s(self) -> float:
        return time.monotonic() - self.wall_clock_start

    def summary(self) -> dict[str, Any]:
        """Return a summary dict for logging/tracing."""
        return {
            "request_id": self.request_id,
            "elapsed_s": round(self.elapsed_s(), 2),
            "hop_count": self.hop_count,
            "total_tool_calls": self.total_tool_calls,
            "token_budget_used": self.token_budget_used,
            "delegations": len(self.delegations),
            "cancelled": self.cancellation.is_cancelled,
        }
