"""What-If Simulator service.

Stateless simulation engine: extracts fixtures from GENERATION nodes
and re-executes LLM calls with user-supplied overrides. Results are
ephemeral — never persisted to any DB or audit log.
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import logging
import re
import time
from typing import Any

from app.config.env import settings
from app.copilot.llm.provider import LLMProvider, LLMProviderType
from app.plugins.agent_replay.config import get_replay_config
from app.plugins.agent_replay.models.replay_schemas import TokenUsage
from app.plugins.agent_replay.models.whatif_schemas import (
    ChatMessage,
    ChatMessageRole,
    FieldCategory,
    FieldType,
    OverridableField,
    SimulateRequest,
    SimulateResponse,
    StepFixture,
)
from app.plugins.agent_replay.services._shared import (
    SENSITIVE_KEY_PATTERN,
    NodeNotFoundError,
    ReplayServiceError,
    cache_get,
    cache_put,
    compute_latency_ms,
    extract_usage,
    find_tree_node,
    get_loader,
    redact_metadata,
    to_plain_dict,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SIMULATE_SEMAPHORE = asyncio.Semaphore(3)
_SIMULATE_TIMEOUT_S = 60
_MAX_VARIABLE_VALUE_LEN = 50_000

# Internal/system keys that should never be surfaced as overridable variables
_SKIP_VARIABLE_KEYS = frozenset(
    {
        "trace_id",
        "session_id",
        "observation_id",
        "parent_observation_id",
        "span_id",
        "run_id",
        "langfuse_host",
        "langfuse_public_key",
        "langfuse_secret_key",
    }
)

# Variable template patterns: {{var}} and {var}
_TEMPLATE_PATTERN = re.compile(r"\{\{(\w+)\}\}|\{(\w+)\}")


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------


class WhatIfValidationError(Exception):
    """Raised for 422 validation failures in what-if operations."""


class FixtureStaleError(Exception):
    """Raised when fixture_hash doesn't match the current fixture (409)."""


class SimulationTimeoutError(Exception):
    """Raised when LLM call exceeds the timeout (504)."""


class ConcurrencyLimitError(Exception):
    """Raised when simulation semaphore is exhausted (429)."""


# ---------------------------------------------------------------------------
# Fixture extraction
# ---------------------------------------------------------------------------


def _compute_fixture_hash(node_id: str, model: str | None, prompt_content: str) -> str:
    """SHA-256 of (node_id + model + prompt content) for staleness detection."""
    raw = f"{node_id}|{model or ''}|{prompt_content}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _redact_variable_value(key: str, value: str) -> str:
    """Redact variable values that look like credentials."""
    if SENSITIVE_KEY_PATTERN.search(key):
        return "[REDACTED]"
    return value


def _extract_prompt_messages(obs_input: Any) -> list[ChatMessage]:
    """Extract structured chat messages from a Langfuse observation input."""
    if obs_input is None:
        return []

    # Already a list of message dicts
    if isinstance(obs_input, list):
        messages = []
        for item in obs_input:
            if isinstance(item, dict) and "role" in item:
                role_str = str(item.get("role", "user")).lower()
                try:
                    role = ChatMessageRole(role_str)
                except ValueError:
                    role = ChatMessageRole.USER
                messages.append(
                    ChatMessage(
                        role=role,
                        content=str(item.get("content", "")),
                        tool_call_id=item.get("tool_call_id"),
                        name=item.get("name"),
                    )
                )
        return messages

    # Dict with a "messages" key
    if isinstance(obs_input, dict) and "messages" in obs_input:
        return _extract_prompt_messages(obs_input["messages"])

    # Single string — wrap as user message
    if isinstance(obs_input, str):
        return [ChatMessage(role=ChatMessageRole.USER, content=obs_input)]

    return []


