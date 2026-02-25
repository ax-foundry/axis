import hashlib
import logging
import math
import uuid
from collections import defaultdict
from enum import StrEnum
from typing import Any, Literal

from axion.llm_registry import LLMRegistry
from axion.reporting import InsightExtractor, InsightResult
from axion.reporting.issue_extractor import ExtractedIssue as AxionExtractedIssue
from axion.reporting.issue_extractor import IssueExtractionResult as AxionIssueExtractionResult
from pydantic import BaseModel, Field

from app.config import settings

__all__ = [
    "AVAILABLE_CONTEXT_FIELDS",
    "ExtractionConfig",
    "InsightResult",
    "IssueExtractorService",
    "ReportMode",
]

logger = logging.getLogger("axis.issue_extractor")


class ReportMode(StrEnum):
    """Mode for selecting which issues to extract."""

    LOW = "low"  # Low-scoring metrics (below threshold)
    HIGH = "high"  # High-scoring metrics (above threshold)
    OVERALL = "overall"  # All metrics regardless of score


class ReportType(StrEnum):
    """Type of report to generate."""

    SUMMARY = "summary"  # Brief overview
    DETAILED = "detailed"  # Comprehensive analysis
    GROUPED = "grouped"  # Issues grouped by pattern/category
    RECOMMENDATIONS = "recommendations"  # Actionable improvement suggestions


# Available context fields that can be included
AVAILABLE_CONTEXT_FIELDS = [
    "query",
    "actual_output",
    "expected_output",
    "retrieved_content",
    "conversation",
    "signals",
    "critique",
]


class ExtractionConfig(BaseModel):
    """Configuration for issue extraction."""

    score_threshold: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Score threshold for filtering"
    )
    include_nan: bool = Field(default=False, description="Include records with NaN/null scores")
    metric_filters: list[str] = Field(
        default_factory=list, description="Only extract from these metrics (empty = all)"
    )
    max_issues: int = Field(default=100, ge=1, le=500, description="Maximum issues to extract")
    sample_rate: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Sample rate (1.0 = all, 0.1 = 10%)"
    )
    include_context_fields: list[str] = Field(
        default_factory=lambda: ["query", "actual_output", "expected_output", "signals"],
        description="Context fields to include from test cases",
    )


class ExtractedIssue(BaseModel):
    """Represents an extracted issue from evaluation data."""

    id: str
    metric_name: str
    score: float | None = None
    query: str = ""
    actual_output: str = ""
    expected_output: str | None = None
    retrieved_content: str | None = None
    conversation: str | None = None
    signals: list[str] | None = None
    critique: str | None = None


class IssueExtractionResult(BaseModel):
    """Result of issue extraction."""

    issues: list[ExtractedIssue] = Field(default_factory=list)
    total_records_analyzed: int = 0
    issues_found: int = 0
    metrics_covered: list[str] = Field(default_factory=list)
    mode: str = "overall"
    threshold: float = 0.5
    config: ExtractionConfig = Field(default_factory=ExtractionConfig)


