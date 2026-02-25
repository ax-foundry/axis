import asyncio
import json
import logging
import math
import os
import statistics
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from difflib import SequenceMatcher
from typing import Any

import httpx
from axion import DatasetItem, evaluation_runner
from axion import metric_registry as axion_metric_registry
from axion.llm_registry import LLMRegistry

from app.models.eval_runner_schemas import (
    AgentConfig,
    AgentType,
    ColumnMapping,
    EvaluationSummary,
    ItemResult,
    MetricInfo,
    MetricResult,
)

logger = logging.getLogger(__name__)


class EvalRunnerError(Exception):
    """Base exception for eval runner errors."""

    pass


class MetricEvaluationError(EvalRunnerError):
    """Error during metric evaluation."""

    pass


class AgentConnectionError(EvalRunnerError):
    """Error connecting to agent API."""

    pass


# ============================================
# Metric Registry
# ============================================


def _safe_float(value: Any, default: float) -> float:
    """Safely convert values to float with a fallback."""
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else default
    except (TypeError, ValueError):
        return default


def _infer_is_llm_based(metric_class: Any, tags: list[str]) -> bool:
    """Infer if metric uses an LLM.

    Prefer explicit metadata on the metric class when available.
    """
    explicit_flag = getattr(metric_class, "is_llm_based", None)
    if isinstance(explicit_flag, bool):
        return explicit_flag

    non_llm_tags = {"heuristic", "retrieval", "tool", "binary"}
    return not bool(set(tags) & non_llm_tags)


def _build_metric_info(metric_key: str, metric_class: Any) -> MetricInfo:
    """Convert an axion metric class into API-facing MetricInfo."""
    config = getattr(metric_class, "config", None)
    if config is None:
        raise ValueError(f"Metric '{metric_key}' is missing config")

    raw_score_range = getattr(config, "score_range", None)
    if isinstance(raw_score_range, list | tuple) and len(raw_score_range) >= 2:
        score_range = (
            _safe_float(raw_score_range[0], 0.0),
            _safe_float(raw_score_range[1], 1.0),
        )
    else:
        score_range = (0.0, 1.0)

    tags = [str(tag) for tag in (getattr(config, "tags", []) or [])]
    key = str(getattr(config, "key", metric_key) or metric_key)

    return MetricInfo(
        key=key,
        name=str(getattr(config, "name", key) or key),
        description=str(getattr(config, "description", "") or ""),
        required_fields=[str(field) for field in (getattr(config, "required_fields", []) or [])],
        optional_fields=[str(field) for field in (getattr(config, "optional_fields", []) or [])],
        default_threshold=_safe_float(getattr(config, "default_threshold", 0.5), 0.5),
        score_range=score_range,
        tags=tags,
        is_llm_based=_infer_is_llm_based(metric_class, tags),
    )


def _load_metric_registry() -> list[MetricInfo]:
    """Build metric registry directly from axion metric classes."""
    metrics: list[MetricInfo] = []
    for metric_key, metric_class in axion_metric_registry._registry.items():
        try:
            metrics.append(_build_metric_info(str(metric_key), metric_class))
        except Exception as e:
            logger.warning(
                "Skipping invalid metric '%s' from axion registry: %s",
                metric_key,
                e,
            )

    return sorted(metrics, key=lambda metric: metric.key)


METRIC_REGISTRY: list[MetricInfo] = _load_metric_registry()

# Build a lookup dict for quick access
METRIC_REGISTRY_MAP: dict[str, MetricInfo] = {m.key: m for m in METRIC_REGISTRY}


def get_available_metrics() -> list[MetricInfo]:
    """Return all available metrics from the registry."""
    return METRIC_REGISTRY


def get_metric_by_key(key: str) -> MetricInfo | None:
    """Get a specific metric by its key."""
    return METRIC_REGISTRY_MAP.get(key)


# ============================================
# LLM-Based Metric Evaluation
# ============================================


async def evaluate_llm_metric(
    metric_key: str,
    item: dict[str, Any],
    model_name: str,
    llm_provider: str,
) -> tuple[float, str]:
    """Evaluate a single item using an LLM-based metric.

    Args:
        metric_key: The metric to evaluate
        item: The item data with required fields
        model_name: LLM model to use
        llm_provider: Provider (openai, anthropic)

    Returns:
        Tuple of (score, reasoning)
    """
    metric = METRIC_REGISTRY_MAP.get(metric_key)
    if not metric:
        raise MetricEvaluationError(f"Unknown metric: {metric_key}")

    # Build evaluation prompt based on metric type
    prompt = _build_metric_prompt(metric_key, item)

    try:
        registry = LLMRegistry(provider=llm_provider)
        llm = registry.get_llm(model_name)

        messages = [
            {
                "role": "system",
                "content": (
                    "You are an expert evaluator. Evaluate the given content "
                    "and respond with a JSON object containing:\n"
                    '- "score": a float between 0.0 and 1.0\n'
                    '- "reasoning": a brief explanation\n\n'
                    "Respond ONLY with valid JSON, no other text."
                ),
            },
            {"role": "user", "content": prompt},
        ]

        response = await llm.achat(messages)

        # Extract content from response
        if hasattr(response, "content"):
            content = response.content
        elif hasattr(response, "choices") and response.choices:
            content = response.choices[0].message.content
        else:
            content = str(response)

        # Parse JSON response
        try:
            # Find JSON in response (handle markdown code blocks)
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]

            result = json.loads(content.strip())
            score = float(result.get("score", 0.5))
            reasoning = result.get("reasoning", "No reasoning provided")

            # Clamp score to [0, 1]
            score = max(0.0, min(1.0, score))

            return score, reasoning

        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.warning(f"Failed to parse LLM response: {e}")
            return 0.5, f"Failed to parse evaluation response: {content[:100]}"

    except Exception as e:
        logger.error(f"LLM metric evaluation failed: {e}")
        raise MetricEvaluationError(f"Failed to evaluate {metric_key}: {e}") from e