def _extract_variables(
    trace: Any,
    obs_name: str | None,
    obs_input: Any,
    metadata: dict[str, Any] | None,
) -> dict[str, str]:
    """Extract template variables from the trace step, falling back to input/metadata.

    Primary source: axion's TraceStep.extract_variables() which uses
    configured prompt_patterns regex to pull structured variables
    (e.g. caseAssessment, contextData) from the GENERATION input.

    Fallback: scan obs_input and metadata dicts for string values.
    """
    variables: dict[str, str] = {}

    # Primary: axion step-level variables (regex-extracted from prompt)
    if obs_name:
        try:
            steps = getattr(trace, "steps", None)
            if steps and obs_name in steps:
                step = steps[obs_name]
                step_vars = step.extract_variables()
                if isinstance(step_vars, dict):
                    for key, value in step_vars.items():
                        if key in _SKIP_VARIABLE_KEYS:
                            continue
                        str_val = str(value) if not isinstance(value, str) else value
                        if len(str_val) > _MAX_VARIABLE_VALUE_LEN:
                            logger.debug(
                                "[WhatIf] variable %r skipped — %d chars exceeds limit %d",
                                key,
                                len(str_val),
                                _MAX_VARIABLE_VALUE_LEN,
                            )
                            continue
                        variables[key] = _redact_variable_value(key, str_val)
        except Exception:
            logger.debug("[WhatIf] step-level variable extraction failed for %r", obs_name)

    # Fallback: scan metadata for string values
    if not variables and metadata:
        for key, value in metadata.items():
            if key in _SKIP_VARIABLE_KEYS:
                continue
            if isinstance(value, str) and len(value) <= _MAX_VARIABLE_VALUE_LEN:
                variables[key] = _redact_variable_value(key, value)

    # Fallback: scan input dict for non-message string keys
    if not variables and isinstance(obs_input, dict):
        for key, value in obs_input.items():
            if key in ("messages", "model", "temperature", "max_tokens", "stream"):
                continue
            if key in _SKIP_VARIABLE_KEYS:
                continue
            if isinstance(value, str) and len(value) <= _MAX_VARIABLE_VALUE_LEN:
                variables[key] = _redact_variable_value(key, value)

    return variables


def _infer_overridable_fields(
    variables: dict[str, str],
) -> list[OverridableField]:
    """Build the list of overridable fields from the fixture's variables.

    Model parameters (model, temperature, max_tokens) are read-only —
    they are taken from the original trace and displayed but not editable.
    Only data variables and prompt content are overridable.
    """
    fields: list[OverridableField] = []

    for key, value in variables.items():
        # Heuristic: long values → textarea, numbers → number, rest → text
        if len(value) > 200:
            ft = FieldType.TEXTAREA
        else:
            try:
                float(value)
                ft = FieldType.NUMBER
            except ValueError:
                ft = FieldType.TEXT

        fields.append(
            OverridableField(
                key=key,
                label=key.replace("_", " ").title(),
                field_type=ft,
                current_value=value,
                category=FieldCategory.VARIABLE,
            )
        )

    return fields


