from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any


class RequestComplexity(StrEnum):
    """Complexity level of a user request."""

    SIMPLE = "simple"  # Direct answer, no planning needed
    MODERATE = "moderate"  # Some planning, single skill
    COMPLEX = "complex"  # Multi-step plan, multiple skills


@dataclass
class PlanStep:
    """A single step in an execution plan."""

    step_number: int
    description: str
    skill_name: str | None = None  # Skill to use, if any
    skill_params: dict[str, Any] = field(default_factory=dict)
    depends_on: list[int] = field(default_factory=list)  # Step numbers this depends on
    status: str = "pending"  # pending, in_progress, completed, failed
    result: Any = None
    error: str | None = None


@dataclass
class ExecutionPlan:
    """An execution plan created by the Planner node."""

    steps: list[PlanStep] = field(default_factory=list)
    goal: str = ""
    created_at: datetime = field(default_factory=datetime.utcnow)
    current_step: int = 0
    max_retries: int = 3
    retry_count: int = 0

    def get_next_step(self) -> PlanStep | None:
        """Get the next pending step to execute."""
        for step in self.steps:
            if step.status == "pending":
                # Check if dependencies are met
                deps_met = all(
                    self.steps[dep - 1].status == "completed"
                    for dep in step.depends_on
                    if dep <= len(self.steps)
                )
                if deps_met:
                    return step
        return None

    def mark_step_complete(self, step_number: int, result: Any) -> None:
        """Mark a step as completed with its result."""
        for step in self.steps:
            if step.step_number == step_number:
                step.status = "completed"
                step.result = result
                break

    def mark_step_failed(self, step_number: int, error: str) -> None:
        """Mark a step as failed with an error message."""
        for step in self.steps:
            if step.step_number == step_number:
                step.status = "failed"
                step.error = error
                break

    @property
    def is_complete(self) -> bool:
        """Check if all steps are completed."""
        return all(step.status == "completed" for step in self.steps)

    @property
    def has_failed(self) -> bool:
        """Check if any step has failed."""
        return any(step.status == "failed" for step in self.steps)

    @property
    def completed_results(self) -> list[Any]:
        """Get results from all completed steps."""
        return [step.result for step in self.steps if step.status == "completed" and step.result]


@dataclass
class CopilotState:
    """State that flows through the copilot graph pipeline.

    Contains all the context needed for processing a user request.
    """

    # Input
    message: str  # User's message/query
    data_context: dict[str, Any] = field(default_factory=dict)  # Data context from frontend
    data: list[dict[str, Any]] | None = None  # Actual data rows if provided

    # Analysis results
    intent: str = ""  # Extracted intent from the message
    complexity: RequestComplexity = RequestComplexity.SIMPLE
    requires_data: bool = False  # Whether the request needs data to process
    available_skills: list[str] = field(default_factory=list)  # Skills that match the request

    # Planning
    plan: ExecutionPlan | None = None
    needs_replanning: bool = False

    # Execution
    intermediate_results: list[Any] = field(default_factory=list)
    skill_outputs: dict[str, Any] = field(default_factory=dict)

    # Reflection
    quality_score: float = 0.0  # 0-1 quality assessment
    quality_feedback: str = ""
    iteration: int = 0
    max_iterations: int = 3

    # Final output
    final_response: str = ""
    response_metadata: dict[str, Any] = field(default_factory=dict)

    # Error handling
    error: str | None = None
    error_recoverable: bool = True

    def reset_for_replanning(self) -> None:
        """Reset state for a new planning iteration."""
        self.plan = None
        self.intermediate_results = []
        self.skill_outputs = {}
        self.quality_score = 0.0
        self.quality_feedback = ""
        self.needs_replanning = False
        self.iteration += 1