class IssueExtractorService:
    """Bridge AXIS data to issue extraction and LLM summarization."""

    def __init__(
        self,
        mode: Literal["low", "high", "overall"] = "overall",
        config: ExtractionConfig | None = None,
    ):
        """Initialize the issue extractor service.

        Args:
            mode: Which issues to extract - 'low' (below threshold),
                  'high' (above threshold), or 'overall' (all)
            config: Extraction configuration
        """
        self.mode = mode
        self.config = config or ExtractionConfig()

    def _should_include_score(self, score: float | None) -> bool:
        """Check if a score should be included based on mode and threshold."""
        # Handle NaN/None scores
        if score is None or (isinstance(score, float) and math.isnan(score)):
            return self.config.include_nan

        if self.mode == "low":
            return score <= self.config.score_threshold
        elif self.mode == "high":
            return score > self.config.score_threshold
        else:  # overall
            return True

    def _should_sample_record(self, record_id: str) -> bool:
        """Deterministically decide if a record should be sampled based on its ID."""
        if self.config.sample_rate >= 1.0:
            return True
        if self.config.sample_rate <= 0.0:
            return False

        # Deterministic sampling based on hash of record ID
        hash_value = int(hashlib.md5(str(record_id).encode()).hexdigest(), 16)
        return (hash_value % 1000) < (self.config.sample_rate * 1000)

    def _should_include_metric(self, metric_name: str) -> bool:
        """Check if a metric should be included based on filters."""
        if not self.config.metric_filters:
            return True
        return metric_name in self.config.metric_filters

    def extract_issues(
        self,
        data: list[dict[str, Any]],
        metric_filter: str | None = None,
    ) -> IssueExtractionResult:
        """Extract issues from AXIS scorecard data.

        Args:
            data: List of evaluation records in AXIS format
            metric_filter: Optional single metric name to filter by (overrides config.metric_filters)

        Returns:
            IssueExtractionResult with extracted issues
        """
        logger.info(
            f"Extracting issues: mode={self.mode}, threshold={self.config.score_threshold}, "
            f"metric_filter={metric_filter}, metric_filters={self.config.metric_filters}, "
            f"sample_rate={self.config.sample_rate}, max_issues={self.config.max_issues}, "
            f"include_nan={self.config.include_nan}, records={len(data)}"
        )

        issues: list[ExtractedIssue] = []
        metrics_seen: set[str] = set()
        records_analyzed = 0

        for record in data:
            record_id = str(record.get("dataset_id") or record.get("id", ""))
            metric_name = record.get("metric_name", "")
            score = record.get("metric_score")

            # Apply sampling
            if not self._should_sample_record(record_id):
                continue

            records_analyzed += 1

            # Apply metric filter (single override or config list)
            if metric_filter:
                if metric_name != metric_filter:
                    continue
            elif not self._should_include_metric(metric_name):
                continue

            # Validate score type
            valid_score = None
            if score is not None:
                try:
                    valid_score = float(score)
                except (TypeError, ValueError):
                    valid_score = None

            # Check if should include based on mode/threshold
            if not self._should_include_score(valid_score):
                continue

            metrics_seen.add(metric_name)

            # Build issue with configured context fields
            issue_data: dict[str, Any] = {
                "id": record_id,
                "metric_name": metric_name,
                "score": valid_score,
            }

            # Add context fields based on configuration
            field_mapping = {
                "query": "query",
                "actual_output": "actual_output",
                "expected_output": "expected_output",
                "retrieved_content": "retrieved_content",
                "conversation": "conversation",
                "signals": "signals",
                "critique": "critique",
            }

            for field in self.config.include_context_fields:
                if field in field_mapping:
                    value = record.get(field_mapping[field])
                    if value is not None:
                        if field == "signals" and isinstance(value, str):
                            # Try to parse signals if it's a string
                            try:
                                import json

                                value = json.loads(value)
                            except (json.JSONDecodeError, TypeError):
                                value = [value] if value else None
                        issue_data[field] = value

            issues.append(ExtractedIssue(**issue_data))

            if len(issues) >= self.config.max_issues:
                break

        # Sort by score (ascending for low mode, descending for high mode)
        # Put None scores at the end
        def sort_key(x: ExtractedIssue) -> tuple[int, float]:
            if x.score is None:
                return (1, 0.0)  # Put None at end
            return (0, x.score)

        if self.mode == "low":
            issues.sort(key=sort_key)
        else:
            issues.sort(key=lambda x: sort_key(x), reverse=True)

        result = IssueExtractionResult(
            issues=issues[: self.config.max_issues],
            total_records_analyzed=records_analyzed,
            issues_found=len(issues),
            metrics_covered=sorted(metrics_seen),
            mode=self.mode,
            threshold=self.config.score_threshold,
            config=self.config,
        )

        logger.info(
            f"Extracted {result.issues_found} issues from {result.total_records_analyzed} records"
        )

        return result

    def to_grouped_prompt_text(
        self,
        issues: IssueExtractionResult,
        max_groups: int = 20,
    ) -> str:
        """Convert extracted issues to grouped text for LLM prompt.

        Args:
            issues: Extraction result
            max_groups: Maximum groups to include

        Returns:
            Formatted string for LLM analysis
        """
        if not issues.issues:
            return "No issues found matching the criteria."

        # Group by metric name
        groups: dict[str, list[ExtractedIssue]] = {}
        for issue in issues.issues:
            if issue.metric_name not in groups:
                groups[issue.metric_name] = []
            groups[issue.metric_name].append(issue)

        # Build prompt text
        lines = [
            "## Issue Analysis Report",
            f"Mode: {issues.mode.upper()} scoring (threshold: {issues.threshold})",
            f"Total records analyzed: {issues.total_records_analyzed}",
            f"Issues found: {issues.issues_found}",
            f"Metrics covered: {', '.join(issues.metrics_covered)}",
            f"Sample rate: {issues.config.sample_rate * 100:.0f}%",
            f"Context fields: {', '.join(issues.config.include_context_fields)}",
            "",
            "---",
            "",
        ]

        for idx, (metric_name, metric_issues) in enumerate(groups.items()):
            if idx >= max_groups:
                lines.append(f"\n... and {len(groups) - max_groups} more metric groups")
                break

            # Calculate average score, handling None values
            valid_scores = [i.score for i in metric_issues if i.score is not None]
            avg_score = sum(valid_scores) / len(valid_scores) if valid_scores else 0.0
            nan_count = len(metric_issues) - len(valid_scores)

            lines.append(f"### {metric_name}")
            score_info = f"Average score: {avg_score:.3f} | Count: {len(metric_issues)}"
            if nan_count > 0:
                score_info += f" ({nan_count} with NaN scores)"
            lines.append(score_info)
            lines.append("")

            # Show top 3 examples per group
            for i, issue in enumerate(metric_issues[:3]):
                score_str = f"{issue.score:.3f}" if issue.score is not None else "NaN"
                lines.append(f"**Example {i + 1}** (ID: {issue.id}, Score: {score_str})")

                # Add context fields that are present
                if issue.query:
                    query_text = (
                        issue.query[:200] + "..." if len(issue.query) > 200 else issue.query
                    )
                    lines.append(f"- Query: {query_text}")

                if issue.actual_output:
                    output_text = (
                        issue.actual_output[:200] + "..."
                        if len(issue.actual_output) > 200
                        else issue.actual_output
                    )
                    lines.append(f"- Output: {output_text}")

                if issue.expected_output:
                    expected_text = (
                        issue.expected_output[:150] + "..."
                        if len(issue.expected_output) > 150
                        else issue.expected_output
                    )
                    lines.append(f"- Expected: {expected_text}")

                if issue.retrieved_content:
                    retrieved_text = (
                        issue.retrieved_content[:150] + "..."
                        if len(issue.retrieved_content) > 150
                        else issue.retrieved_content
                    )
                    lines.append(f"- Retrieved Content: {retrieved_text}")

                if issue.signals:
                    signals_text = ", ".join(issue.signals[:5])
                    if len(issue.signals) > 5:
                        signals_text += f" (+{len(issue.signals) - 5} more)"
                    lines.append(f"- Signals: {signals_text}")

                if issue.critique:
                    critique_text = (
                        issue.critique[:150] + "..."
                        if len(issue.critique) > 150
                        else issue.critique
                    )
                    lines.append(f"- Critique: {critique_text}")

                lines.append("")

            lines.append("")

        return "\n".join(lines)

    async def generate_report(
        self,
        issues: IssueExtractionResult,
        report_type: ReportType = ReportType.SUMMARY,
        model: str = "gpt-4o-mini",
        provider: str = "openai",
    ) -> str:
        """Generate an LLM-powered report from extracted issues.

        Args:
            issues: Extraction result
            report_type: Type of report to generate
            model: LLM model to use
            provider: LLM provider (openai or anthropic)

        Returns:
            Generated report text
        """
        if not issues.issues:
            return "No issues found matching the criteria. Unable to generate report."

        # Build context
        context = self.to_grouped_prompt_text(issues)

        # Mode-aware preamble
        mode_context = {
            "low": (
                "You are analyzing LOW-scoring records that fell below the quality threshold. "
                "Focus on diagnosing failures, identifying root causes, and understanding "
                "what went wrong."
            ),
            "high": (
                "You are analyzing HIGH-scoring records that exceeded the quality threshold. "
                "Focus on what worked well, successful patterns worth replicating, and "
                "strengths to preserve."
            ),
            "overall": (
                "You are analyzing ALL records across the full score range. "
                "Compare successes against failures, identify what separates high performers "
                "from low performers, and assess overall system health."
            ),
        }.get(self.mode, "You are analyzing evaluation records.")

        # Available data fields for LLM reference
        fields_section = (
            "## Available Data Fields\n"
            "Each issue record may include: ID, metric_name, score, "
            + ", ".join(issues.config.include_context_fields)
            + ".\nCite specific example IDs when referencing evidence."
        )

        # Build system prompt based on report type
        system_prompts = {
            ReportType.SUMMARY: f"""You are a senior AI evaluation analyst producing an executive summary.

{mode_context}

{fields_section}

## Output Format (follow exactly)

### Overall Health
One sentence characterizing the system's current state.

### Key Findings
- (bullet 1: most critical finding with example ID)
- (bullet 2: second finding with metric names)
- (bullet 3: third finding or notable pattern)

### Action Items
- (1-sentence actionable next step)
- (1-sentence actionable next step)
- (optional third action item)

## Constraints
- 200-350 words total
- Use headers, bullets, and numbered lists — no tables or matrices
- Ground every claim in data: cite example IDs, scores, or metric names
- Be direct and specific — avoid vague qualifiers like "some issues"
- Match language to analysis mode: {"failures/weaknesses" if self.mode == "low" else "successes/strengths" if self.mode == "high" else "performance across the spectrum"}""",
            ReportType.DETAILED: f"""You are a senior AI evaluation analyst producing a comprehensive per-metric analysis.

{mode_context}

{fields_section}

## Output Format (follow exactly)

### Executive Summary
2-3 sentences summarizing the overall picture.

### Per-Metric Analysis
For each metric that appears in the data, write a subsection:

#### [Metric Name]
- **Score range**: min - max (avg)
- **Key patterns**: 2-3 sentences describing what you observe
- **Notable signals**: specific signals, critiques, or output characteristics
- **Severity**: Critical / High / Medium / Low

### Cross-Metric Patterns
2-3 bullets identifying patterns that span multiple metrics (e.g., "queries about X consistently score low on both Faithfulness and Relevance").

## Constraints
- 500-900 words total
- Use headers, bullets, and numbered lists — no tables or matrices
- Cite specific example IDs and scores as evidence
- Each metric subsection should reference at least one concrete example
- Match language to analysis mode: {"failures/weaknesses" if self.mode == "low" else "successes/strengths" if self.mode == "high" else "performance across the spectrum"}""",
            ReportType.GROUPED: f"""You are a senior AI evaluation analyst discovering and categorizing recurring patterns.

{mode_context}

{fields_section}

## Output Format (follow exactly)

### Pattern Overview
1-2 sentences describing how many distinct patterns you found and the overall theme.

### Discovered Patterns
For each pattern (3-6 patterns):

#### Pattern N: [Descriptive Name]
- **Affected metrics**: list of metrics
- **Frequency**: how many issues exhibit this pattern (approximate count or percentage)
- **Evidence**: cite 1-2 example IDs with scores and brief description
- **Impact**: High / Medium / Low with 1-sentence justification

### Pattern Hierarchy
Rank the patterns from most to least impactful in a numbered list with one-line summaries.

## Constraints
- 400-700 words total
- Use headers, bullets, and numbered lists — no tables or matrices
- Patterns must be distinct — do not restate the same issue with different wording
- Cite specific example IDs as evidence for each pattern
- Match language to analysis mode: {"failure patterns" if self.mode == "low" else "success patterns" if self.mode == "high" else "performance patterns"}""",
            ReportType.RECOMMENDATIONS: f"""You are a senior AI evaluation analyst producing prioritized, actionable recommendations.

{mode_context}

{fields_section}

## Output Format (follow exactly)

### Situation Assessment
2-3 sentences summarizing the current state and why action is needed.

### Recommendations
For each recommendation (4-6 items), use this structure:

#### N. [Short Recommendation Title]
- **Priority**: Critical / High / Medium / Low
- **Addresses**: which metrics or patterns this fixes
- **Evidence**: cite example IDs showing the problem
- **Implementation**: 2-3 concrete steps to implement this change
- **Expected outcome**: 1 sentence on the anticipated improvement

### Quick Wins
2-3 low-effort improvements that can be made immediately, each in one sentence.

### Monitoring Plan
2-3 bullets describing what to track after implementing changes to verify improvement.

## Constraints
- 500-800 words total
- Use headers, bullets, and numbered lists — no tables or matrices
- Every recommendation must be grounded in observed data — no generic advice
- Order recommendations by priority (highest first)
- Implementation steps must be specific and actionable, not vague
- Match language to analysis mode: {"fixing failures" if self.mode == "low" else "reinforcing successes" if self.mode == "high" else "improving overall performance"}""",
        }

        system_prompt = system_prompts.get(report_type, system_prompts[ReportType.SUMMARY])

        # Structured user prompt with metadata separated from data
        metrics_list = ", ".join(issues.metrics_covered) if issues.metrics_covered else "N/A"
        context_fields_list = ", ".join(issues.config.include_context_fields)

        user_prompt = f"""## Evaluation Metadata
- Mode: {issues.mode.upper()} (threshold: {issues.threshold})
- Records analyzed: {issues.total_records_analyzed}
- Issues in scope: {issues.issues_found}
- Metrics covered: {metrics_list}
- Sample rate: {issues.config.sample_rate * 100:.0f}%
- Context fields: {context_fields_list}

## Issue Data
{context}

Generate the {report_type.value} report now. Follow the output format exactly."""

        logger.info(f"Generating {report_type.value} report with {model} ({provider})")

        try:
            registry = LLMRegistry(provider=provider)
            llm = registry.get_llm(model)

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]

            response = await llm.achat(messages)

            # Extract content from response
            if hasattr(response, "content"):
                content = response.content
            elif hasattr(response, "choices") and response.choices:
                content = response.choices[0].message.content
            elif hasattr(response, "text"):
                content = response.text
            else:
                content = str(response)

            logger.info(f"Report generated: {len(content)} chars")
            return str(content)

        except Exception as e:
            logger.error(f"Report generation failed: {e}", exc_info=True)
            raise

    def to_axion_extraction_result(
        self, result: IssueExtractionResult
    ) -> AxionIssueExtractionResult:
        """Map Axis IssueExtractionResult to axion's dataclass format.

        Args:
            result: Axis extraction result (Pydantic model)

        Returns:
            Axion IssueExtractionResult dataclass for InsightExtractor
        """
        axion_issues: list[AxionExtractedIssue] = []
        issues_by_metric: dict[str, list[AxionExtractedIssue]] = defaultdict(list)
        issues_by_type: dict[str, list[AxionExtractedIssue]] = defaultdict(list)

        for issue in result.issues:
            # Build item_context from available fields, excluding None values
            item_context: dict[str, Any] = {}
            if issue.query:
                item_context["query"] = issue.query
            if issue.actual_output:
                item_context["actual_output"] = issue.actual_output
            if issue.expected_output:
                item_context["expected_output"] = issue.expected_output
            if issue.retrieved_content:
                item_context["retrieved_content"] = issue.retrieved_content
            if issue.conversation:
                item_context["conversation"] = issue.conversation

            axion_issue = AxionExtractedIssue(
                test_case_id=issue.id,
                metric_name=issue.metric_name,
                signal_group=issue.metric_name,
                signal_name="score",
                value=issue.score,
                score=issue.score or 0.0,
                description=issue.critique or "",
                reasoning=issue.critique or "",
                item_context=item_context,
                source_path="",
                raw_signal={},
            )
            axion_issues.append(axion_issue)
            issues_by_metric[issue.metric_name].append(axion_issue)
            issues_by_type[issue.metric_name].append(axion_issue)

        distinct_ids = {issue.id for issue in result.issues}

        return AxionIssueExtractionResult(
            run_id=str(uuid.uuid4()),
            evaluation_name=None,
            total_test_cases=len(distinct_ids),
            total_signals_analyzed=result.total_records_analyzed,
            issues_found=result.issues_found,
            issues_by_metric=dict(issues_by_metric),
            issues_by_type=dict(issues_by_type),
            all_issues=axion_issues,
        )


async def generate_insights(
    extraction_result: IssueExtractionResult,
    model: str = "gpt-4o-mini",
    provider: str = "openai",
) -> InsightResult:
    """Generate structured insights from extracted issues via axion InsightExtractor.

    Args:
        extraction_result: Axis extraction result
        model: LLM model name
        provider: LLM provider

    Returns:
        InsightResult with patterns and learnings
    """
    service = IssueExtractorService()
    axion_result = service.to_axion_extraction_result(extraction_result)

    extractor = InsightExtractor(model_name=model, llm_provider=provider)
    return await extractor.analyze(axion_result)


def get_configured_llm_info() -> dict[str, Any]:
    """Get information about configured LLM providers."""
    providers = {}

    for provider in ["openai", "anthropic"]:
        try:
            registry = LLMRegistry(provider=provider)
            registry.get_llm()
            providers[provider] = True
        except Exception:
            providers[provider] = False

    return {
        "configured": any(providers.values()),
        "providers": providers,
        "default_model": settings.llm_model_name or "gpt-4o-mini",
        "available_context_fields": AVAILABLE_CONTEXT_FIELDS,
    }