async def extract_fixture(
    trace_id: str,
    node_id: str,
    agent_name: str | None = None,
) -> StepFixture:
    """Extract a StepFixture from a GENERATION node for what-if editing.

    Args:
        trace_id: The Langfuse trace ID.
        node_id: The observation node ID.
        agent_name: Optional agent name for per-agent credentials.

    Returns:
        StepFixture with overridable fields and fixture_hash.

    Raises:
        NodeNotFoundError: If the node doesn't exist in the trace.
        WhatIfValidationError: If the node is not a GENERATION type.
    """
    collection = cache_get(trace_id, agent_name)
    if collection is None:
        loader = get_loader(agent_name)
        from axion.tracing import TraceCollection

        raw_traces = await asyncio.to_thread(
            loader.fetch_traces,
            trace_ids=[trace_id],
            show_progress=False,
        )
        if not raw_traces:
            raise ReplayServiceError(f"Trace {trace_id!r} not found")

        # Pass prompt_patterns for variable extraction (What-If)
        prompt_patterns = get_replay_config().prompt_patterns
        collection = TraceCollection(raw_traces, prompt_patterns=prompt_patterns)
        cache_put(trace_id, collection, agent_name)

    trace = collection[0]
    tree_roots = getattr(trace, "tree_roots", None) or []
    node = find_tree_node(tree_roots, node_id)

    if node is None:
        raise NodeNotFoundError(f"Node {node_id!r} not found in trace {trace_id!r}")

    obs = getattr(node, "observation", node)
    obs_type = getattr(obs, "type", None)

    if not obs_type or obs_type.upper() not in ("GENERATION", "LLM"):
        raise WhatIfValidationError(
            f"Node {node_id!r} is type {obs_type!r}, not GENERATION/LLM. "
            "What-If is only available for GENERATION/LLM nodes."
        )

    # Extract properties
    obs_input = getattr(obs, "input", None)
    obs_output = getattr(obs, "output", None)
    model = getattr(obs, "model", None)
    raw_metadata = to_plain_dict(getattr(obs, "metadata", None))
    metadata = redact_metadata(raw_metadata)

    # Temperature and max_tokens from metadata or input
    temperature: float | None = None
    max_tokens: int | None = None

    if isinstance(obs_input, dict):
        temperature = obs_input.get("temperature")
        max_tokens = obs_input.get("max_tokens")

    if raw_metadata:
        if temperature is None and "temperature" in raw_metadata:
            temperature = raw_metadata["temperature"]
        if max_tokens is None and "max_tokens" in raw_metadata:
            max_tokens = raw_metadata["max_tokens"]

    # Prompt messages
    prompt_messages = _extract_prompt_messages(obs_input)

    # Variables — prefer axion step-level extraction, fall back to input/metadata scan
    obs_name = getattr(obs, "name", None)
    variables = _extract_variables(trace, obs_name, obs_input, metadata)

    # Usage and latency
    usage = extract_usage(getattr(obs, "usage", None))
    start_time = getattr(obs, "startTime", None) or getattr(obs, "start_time", None)
    end_time = getattr(obs, "endTime", None) or getattr(obs, "end_time", None)
    latency_ms = compute_latency_ms(start_time, end_time)

    # Fixture hash
    prompt_str = json.dumps([m.model_dump() for m in prompt_messages], sort_keys=True)
    fixture_hash = _compute_fixture_hash(node_id, model, prompt_str)

    # Overridable fields (variables only — model params are read-only from trace)
    overridable = _infer_overridable_fields(variables)

    logger.info(
        "[WhatIf] fixture extracted trace=%s node=%s agent=%s fields=%d",
        trace_id,
        node_id,
        agent_name,
        len(overridable),
    )

    return StepFixture(
        node_id=node_id,
        name=getattr(obs, "name", None),
        type=obs_type,
        model=model,
        prompt_messages=prompt_messages,
        variables=variables,
        temperature=temperature,
        max_tokens=max_tokens,
        original_output=obs_output,
        original_usage=usage,
        original_latency_ms=latency_ms,
        overridable_fields=overridable,
        fixture_hash=fixture_hash,
    )


# ---------------------------------------------------------------------------
# Variable substitution
# ---------------------------------------------------------------------------


def _apply_variable_overrides(
    messages: list[ChatMessage],
    variable_overrides: dict[str, str],
) -> list[ChatMessage]:
    """Deep-copy messages and substitute {{var}} / {var} patterns."""
    if not variable_overrides:
        return messages

    result: list[ChatMessage] = []
    for msg in messages:
        content = msg.content
        for var_name, var_value in variable_overrides.items():
            content = content.replace(f"{{{{{var_name}}}}}", var_value)
            content = content.replace(f"{{{var_name}}}", var_value)
        result.append(
            ChatMessage(
                role=msg.role,
                content=content,
                tool_call_id=msg.tool_call_id,
                name=msg.name,
            )
        )
    return result


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------


def _detect_provider_for_model(model_name: str) -> LLMProviderType:
    """Determine which provider a model belongs to using name heuristics."""
    lower = model_name.lower()
    if "claude" in lower or "anthropic" in lower:
        return LLMProviderType.ANTHROPIC
    return LLMProviderType.OPENAI


