from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING

from app.copilot.guardrails import RequestBlocked, sanitize_input

if TYPE_CHECKING:
    from app.copilot.skills.loader import SkillMeta


class RequestClass(StrEnum):
    """Broad categories for incoming copilot requests."""

    DATA_QUESTION = "data_question"
    NEEDS_CLARIFICATION = "needs_clarification"
    CHIT_CHAT = "chit_chat"
    PROMPT_INJECTION = "prompt_injection"
    HARMFUL = "harmful"
    OUT_OF_SCOPE = "out_of_scope"


@dataclass
class PreparedRequest:
    """Fully prepared request ready for agent execution."""

    message: str  # sanitized input
    selected_skill_names: list[str]  # names of matched skills
    skills_injection: str  # rendered skill bodies
    sql_examples_injection: str  # matched Q→SQL examples
    context_snippets: list[str]  # last N history contents
    conversation_history: list[dict] | None  # raw history (untouched)
    classification: RequestClass = RequestClass.DATA_QUESTION
    classification_confidence: float = 1.0


def build_context_snippets(history: list[dict] | None, limit: int = 3) -> list[str]:
    """Extract the last *limit* message contents from conversation history."""
    return [
        m["content"] for m in (history or [])[-limit:] if isinstance(m, dict) and "content" in m
    ]


def select_skills_for_request(
    message: str, context_snippets: list[str]
) -> tuple[list[SkillMeta], str]:
    """Select matching skills and render their injection string.

    Returns ``(selected_skills, injection_string)``.
    """
    from app.copilot.skills import get_skill_registry

    registry = get_skill_registry()
    selected = registry.select_skills(message, conversation_context=context_snippets)
    injection = registry.get_system_prompt_injection(selected)
    return selected, injection


def select_sql_examples_for_request(message: str, agent_name: str | None) -> str:
    """Select matching SQL examples and render their injection string."""
    from app.copilot.sql_examples import get_sql_example_store

    store = get_sql_example_store()
    examples = store.select_for_agent(message, agent_name)
    return store.get_injection(examples)


def classify_request(
    message: str,
    context_snippets: list[str] | None = None,
) -> tuple[RequestClass, float]:
    """Classify a user request.

    Stub implementation — always returns ``DATA_QUESTION`` with confidence 1.0.
    Future phases will wire an LLM-based classifier.
    """
    return RequestClass.DATA_QUESTION, 1.0


def prepare_request(
    message: str,
    conversation_history: list[dict] | None,
    agent_name: str | None,
) -> PreparedRequest:
    """Sanitize input, select skills/examples, and return a PreparedRequest.

    Raises ``RequestBlocked`` if input fails guardrail checks.
    Pure data — no ThoughtStream, no side effects.
    """
    guard = sanitize_input(message)
    if guard.blocked_response:
        raise RequestBlocked(guard.blocked_response)
    message = guard.message

    snippets = build_context_snippets(conversation_history)
    selected_skills, skills_injection = select_skills_for_request(message, snippets)
    sql_examples_injection = select_sql_examples_for_request(message, agent_name)
    classification, confidence = classify_request(message, snippets)

    return PreparedRequest(
        message=message,
        selected_skill_names=[s.name for s in selected_skills],
        skills_injection=skills_injection,
        sql_examples_injection=sql_examples_injection,
        context_snippets=snippets,
        conversation_history=conversation_history,
        classification=classification,
        classification_confidence=confidence,
    )
