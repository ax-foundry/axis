import logging
import math
import os
from collections.abc import Callable
from typing import Any

from axion.caliber.evaluation import (
    CaliberMetric,
    cohen_kappa_score,
    confusion_matrix_binary,
    f1_score,
    precision_score,
    recall_score,
)
from axion.dataset import DatasetItem
from axion.llm_registry import LLMRegistry
from axion.runners import MetricRunner

from app.models.align_schemas import (
    AlignmentMetrics,
    AlignmentResult,
    JudgeConfig,
)

# Configure logging
LOG_LEVEL = os.environ.get("AXIS_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("axis.axion_adapter")


def _safe_int(value: Any, default: int = 0) -> int:
    """Safely convert a value to int, handling nan/None/invalid values."""
    if value is None:
        return default
    try:
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Safely convert a value to float, handling nan/None/invalid values."""
    if value is None:
        return default
    try:
        fval = float(value)
        if math.isnan(fval) or math.isinf(fval):
            return default
        return fval
    except (TypeError, ValueError):
        return default


def _to_binary_score(score: Any, threshold: float = 0.5) -> int:
    """Convert a float metric score to binary 0/1.

    Handles nan/None/invalid values. For CaliberMetric, the LLM is prompted to
    return 0 or 1, but in edge cases it may return intermediate floats.
    Scores >= threshold map to 1, below to 0.
    """
    if score is None:
        return 0
    try:
        fval = float(score)
        if math.isnan(fval) or math.isinf(fval):
            return 0
        return 1 if fval >= threshold else 0
    except (TypeError, ValueError):
        return 0


class AxionAdapter:
    """Adapter class for converting between AXIS and Axion data formats."""

    @staticmethod
    def build_examples(config: JudgeConfig) -> list[dict[str, Any]] | None:
        """Map AXIS FewShotExample list to CaliberMetric's expected dict format.

        Args:
            config: AXIS judge configuration containing few_shot_examples

        Returns:
            List of example dicts for CaliberMetric, or None if no examples
        """
        if not config.few_shot_examples:
            return None
        return [
            {
                "input": {
                    "query": ex.query,
                    "actual_output": ex.actual_output,
                    **({"expected_output": ex.expected_output} if ex.expected_output else {}),
                },
                "output": {
                    "score": ex.score,
                    "explanation": ex.reasoning,
                },
            }
            for ex in config.few_shot_examples
        ]

    @staticmethod
    def create_caliber_metric(config: JudgeConfig) -> CaliberMetric:
        """Create a fully-configured CaliberMetric with examples and temperature.

        Args:
            config: AXIS judge configuration

        Returns:
            CaliberMetric ready for MetricRunner execution
        """
        logger.info(
            f"Creating CaliberMetric: model={config.model}, "
            f"provider={config.provider.value}, temperature={config.temperature}"
        )

        # Build instruction from system prompt + evaluation criteria
        instruction = config.system_prompt.replace(
            "{evaluation_criteria}", config.evaluation_criteria
        )

        # Build few-shot examples
        examples = AxionAdapter.build_examples(config)
        logger.info(f"Few-shot examples: {len(examples) if examples else 0}")

        # Get LLM with temperature from registry
        registry = LLMRegistry(provider=config.provider.value)
        llm = registry.get_llm(config.model, temperature=config.temperature)

        return CaliberMetric(
            instruction=instruction,
            llm=llm,
            examples=examples,
        )

    @staticmethod
    def build_dataset_items(
        records: list[dict[str, Any]],
        annotations: dict[str, int],
    ) -> list[tuple[DatasetItem, int]]:
        """Convert AXIS records + annotations into DatasetItem list paired with human scores.

        Args:
            records: Raw records from the dataset
            annotations: Dict mapping record_id to human annotation (0 or 1)

        Returns:
            List of (DatasetItem, human_score) tuples for annotated records
        """
        logger.info(f"Building dataset items: {len(records)} records, {len(annotations)} annotated")

        items = []
        for r in records:
            record_id = r.get("dataset_id") or r.get("id")
            if record_id not in annotations:
                continue
            item = DatasetItem(
                id=record_id,
                query=r.get("query", ""),
                actual_output=r.get("actual_output", ""),
                expected_output=r.get("expected_output"),
            )
            items.append((item, annotations[record_id]))

        logger.info(f"Built {len(items)} dataset items for evaluation")
        return items


async def run_axion_evaluation(
    records: list[dict[str, Any]],
    human_annotations: dict[str, int],
    config: JudgeConfig,
    on_progress: Callable[[int, int], None] | None = None,
) -> tuple[list[AlignmentResult], AlignmentMetrics]:
    """Main evaluation function using Axion CaliberMetric + MetricRunner.

    Instantiates CaliberMetric directly with few-shot examples and temperature,
    bypassing EvaluationRunner to ensure the full BaseMetric pipeline is used.

    Args:
        records: Dataset records to evaluate
        human_annotations: Dict mapping record_id to human score (0 or 1)
        config: Judge configuration from AXIS
        on_progress: Optional callback (accepted for API compat, not used by MetricRunner)

    Returns:
        Tuple of (AlignmentResult list, AlignmentMetrics)

    Raises:
        ValueError: If no annotated records to evaluate
    """
    logger.info("=" * 60)
    logger.info("Starting Axion CaliberHQ evaluation")
    logger.info(f"Model: {config.model}, Provider: {config.provider.value}")
    logger.info(f"Temperature: {config.temperature}")
    logger.info(f"Records: {len(records)}, Annotations: {len(human_annotations)}")
    logger.info(f"Few-shot examples: {len(config.few_shot_examples)}")
    logger.info("=" * 60)

    # 1. Build CaliberMetric with examples + temperature
    metric = AxionAdapter.create_caliber_metric(config)

    # 2. Build DatasetItems paired with human scores
    item_pairs = AxionAdapter.build_dataset_items(records, human_annotations)
    if not item_pairs:
        logger.error("No annotated records to evaluate")
        raise ValueError("No annotated records to evaluate")

    dataset_items = [item for item, _ in item_pairs]
    human_score_map = {item.id: score for item, score in item_pairs}

    # 3. Run via MetricRunner
    logger.info(f"Executing MetricRunner with {len(dataset_items)} items")
    try:
        runner = MetricRunner(metrics=[metric], max_concurrent=5)
        test_results = await runner.execute_batch(dataset_items, show_progress=False)
        logger.info("Evaluation completed successfully")
    except Exception as e:
        logger.error(f"Evaluation failed: {e}", exc_info=True)
        raise

    # 4. Build record lookup for original data
    record_map = {(r.get("dataset_id") or r.get("id", "")): r for r in records}

    # 5. Map results to AXIS format
    results = []
    human_scores_list = []
    llm_scores_list = []

    for test_result in test_results:
        record_id = test_result.test_case.id
        orig = record_map.get(record_id, {})
        human_score = human_score_map.get(record_id, 0)

        # Extract LLM score — threshold-based binary conversion
        if test_result.score_results:
            sr = test_result.score_results[0]
            llm_score = _to_binary_score(sr.score)
            reasoning = sr.explanation or ""
        else:
            llm_score = 0
            reasoning = ""

        logger.debug(
            f"Record {record_id}: human={human_score}, llm={llm_score}, "
            f"aligned={human_score == llm_score}"
        )

        human_scores_list.append(human_score)
        llm_scores_list.append(llm_score)

        results.append(
            AlignmentResult(
                record_id=record_id,
                query=orig.get("query", ""),
                actual_output=orig.get("actual_output", ""),
                expected_output=orig.get("expected_output"),
                human_score=human_score,
                llm_score=llm_score,
                llm_reasoning=reasoning,
                is_aligned=(human_score == llm_score),
            )
        )

    # 6. Compute metrics using the same caliber functions EvaluationRunner uses
    n = len(results)
    tn, fp, fn, tp = confusion_matrix_binary(human_scores_list, llm_scores_list)

    metrics = AlignmentMetrics(
        cohens_kappa=_safe_float(cohen_kappa_score(human_scores_list, llm_scores_list)),
        f1_score=_safe_float(f1_score(human_scores_list, llm_scores_list)),
        precision=_safe_float(precision_score(human_scores_list, llm_scores_list)),
        recall=_safe_float(recall_score(human_scores_list, llm_scores_list)),
        specificity=_safe_float(tn / (tn + fp) if (tn + fp) > 0 else 0.0),
        accuracy=_safe_float((tp + tn) / n if n > 0 else 0.0),
        confusion_matrix=[
            [_safe_int(tn), _safe_int(fp)],
            [_safe_int(fn), _safe_int(tp)],
        ],
        total_samples=n,
        agreement_count=sum(1 for r in results if r.is_aligned),
    )

    aligned_count = metrics.agreement_count
    logger.info(f"Mapped {n} results: {aligned_count} aligned, {n - aligned_count} misaligned")
    logger.info(
        f"Metrics: kappa={metrics.cohens_kappa:.3f}, "
        f"f1={metrics.f1_score:.3f}, accuracy={metrics.accuracy:.3f}"
    )

    return results, metrics


async def run_analysis_completion(
    messages: list[dict[str, str]],
    model: str = "gpt-4o",
    provider: str = "openai",
) -> str:
    """Use Axion's LLMRegistry for analysis LLM calls.

    Args:
        messages: Chat messages in OpenAI format
        model: Model name to use
        provider: Provider name (openai, anthropic)

    Returns:
        LLM response content as string
    """
    logger.info("-" * 40)
    logger.info(f"LLM Analysis Call: model={model}, provider={provider}")
    logger.info("-" * 40)

    # Log the messages being sent
    for i, msg in enumerate(messages):
        role = msg.get("role", "unknown")
        content = msg.get("content", "")
        logger.debug(f"Message [{i}] role={role}:")
        logger.debug(f"{content[:1000]}{'...' if len(content) > 1000 else ''}")

    logger.info(f"Sending {len(messages)} messages to LLM...")

    try:
        registry = LLMRegistry(provider=provider)
        llm = registry.get_llm(model)
        response = await llm.achat(messages)

        logger.debug(f"Response type: {type(response)}")
        logger.debug(f"Response attributes: {dir(response)}")

        # Extract string content from CompletionResponse
        # Handle various response formats from Axion/LiteLLM
        if hasattr(response, "content"):
            content = response.content
            logger.debug("Extracted content via .content")
        elif hasattr(response, "choices") and response.choices:
            content = response.choices[0].message.content
            logger.debug("Extracted content via .choices[0].message.content")
        elif hasattr(response, "text"):
            content = response.text
            logger.debug("Extracted content via .text")
        else:
            # Fallback: convert to string
            content = str(response)
            logger.warning(f"Fallback: converted response to string, type was {type(response)}")

        logger.info(f"LLM response received: {len(content)} chars")
        logger.debug(f"Response content:\n{content[:500]}{'...' if len(content) > 500 else ''}")

        return content

    except Exception as e:
        logger.error(f"LLM call failed: {e}", exc_info=True)
        raise


def is_provider_configured(provider: str) -> bool:
    """Check if a provider is configured via Axion's LLMRegistry.

    Args:
        provider: Provider name (openai, anthropic)

    Returns:
        True if the provider has valid credentials configured
    """
    try:
        registry = LLMRegistry(provider=provider)
        # Try to get the LLM - will raise if not configured
        registry.get_llm()
        logger.debug(f"Provider '{provider}' is configured")
        return True
    except Exception as e:
        logger.debug(f"Provider '{provider}' is not configured: {e}")
        return False


def get_configured_providers() -> list[str]:
    """Get list of configured providers.

    Returns:
        List of provider names that have valid credentials
    """
    configured = []
    for provider in ["openai", "anthropic"]:
        if is_provider_configured(provider):
            configured.append(provider)
    logger.info(f"Configured providers: {configured}")
    return configured


# Type for model info
ModelInfoDict = dict[str, str | int]

# Available models by provider (kept here for compatibility with /models endpoint)
AVAILABLE_MODELS: dict[str, list[ModelInfoDict]] = {
    "openai": [
        {"id": "gpt-5.2", "name": "GPT-5.2", "context_window": 256000},
        {"id": "gpt-5.2-mini", "name": "GPT-5.2 Mini", "context_window": 256000},
        {"id": "gpt-4.1", "name": "GPT-4.1", "context_window": 1000000},
        {"id": "gpt-4.1-mini", "name": "GPT-4.1 Mini", "context_window": 1000000},
        {"id": "gpt-4.1-nano", "name": "GPT-4.1 Nano", "context_window": 1000000},
        {"id": "gpt-4o", "name": "GPT-4o", "context_window": 128000},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "context_window": 128000},
        {"id": "o3", "name": "o3", "context_window": 200000},
        {"id": "o3-mini", "name": "o3 Mini", "context_window": 200000},
        {"id": "o1", "name": "o1", "context_window": 200000},
        {"id": "o1-mini", "name": "o1 Mini", "context_window": 128000},
    ],
    "anthropic": [
        {
            "id": "claude-opus-4-5-20251101",
            "name": "Claude Opus 4.5",
            "context_window": 200000,
        },
        {
            "id": "claude-sonnet-4-20250514",
            "name": "Claude Sonnet 4",
            "context_window": 200000,
        },
        {
            "id": "claude-3-7-sonnet-20250219",
            "name": "Claude 3.7 Sonnet",
            "context_window": 200000,
        },
        {
            "id": "claude-3-5-sonnet-20241022",
            "name": "Claude 3.5 Sonnet",
            "context_window": 200000,
        },
        {
            "id": "claude-3-5-haiku-20241022",
            "name": "Claude 3.5 Haiku",
            "context_window": 200000,
        },
        {
            "id": "claude-3-opus-20240229",
            "name": "Claude 3 Opus",
            "context_window": 200000,
        },
    ],
}