async def run_simulation(
    trace_id: str,
    node_id: str,
    agent_name: str | None,
    request: SimulateRequest,
) -> SimulateResponse:
    """Run a stateless what-if simulation with user-supplied overrides.

    Args:
        trace_id: The Langfuse trace ID.
        node_id: The observation node ID.
        agent_name: Optional agent name for per-agent credentials.
        request: Validated SimulateRequest with overrides.

    Returns:
        SimulateResponse with original vs simulated comparison.

    Raises:
        FixtureStaleError: If fixture_hash doesn't match (409).
        WhatIfValidationError: If overrides are invalid (422).
        ConcurrencyLimitError: If semaphore is exhausted (429).
        SimulationTimeoutError: If LLM call times out (504).
    """
    # Re-extract fixture for validation
    fixture = await extract_fixture(trace_id, node_id, agent_name)

    # Validate fixture hash (staleness guard)
    if request.fixture_hash != fixture.fixture_hash:
        raise FixtureStaleError(
            "Fixture is stale — the trace data has changed since you loaded it. "
            "Please re-fetch the fixture and try again."
        )

    # Model parameters are fixed from the trace — not user-overridable
    effective_model = fixture.model
    effective_temp = fixture.temperature or 0.7
    effective_max_tokens = fixture.max_tokens or 4096

    # Build effective prompt
    if request.prompt_messages_override is not None:
        effective_messages = request.prompt_messages_override
    else:
        effective_messages = copy.deepcopy(fixture.prompt_messages)

    # Apply variable overrides
    if request.variable_overrides:
        effective_messages = _apply_variable_overrides(
            effective_messages, request.variable_overrides
        )

    # Build the prompt string for LLM call
    system_prompt = ""
    user_messages: list[str] = []
    for msg in effective_messages:
        if msg.role == ChatMessageRole.SYSTEM:
            system_prompt = msg.content
        else:
            user_messages.append(msg.content)

    prompt_text = "\n\n".join(user_messages) if user_messages else ""

    # Acquire semaphore (concurrency limit) — non-blocking check
    if not _SIMULATE_SEMAPHORE.locked():
        pass  # Permits available
    elif _SIMULATE_SEMAPHORE._value == 0:
        raise ConcurrencyLimitError(
            "Too many concurrent simulations. Please try again in a moment."
        )

    async with _SIMULATE_SEMAPHORE:
        # Determine provider
        provider = _detect_provider_for_model(effective_model or settings.llm_model_name)

        from pydantic_ai import Agent

        llm_provider = LLMProvider(
            provider=provider,
            model=effective_model,
            temperature=effective_temp,
            max_tokens=effective_max_tokens,
        )
        _agent = Agent(
            llm_provider._get_model(),
            system_prompt=system_prompt or "You are a helpful AI assistant.",
        )

        # Execute with timeout
        start_ts = time.monotonic()
        try:
            _result = await asyncio.wait_for(
                _agent.run(prompt_text),
                timeout=_SIMULATE_TIMEOUT_S,
            )
            simulated_output = _result.output
        except TimeoutError:
            raise SimulationTimeoutError(f"LLM call timed out after {_SIMULATE_TIMEOUT_S}s")

        elapsed_ms = (time.monotonic() - start_ts) * 1000

    # Build simulated usage (estimate from output length)
    sim_usage = TokenUsage(
        input=sum(len(m.content.split()) for m in effective_messages),
        output=len(simulated_output.split()) if isinstance(simulated_output, str) else 0,
        total=0,
    )
    sim_usage.total = sim_usage.input + sim_usage.output

    # Compare outputs
    orig_str = (
        json.dumps(fixture.original_output, default=str)
        if fixture.original_output is not None
        else ""
    )
    sim_str = (
        simulated_output
        if isinstance(simulated_output, str)
        else json.dumps(simulated_output, default=str)
    )
    output_changed = orig_str != sim_str

    # Token delta
    orig_total = fixture.original_usage.total if fixture.original_usage else 0
    token_delta = sim_usage.total - orig_total

    logger.info(
        "[WhatIf] simulation trace=%s node=%s model=%s latency_ms=%.0f tokens=%d/%d",
        trace_id,
        node_id,
        effective_model,
        elapsed_ms,
        sim_usage.input,
        sim_usage.output,
    )

    return SimulateResponse(
        original_output=fixture.original_output,
        original_model=fixture.model,
        original_usage=fixture.original_usage,
        original_latency_ms=fixture.original_latency_ms,
        simulated_output=simulated_output,
        simulated_model=effective_model,
        simulated_usage=sim_usage,
        simulated_latency_ms=round(elapsed_ms, 1),
        output_changed=output_changed,
        token_delta=token_delta,
    )