def _build_metric_prompt(metric_key: str, item: dict[str, Any]) -> str:
    """Build the evaluation prompt for a specific metric."""
    query = item.get("query", "")
    actual_output = item.get("actual_output", "")
    expected_output = item.get("expected_output", "")
    retrieved_content = item.get("retrieved_content", "")

    prompts = {
        "answer_relevancy": f"""
Evaluate how relevant the response is to the query.

Query: {query}

Response: {actual_output}

Score from 0.0 (completely irrelevant) to 1.0 (perfectly relevant).
""",
        "answer_completeness": f"""
Evaluate if the response completely addresses all aspects of the query.

Query: {query}

Response: {actual_output}

Expected Output: {expected_output}

Score from 0.0 (misses everything) to 1.0 (completely addresses all aspects).
""",
        "answer_conciseness": f"""
Evaluate if the response is appropriately concise without unnecessary information.

Query: {query}

Response: {actual_output}

Score from 0.0 (very verbose/redundant) to 1.0 (perfectly concise).
""",
        "faithfulness": f"""
Evaluate if the response is faithful to the provided context (no hallucinations).

Query: {query}

Context: {retrieved_content}

Response: {actual_output}

Score from 0.0 (contains hallucinations) to 1.0 (fully grounded in context).
""",
        "factual_accuracy": f"""
Evaluate the factual accuracy of the response compared to the expected output.

Query: {query}

Response: {actual_output}

Expected (ground truth): {expected_output}

Score from 0.0 (factually incorrect) to 1.0 (factually accurate).
""",
        "contextual_precision": f"""
Evaluate the precision of the retrieved content - what fraction is relevant.

Query: {query}

Retrieved Content: {retrieved_content}

Expected Output: {expected_output}

Score from 0.0 (no relevant content) to 1.0 (all content is relevant).
""",
        "contextual_recall": f"""
Evaluate the recall of the retrieved content - does it cover all needed information.

Query: {query}

Retrieved Content: {retrieved_content}

Expected Output: {expected_output}

Score from 0.0 (misses all relevant info) to 1.0 (contains all needed info).
""",
        "contextual_relevancy": f"""
Evaluate how relevant the retrieved content is to answering the query.

Query: {query}

Retrieved Content: {retrieved_content}

Score from 0.0 (irrelevant) to 1.0 (highly relevant).
""",
        "contextual_sufficiency": f"""
Evaluate if the retrieved content provides sufficient information to answer the query.

Query: {query}

Retrieved Content: {retrieved_content}

Response: {actual_output}

Score from 0.0 (insufficient) to 1.0 (fully sufficient).
""",
        "contextual_utilization": f"""
Evaluate how well the response utilizes the provided context.

Query: {query}

Context: {retrieved_content}

Response: {actual_output}

Score from 0.0 (doesn't use context) to 1.0 (effectively uses all relevant context).
""",
        "contextual_ranking": f"""
Evaluate the ranking quality of the retrieved content.

Query: {query}

Retrieved Content (in order): {retrieved_content}

Expected Output: {expected_output}

Score from 0.0 (poor ranking) to 1.0 (optimal ranking).
""",
        "citation_relevancy": f"""
Evaluate if citations in the response are relevant to the claims made.

Query: {query}

Response: {actual_output}

Retrieved Content: {retrieved_content}

Score from 0.0 (irrelevant citations) to 1.0 (all citations relevant).
""",
        "tone_style_consistency": f"""
Evaluate consistency of tone and writing style between response and expected output.

Query: {query}

Response: {actual_output}

Expected Style Reference: {expected_output}

Score from 0.0 (very different style) to 1.0 (consistent style).
""",
        "answer_criteria": f"""
Evaluate the response against the specified acceptance criteria.

Query: {query}

Response: {actual_output}

Acceptance Criteria: {item.get("acceptance_criteria", "No criteria specified")}

Score from 0.0 (fails all criteria) to 1.0 (meets all criteria).
""",
    }

    # Handle conversation-based metrics
    if metric_key in [
        "conversation_flow",
        "goal_completion",
        "conversation_efficiency",
        "persona_tone_adherence",
    ]:
        conversation = item.get("conversation", "")
        prompts.update(
            {
                "conversation_flow": f"""
Evaluate the natural flow and coherence of this conversation.

Conversation: {conversation}

Score from 0.0 (incoherent/choppy) to 1.0 (naturally flowing).
""",
                "goal_completion": f"""
Evaluate if the conversation achieves its intended goal.

Conversation: {conversation}

Score from 0.0 (goal not achieved) to 1.0 (goal fully achieved).
""",
                "conversation_efficiency": f"""
Evaluate how efficiently the conversation reaches its goal.

Conversation: {conversation}

Score from 0.0 (very inefficient) to 1.0 (highly efficient).
""",
                "persona_tone_adherence": f"""
Evaluate if the assistant maintains consistent persona and tone.

Conversation: {conversation}

Score from 0.0 (inconsistent persona) to 1.0 (perfectly consistent).
""",
            }
        )

    return prompts.get(
        metric_key,
        f"Evaluate the quality of this response.\n\nQuery: {query}\n\nResponse: {actual_output}",
    )


