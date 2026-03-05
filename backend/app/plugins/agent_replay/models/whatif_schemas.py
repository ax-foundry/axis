from __future__ import annotations

import json
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.plugins.agent_replay.models.replay_schemas import TokenUsage  # noqa: TC001


class ChatMessageRole(StrEnum):
    """Allowed roles for prompt messages."""

    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


class ChatMessage(BaseModel):
    """A single chat message in a prompt sequence."""

    role: ChatMessageRole
    content: str
    tool_call_id: str | None = None
    name: str | None = None


class FieldType(StrEnum):
    TEXT = "text"
    NUMBER = "number"
    SLIDER = "slider"
    TOGGLE = "toggle"
    SELECT = "select"
    TEXTAREA = "textarea"


class FieldCategory(StrEnum):
    VARIABLE = "variable"
    PROMPT = "prompt"


class OverridableField(BaseModel):
    """Describes a single overridable field in the fixture."""

    key: str
    label: str
    field_type: FieldType
    current_value: Any = None
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: list[str] | None = None
    category: FieldCategory


class StepFixture(BaseModel):
    """Extracted fixture for a GENERATION node, ready for what-if editing."""

    node_id: str
    name: str | None = None
    type: str
    model: str | None = None
    prompt_messages: list[ChatMessage] = Field(default_factory=list)
    variables: dict[str, str] = Field(default_factory=dict)
    temperature: float | None = None
    max_tokens: int | None = None
    original_output: Any = None
    original_usage: TokenUsage | None = None
    original_latency_ms: float | None = None
    overridable_fields: list[OverridableField] = Field(default_factory=list)
    fixture_hash: str = ""


_MAX_VARIABLE_KEYS = 50
_MAX_VARIABLE_VALUE_LEN = 10_000
_MAX_PROMPT_TOTAL_CHARS = 200_000


class SimulateRequest(BaseModel):
    """Request body for a what-if simulation run.

    Agent is passed as a query parameter (not in the body) to match
    existing replay endpoint conventions.
    """

    fixture_hash: str = Field(..., description="Must match current fixture hash (staleness guard)")
    prompt_messages_override: list[ChatMessage] | None = None
    variable_overrides: dict[str, str] | None = None

    @field_validator("variable_overrides")
    @classmethod
    def validate_variable_overrides(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        """Reject if too many keys or values too large."""
        if v is None:
            return v
        if len(v) > _MAX_VARIABLE_KEYS:
            msg = f"variable_overrides has {len(v)} keys; maximum is {_MAX_VARIABLE_KEYS}"
            raise ValueError(msg)
        for key, value in v.items():
            if len(value) > _MAX_VARIABLE_VALUE_LEN:
                msg = (
                    f"variable_overrides[{key!r}] is {len(value)} chars; "
                    f"maximum is {_MAX_VARIABLE_VALUE_LEN}"
                )
                raise ValueError(msg)
        return v

    @model_validator(mode="after")
    def validate_prompt_size(self) -> SimulateRequest:
        """Reject if total serialized prompt is too large."""
        if self.prompt_messages_override is not None:
            total = len(json.dumps([m.model_dump() for m in self.prompt_messages_override]))
            if total > _MAX_PROMPT_TOTAL_CHARS:
                msg = (
                    f"prompt_messages_override total size is {total} chars; "
                    f"maximum is {_MAX_PROMPT_TOTAL_CHARS}"
                )
                raise ValueError(msg)
        return self


class SimulateResponse(BaseModel):
    """Response from a what-if simulation run."""

    # Original (frozen from fixture)
    original_output: Any = None
    original_model: str | None = None
    original_usage: TokenUsage | None = None
    original_latency_ms: float | None = None

    # Simulated
    simulated_output: Any = None
    simulated_model: str | None = None
    simulated_usage: TokenUsage | None = None
    simulated_latency_ms: float | None = None

    # Delta
    output_changed: bool = False
    token_delta: int = 0