# ============================================
# Heuristic Metric Evaluation
# ============================================


def evaluate_heuristic_metric(
    metric_key: str,
    item: dict[str, Any],
) -> tuple[float, str]:
    """Evaluate a single item using a heuristic (non-LLM) metric.

    Args:
        metric_key: The metric to evaluate
        item: The item data with required fields

    Returns:
        Tuple of (score, reasoning)
    """
    actual_output = str(item.get("actual_output", ""))
    expected_output = str(item.get("expected_output", ""))

    if metric_key == "exact_string_match":
        match = actual_output.strip() == expected_output.strip()
        return (1.0 if match else 0.0, "Exact match" if match else "No exact match")

    elif metric_key == "levenshtein_ratio":
        ratio = SequenceMatcher(None, actual_output, expected_output).ratio()
        return (ratio, f"Similarity ratio: {ratio:.2%}")

    elif metric_key == "sentence_bleu":
        score = _calculate_bleu(actual_output, expected_output)
        return (score, f"BLEU score: {score:.4f}")

    elif metric_key == "contains_match":
        expected_subs = item.get("expected_substrings", [expected_output])
        if isinstance(expected_subs, str):
            expected_subs = [expected_subs]
        matches = sum(1 for sub in expected_subs if sub.lower() in actual_output.lower())
        score = matches / len(expected_subs) if expected_subs else 0.0
        return (score, f"Matched {matches}/{len(expected_subs)} substrings")

    elif metric_key == "length_constraint":
        length = len(actual_output)
        min_len = item.get("min_length", 1)
        max_len = item.get("max_length", 10000)
        if min_len <= length <= max_len:
            return (1.0, f"Length {length} within bounds [{min_len}, {max_len}]")
        return (0.0, f"Length {length} outside bounds [{min_len}, {max_len}]")

    elif metric_key == "citation_presence":
        # Simple heuristic: check for common citation patterns
        citation_patterns = [
            "[1]",
            "[2]",
            "(1)",
            "(2)",
            "http://",
            "https://",
            "source:",
            "reference:",
        ]
        has_citation = any(p in actual_output.lower() for p in citation_patterns)
        return (
            1.0 if has_citation else 0.0,
            "Citation found" if has_citation else "No citation found",
        )

    elif metric_key == "latency":
        latency = float(item.get("latency", 0))
        # Normalize: lower latency is better, cap at threshold for score calculation
        threshold = 1000.0  # 1 second baseline
        score = max(0.0, 1.0 - (latency / threshold))
        return (score, f"Latency: {latency}ms")

    elif metric_key in ["hit_rate_at_k", "precision_at_k", "recall_at_k", "ndcg_at_k", "mrr"]:
        # Retrieval metrics - simplified implementation
        retrieved = item.get("retrieved_content", "")
        expected = item.get("expected_output", "")
        # Simple overlap-based approximation
        if not retrieved or not expected:
            return (0.0, "Missing retrieved content or expected output")
        overlap = SequenceMatcher(None, retrieved, expected).ratio()
        return (overlap, f"Content overlap: {overlap:.2%}")

    elif metric_key == "tool_correctness":
        tools_called = item.get("tools_called", [])
        expected_tools = item.get("expected_tools", [])
        if isinstance(tools_called, str):
            tools_called = [t.strip() for t in tools_called.split(",")]
        if isinstance(expected_tools, str):
            expected_tools = [t.strip() for t in expected_tools.split(",")]

        if not expected_tools:
            return (1.0, "No expected tools specified")

        correct = sum(1 for t in expected_tools if t in tools_called)
        score = correct / len(expected_tools)
        return (score, f"Correct tools: {correct}/{len(expected_tools)}")

    return (0.5, f"Unknown metric: {metric_key}")


def _calculate_bleu(candidate: str, reference: str, max_n: int = 4) -> float:
    """Calculate a simple BLEU score."""
    candidate_tokens = candidate.lower().split()
    reference_tokens = reference.lower().split()

    if not candidate_tokens or not reference_tokens:
        return 0.0

    precisions = []
    for n in range(1, min(max_n + 1, len(candidate_tokens) + 1)):
        candidate_ngrams = [
            tuple(candidate_tokens[i : i + n]) for i in range(len(candidate_tokens) - n + 1)
        ]
        reference_ngrams = {
            tuple(reference_tokens[i : i + n]) for i in range(len(reference_tokens) - n + 1)
        }

        if not candidate_ngrams:
            continue

        matches = sum(1 for ng in candidate_ngrams if ng in reference_ngrams)
        precisions.append(matches / len(candidate_ngrams))

    if not precisions:
        return 0.0

    # Geometric mean of precisions
    from math import exp, log

    log_precision = sum(log(p) if p > 0 else -10 for p in precisions) / len(precisions)

    # Brevity penalty
    bp = (
        1.0
        if len(candidate_tokens) >= len(reference_tokens)
        else exp(1 - len(reference_tokens) / len(candidate_tokens))
    )

    return bp * exp(log_precision)


# ============================================
# Agent API Integration
# ============================================


async def call_agent_api(
    agent_config: AgentConfig,
    query: str,
) -> tuple[str, float]:
    """Call an external agent API to generate output.

    Args:
        agent_config: Agent configuration
        query: The query to send

    Returns:
        Tuple of (output, latency_ms)
    """
    if agent_config.type == AgentType.NONE:
        raise AgentConnectionError("No agent configured")

    if agent_config.type == AgentType.API:
        return await _call_http_agent(agent_config, query)

    if agent_config.type == AgentType.PROMPT:
        return await _call_prompt_agent(agent_config, query)

    raise AgentConnectionError(f"Unknown agent type: {agent_config.type}")


async def _call_http_agent(agent_config: AgentConfig, query: str) -> tuple[str, float]:
    """Call an HTTP-based agent API."""
    if not agent_config.api_config:
        raise AgentConnectionError("API config not provided")

    config = agent_config.api_config
    start_time = datetime.now(UTC)

    # Build request body by replacing {{query}} placeholder
    body_str = config.request_template.replace("{{query}}", query)
    try:
        body = json.loads(body_str)
    except json.JSONDecodeError:
        body = {"message": query}

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                config.endpoint_url,
                json=body,
                headers=config.headers,
            )
            response.raise_for_status()
            data = response.json()

            # Extract output using response path
            output = _extract_json_path(data, config.response_path)

            elapsed = (datetime.now(UTC) - start_time).total_seconds() * 1000
            return str(output), elapsed

        except Exception as e:
            raise AgentConnectionError(f"HTTP agent call failed: {e}") from e


async def _call_prompt_agent(agent_config: AgentConfig, query: str) -> tuple[str, float]:
    """Call an LLM with a prompt template."""
    if not agent_config.prompt_config:
        raise AgentConnectionError("Prompt config not provided")

    config = agent_config.prompt_config
    start_time = datetime.now(UTC)

    try:
        registry = LLMRegistry(provider=config.provider.value)
        llm = registry.get_llm(config.model)

        user_prompt = config.user_prompt_template.replace("{{query}}", query)

        messages = [
            {"role": "system", "content": config.system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        response = await llm.achat(messages)

        if hasattr(response, "content"):
            output = response.content
        elif hasattr(response, "choices") and response.choices:
            output = response.choices[0].message.content
        else:
            output = str(response)

        elapsed = (datetime.now(UTC) - start_time).total_seconds() * 1000
        return output, elapsed

    except Exception as e:
        raise AgentConnectionError(f"Prompt agent call failed: {e}") from e


def _extract_json_path(data: dict[str, Any], path: str) -> Any:
    """Extract a value from nested JSON using a dot-notation path."""
    if not path or path == ".":
        return data

    # Remove leading dot if present
    if path.startswith("."):
        path = path[1:]

    parts = path.split(".")
    current = data

    for part in parts:
        if isinstance(current, dict):
            current = current.get(part, "")
        elif isinstance(current, list) and part.isdigit():
            idx = int(part)
            current = current[idx] if idx < len(current) else ""
        else:
            return ""

    return current


def _serialize_value(val: Any) -> Any:
    """Serialize a value to be JSON-compatible."""
    # Handle None and pandas NA
    if val is None:
        return None
    if hasattr(val, "__class__") and val.__class__.__name__ in ("NAType", "NaTType"):
        return None

    # Handle NaN
    if isinstance(val, float) and (val != val):
        return None

    # Handle basic types
    if isinstance(val, str | int | bool):
        return val
    if isinstance(val, float):
        return val

    # Handle numpy types
    if hasattr(val, "item"):  # numpy scalar
        return val.item()
    if hasattr(val, "tolist"):  # numpy array
        return val.tolist()

    # Handle datetime
    if hasattr(val, "isoformat"):
        return val.isoformat()

    # Handle dicts recursively
    if isinstance(val, dict):
        return {k: _serialize_value(v) for k, v in val.items()}

    # Handle lists recursively
    if isinstance(val, list):
        return [_serialize_value(v) for v in val]

    # Handle sets
    if isinstance(val, set):
        return [_serialize_value(v) for v in val]

    # Fallback: convert to string
    try:
        return str(val)
    except Exception:
        return None


# ============================================
# Main Evaluation Runner (using axion)
# ============================================


def prepare_evaluation_data(
    dataset_data: list[dict[str, Any]],
    column_mapping: ColumnMapping,
    metrics: list[str],
) -> tuple[list[DatasetItem], list[Any], list[str], list[str]]:
    """Validate data, build DatasetItems, and instantiate metrics.

    Returns:
        Tuple of (dataset_items, scoring_metrics, valid_metric_keys, warnings).
        Warnings are human-readable strings for surfacing to the user.
    """
    warnings: list[str] = []

    # Build DatasetItem list from input data
    dataset_items: list[DatasetItem] = []
    for i, row in enumerate(dataset_data):
        item_kwargs: dict[str, Any] = {}

        # Map columns to DatasetItem fields
        if column_mapping.query:
            item_kwargs["query"] = str(row.get(column_mapping.query, ""))
        if column_mapping.actual_output:
            item_kwargs["actual_output"] = str(row.get(column_mapping.actual_output, ""))
        if column_mapping.expected_output:
            val = row.get(column_mapping.expected_output)
            if val:
                item_kwargs["expected_output"] = str(val)
        if column_mapping.retrieved_content:
            val = row.get(column_mapping.retrieved_content)
            if val:
                # axion expects retrieved_content as a list of strings
                if isinstance(val, list):
                    item_kwargs["retrieved_content"] = [str(v) for v in val]
                else:
                    item_kwargs["retrieved_content"] = [str(val)]
        if column_mapping.latency:
            val = row.get(column_mapping.latency)
            if val:
                item_kwargs["latency"] = float(val)
        if column_mapping.tools_called:
            val = row.get(column_mapping.tools_called)
            if val:
                item_kwargs["tools_called"] = val if isinstance(val, list) else [val]
        if column_mapping.expected_tools:
            val = row.get(column_mapping.expected_tools)
            if val:
                item_kwargs["expected_tools"] = val if isinstance(val, list) else [val]
        if column_mapping.acceptance_criteria:
            val = row.get(column_mapping.acceptance_criteria)
            if val:
                item_kwargs["acceptance_criteria"] = str(val)

        # Create DatasetItem
        try:
            dataset_items.append(DatasetItem(**item_kwargs))
        except Exception as e:
            msg = f"Row {i}: validation issue — {e}"
            warnings.append(msg)
            logger.warning(f"Failed to create DatasetItem for row {i}: {e}")
            # Create minimal item
            dataset_items.append(
                DatasetItem(
                    query=item_kwargs.get("query", f"Item {i}"),
                    actual_output=item_kwargs.get("actual_output", ""),
                )
            )

    # Check which fields are actually populated across the dataset
    populated_fields: set[str] = set()
    for item in dataset_items:
        if item.query:
            populated_fields.add("query")
        if item.actual_output:
            populated_fields.add("actual_output")
        if item.expected_output:
            populated_fields.add("expected_output")
        if item.retrieved_content:
            populated_fields.add("retrieved_content")

    # Get metric instances from axion's registry
    scoring_metrics = []
    valid_metric_keys = []
    for metric_key in metrics:
        try:
            metric_class = axion_metric_registry.get(metric_key)
            if metric_class:
                metric_instance = metric_class()

                # Check required fields for this metric
                metric_info = METRIC_REGISTRY_MAP.get(metric_key)
                if metric_info:
                    missing_fields = [
                        f for f in metric_info.required_fields if f not in populated_fields
                    ]
                    if missing_fields:
                        msg = (
                            f"Metric '{metric_info.name}' requires {missing_fields} "
                            f"but data only has {sorted(populated_fields)}"
                        )
                        warnings.append(msg)
                        logger.warning(msg)

                scoring_metrics.append(metric_instance)
                valid_metric_keys.append(metric_key)
            else:
                msg = f"Metric '{metric_key}' not found in axion registry"
                warnings.append(msg)
                logger.warning(msg)
        except Exception as e:
            msg = f"Failed to instantiate metric '{metric_key}': {e}"
            warnings.append(msg)
            logger.warning(msg)

    if not scoring_metrics:
        raise EvalRunnerError("No valid metrics could be instantiated")

    return dataset_items, scoring_metrics, valid_metric_keys, warnings


def _run_evaluation_core(
    evaluation_name: str,
    dataset_items: list[DatasetItem],
    scoring_metrics: list[Any],
    valid_metric_keys: list[str],
    model_name: str,
    llm_provider: str,
    max_concurrent: int,
    thresholds: dict[str, float] | None,
) -> EvaluationSummary:
    """Run axion evaluation_runner and process results.

    This is the synchronous core that runs in a thread pool.
    Expects pre-validated dataset_items and scoring_metrics.
    """
    thresholds = thresholds or {}

    # Set environment for LLM provider
    os.environ["LLM_PROVIDER"] = llm_provider
    os.environ["LLM_MODEL_NAME"] = model_name

    # Run axion's evaluation_runner
    logger.info(
        f"Running axion evaluation_runner with {len(dataset_items)} items, {len(scoring_metrics)} metrics"
    )

    result = evaluation_runner(
        evaluation_inputs=dataset_items,
        evaluation_name=evaluation_name,
        scoring_metrics=scoring_metrics,
        max_concurrent=max_concurrent,
        thresholds=thresholds if thresholds else None,
        show_progress=True,  # Show tqdm progress bar
    )

    if result is None:
        raise EvalRunnerError("evaluation_runner returned None")

    # Convert axion result to our schema
    # Axion run_id looks like "evaluation_019c1a14-cef8-7c34-bc97-7415d24e73fe"
    raw_run_id = str(result.run_id) if result.run_id else ""
    if raw_run_id.startswith("evaluation_"):
        raw_run_id = raw_run_id[len("evaluation_") :]
    run_id = raw_run_id if raw_run_id else str(uuid.uuid4())

    # Build a name-to-key mapping for metrics (e.g., "Answer Relevancy" -> "answer_relevancy")
    metric_name_to_key: dict[str, str] = {}
    for key in valid_metric_keys:
        info = METRIC_REGISTRY_MAP.get(key)
        if info:
            metric_name_to_key[info.name] = key
            # Also add lowercase version for fuzzy matching
            metric_name_to_key[info.name.lower()] = key

    # Build item results from axion's results
    item_results: list[ItemResult] = []
    metric_scores_map: dict[str, list[float]] = {m: [] for m in valid_metric_keys}

    for eval_item in result.results:
        scores: dict[str, float] = {}
        reasons: dict[str, str] = {}

        # Extract test_case for item data
        test_case = eval_item.test_case if hasattr(eval_item, "test_case") else None

        # Extract scores from score_results (it's a LIST of MetricScore objects)
        score_results = getattr(eval_item, "score_results", []) or []
        for metric_score in score_results:
            # Get the metric key from the name
            metric_name = getattr(metric_score, "name", "")
            found_metric_key = metric_name_to_key.get(metric_name) or metric_name_to_key.get(
                metric_name.lower()
            )

            if found_metric_key and found_metric_key in valid_metric_keys:
                score = getattr(metric_score, "score", 0.0) or 0.0
                reason = getattr(metric_score, "explanation", "") or ""
                scores[found_metric_key] = float(score)
                reasons[found_metric_key] = reason
                metric_scores_map[found_metric_key].append(float(score))

        avg_score = sum(scores.values()) / len(scores) if scores else 0
        passed = avg_score >= 0.5

        # Get item data from test_case
        item_id = (
            str(test_case.id)[:8]
            if test_case and hasattr(test_case, "id")
            else str(uuid.uuid4())[:8]
        )
        query = test_case.query if test_case and hasattr(test_case, "query") else ""
        actual_output = (
            test_case.actual_output if test_case and hasattr(test_case, "actual_output") else ""
        )
        expected_output = (
            test_case.expected_output
            if test_case and hasattr(test_case, "expected_output")
            else None
        )

        item_results.append(
            ItemResult(
                item_id=item_id,
                query=query,
                actual_output=actual_output,
                expected_output=expected_output,
                metric_scores=scores,
                metric_reasons=reasons,
                passed=passed,
            )
        )

    # Build metric results
    metric_results: list[MetricResult] = []
    for metric_key in valid_metric_keys:
        metric_scores_list = metric_scores_map[metric_key]
        metric_info = METRIC_REGISTRY_MAP.get(metric_key)
        default_threshold = metric_info.default_threshold if metric_info else 0.5
        threshold = thresholds.get(metric_key, default_threshold)

        if metric_scores_list:
            avg = sum(metric_scores_list) / len(metric_scores_list)
            median = statistics.median(metric_scores_list)
            min_score = min(metric_scores_list)
            max_score = max(metric_scores_list)
            pass_rate = sum(1 for s in metric_scores_list if s >= threshold) / len(
                metric_scores_list
            )
        else:
            avg = median = min_score = max_score = pass_rate = 0.0

        metric_results.append(
            MetricResult(
                metric_key=metric_key,
                metric_name=metric_info.name if metric_info else metric_key,
                average_score=round(avg, 4),
                median_score=round(median, 4),
                min_score=round(min_score, 4),
                max_score=round(max_score, 4),
                pass_rate=round(pass_rate, 4),
                threshold=threshold,
                passed=pass_rate >= 0.5,
                scores=metric_scores_list,
            )
        )

    # Calculate overall summary
    overall_avg = (
        sum(mr.average_score for mr in metric_results) / len(metric_results)
        if metric_results
        else 0
    )
    overall_pass_rate = (
        sum(1 for ir in item_results if ir.passed) / len(item_results) if item_results else 0
    )

    # Extract full dataframe from axion results
    dataframe_records: list[dict[str, Any]] = []
    dataframe_columns: list[str] = []
    try:
        df = result.to_dataframe()
        # Convert DataFrame to list of dicts, handling NaN and other special values
        dataframe_columns = list(df.columns)
        for _, row in df.iterrows():
            record: dict[str, Any] = {}
            for col in dataframe_columns:
                val = row[col]
                record[col] = _serialize_value(val)
            dataframe_records.append(record)
        logger.info(
            f"Extracted {len(dataframe_records)} rows with {len(dataframe_columns)} columns from axion dataframe"
        )
    except Exception as e:
        logger.warning(f"Failed to extract dataframe from axion results: {e}", exc_info=True)

    return EvaluationSummary(
        evaluation_name=evaluation_name,
        run_id=run_id,
        total_items=len(dataset_items),
        metrics_count=len(valid_metric_keys),
        average_score=round(overall_avg, 4),
        overall_pass_rate=round(overall_pass_rate, 4),
        metric_results=metric_results,
        item_results=item_results,
        dataframe_records=dataframe_records,
        dataframe_columns=dataframe_columns,
    )


def run_evaluation_sync(
    evaluation_name: str,
    dataset_data: list[dict[str, Any]],
    column_mapping: ColumnMapping,
    metrics: list[str],
    model_name: str,
    llm_provider: str,
    max_concurrent: int,
    thresholds: dict[str, float] | None,
    agent_config: AgentConfig | None,
) -> EvaluationSummary:
    """Run evaluation using axion's evaluation_runner (synchronous).

    Convenience wrapper that validates data and runs evaluation in one call.
    """
    dataset_items, scoring_metrics, valid_metric_keys, _warnings = prepare_evaluation_data(
        dataset_data, column_mapping, metrics
    )
    return _run_evaluation_core(
        evaluation_name=evaluation_name,
        dataset_items=dataset_items,
        scoring_metrics=scoring_metrics,
        valid_metric_keys=valid_metric_keys,
        model_name=model_name,
        llm_provider=llm_provider,
        max_concurrent=max_concurrent,
        thresholds=thresholds,
    )


async def run_evaluation(
    evaluation_name: str,
    dataset_data: list[dict[str, Any]],
    column_mapping: ColumnMapping,
    metrics: list[str],
    model_name: str,
    llm_provider: str,
    max_concurrent: int,
    thresholds: dict[str, float] | None,
    agent_config: AgentConfig | None,
    on_progress: Any | None = None,
    on_log: Any | None = None,
) -> EvaluationSummary:
    """Run evaluation asynchronously using axion's evaluation_runner.

    Runs the synchronous evaluation_runner in a thread pool to not block
    the async event loop while still showing progress in the terminal.
    """
    # Generate outputs from agent if configured
    if agent_config and agent_config.type != AgentType.NONE:
        logger.info("Generating outputs from agent...")
        for i, row in enumerate(dataset_data):
            output_col = column_mapping.actual_output
            if output_col and not row.get(output_col):
                try:
                    query_col = column_mapping.query
                    query = str(row.get(query_col, "")) if query_col else ""
                    output, latency = await call_agent_api(agent_config, query)
                    row[output_col] = output
                    if column_mapping.latency:
                        row[column_mapping.latency] = latency
                except AgentConnectionError as e:
                    logger.error(f"Agent call failed for row {i}: {e}")
                    row[output_col] = ""

    # Run the synchronous evaluation in a thread pool
    loop = asyncio.get_event_loop()
    summary = await loop.run_in_executor(
        None,
        run_evaluation_sync,
        evaluation_name,
        dataset_data,
        column_mapping,
        metrics,
        model_name,
        llm_provider,
        max_concurrent,
        thresholds,
        agent_config,
    )

    return summary


async def run_evaluation_stream(
    evaluation_name: str,
    dataset_data: list[dict[str, Any]],
    column_mapping: ColumnMapping,
    metrics: list[str],
    model_name: str,
    llm_provider: str,
    max_concurrent: int,
    thresholds: dict[str, float] | None,
    agent_config: AgentConfig | None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Run evaluation with SSE streaming updates.

    Yields SSE events for progress, logs, and completion.
    Runs validation in the async context for real progress tracking,
    then runs axion evaluation in a thread pool.
    """
    import concurrent.futures

    total_evaluations = len(dataset_data) * len(metrics)
    thresholds = thresholds or {}

    def _make_log(level: str, message: str) -> dict[str, Any]:
        return {
            "event": "log",
            "data": {
                "timestamp": datetime.now(UTC).isoformat(),
                "level": level,
                "message": message,
            },
        }

    def _make_progress(
        current: int, total: int, status: str, message: str, phase: str = "running"
    ) -> dict[str, Any]:
        return {
            "event": "progress",
            "data": {
                "current": current,
                "total": total,
                "status": status,
                "message": message,
                "phase": phase,
            },
        }

    try:
        yield _make_log("INFO", f"Starting evaluation: {evaluation_name}")
        yield _make_log(
            "INFO",
            f"Processing {len(dataset_data)} items with {len(metrics)} metrics "
            f"({total_evaluations} total evaluations)",
        )

        # Phase 1: Validate data and prepare metrics (real progress)
        yield _make_progress(0, total_evaluations, "running", "Validating data...", "validating")

        # Generate outputs from agent if configured
        if agent_config and agent_config.type != AgentType.NONE:
            yield _make_log("INFO", f"Generating outputs from agent ({agent_config.type.value})...")
            for i, row in enumerate(dataset_data):
                output_col = column_mapping.actual_output
                if output_col and not row.get(output_col):
                    try:
                        query_col = column_mapping.query
                        query = str(row.get(query_col, "")) if query_col else ""
                        output, latency = await call_agent_api(agent_config, query)
                        row[output_col] = output
                        if column_mapping.latency:
                            row[column_mapping.latency] = latency
                    except AgentConnectionError as e:
                        yield _make_log("WARNING", f"Agent call failed for row {i}: {e}")
                        row[output_col] = ""

        dataset_items, scoring_metrics, valid_metric_keys, warnings = prepare_evaluation_data(
            dataset_data, column_mapping, metrics
        )

        yield _make_log("INFO", f"Validated {len(dataset_items)} items successfully")
        yield _make_log("INFO", f"Instantiated {len(scoring_metrics)} metrics: {valid_metric_keys}")

        # Surface validation warnings as log events
        if warnings:
            yield _make_log(
                "WARNING",
                f"{len(warnings)} validation warning(s) detected:",
            )
            for warn_msg in warnings:
                yield _make_log("WARNING", warn_msg)

        # Phase 2: Run axion evaluation in thread pool
        yield _make_progress(0, total_evaluations, "running", "Running evaluation...", "evaluating")
        yield _make_log("INFO", "Starting metric evaluation with axion...")

        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(
                _run_evaluation_core,
                evaluation_name,
                dataset_items,
                scoring_metrics,
                valid_metric_keys,
                model_name,
                llm_provider,
                max_concurrent,
                thresholds,
            )

            # Poll for completion while sending progress updates
            elapsed: float = 0
            poll_interval = 0.5  # Faster polling for better UX
            while not future.done():
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval

                # Estimate progress — use log curve for more natural feel
                # Approaches 90% asymptotically, never reaches 100% until done
                import math

                progress_pct = 1 - math.exp(-elapsed * max_concurrent * 0.3 / total_evaluations)
                estimated_progress = min(
                    int(progress_pct * total_evaluations),
                    total_evaluations - 1,
                )

                yield _make_progress(
                    estimated_progress,
                    total_evaluations,
                    "running",
                    f"Evaluating metrics... ({int(elapsed)}s elapsed)",
                    "evaluating",
                )

            # Get the result (may raise)
            summary = future.result()

        # Phase 3: Complete
        logger.info(
            f"Evaluation complete, preparing response with "
            f"{len(summary.dataframe_records)} dataframe records"
        )

        yield _make_progress(
            total_evaluations, total_evaluations, "complete", "Evaluation complete!", "complete"
        )

        # Check for potential issues in results
        zero_metrics = [
            mr.metric_name
            for mr in summary.metric_results
            if mr.average_score == 0.0 and mr.pass_rate == 0.0
        ]
        if zero_metrics:
            yield _make_log(
                "WARNING",
                f"Metrics with 0% scores: {zero_metrics}. "
                "This may indicate missing required data fields (e.g., expected_output, "
                "retrieved_content) or metric execution failures.",
            )

        # Serialize summary carefully to handle any problematic values
        try:
            summary_dict = summary.model_dump()
            if summary_dict.get("dataframe_records"):
                for record in summary_dict["dataframe_records"]:
                    for key, val in list(record.items()):
                        if val is not None and not isinstance(
                            val, str | int | float | bool | list | dict
                        ):
                            record[key] = str(val)
            logger.info(
                f"Serialized summary with {len(summary_dict.get('dataframe_records', []))} records"
            )
        except Exception as e:
            logger.error(f"Failed to serialize summary: {e}")
            summary_dict = summary.model_dump(exclude={"dataframe_records", "dataframe_columns"})
            summary_dict["dataframe_records"] = []
            summary_dict["dataframe_columns"] = []

        yield {
            "event": "complete",
            "data": {
                "run_id": summary.run_id,
                "summary": summary_dict,
            },
        }

    except Exception as e:
        logger.error(f"Evaluation stream error: {e}", exc_info=True)
        yield {
            "event": "error",
            "data": {
                "message": str(e),
                "details": None,
            },
        }
