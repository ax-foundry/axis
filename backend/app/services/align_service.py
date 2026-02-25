from typing import Any

from axion.caliber import (
    AnnotatedItem,
    ExampleSelector,
    MisalignmentAnalyzer,
    PromptOptimizer,
    SelectionStrategy,
)
from axion.caliber import (
    ClusteringMethod as AxionClusteringMethod,
)
from axion.caliber.evaluation import (
    cohen_kappa_score,
    confusion_matrix_binary,
    f1_score,
    precision_score,
    recall_score,
)
from axion.caliber.pattern_discovery import (
    EvidencePipeline,
    annotations_to_evidence,
)

from app.models.align_schemas import (
    AlignmentMetrics,
    AlignmentResult,
    AnnotationWithNotes,
    ClusteringMethod,
    ErrorPattern,
    ExampleSelectionStrategy,
    FewShotExample,
    JudgeConfig,
    LearningArtifactSchema,
    MisalignmentAnalysis,
    MisalignmentPattern,
    OptimizedPrompt,
    PipelineResultSchema,
    PromptSuggestion,
)
from app.services.axion_adapter import run_axion_evaluation


def calculate_alignment_metrics(human_scores: list[int], llm_scores: list[int]) -> AlignmentMetrics:
    """Calculate alignment metrics between human and LLM scores.

    Uses axion.caliber's metric functions for calculation.

    Args:
        human_scores: List of human binary scores (0 or 1)
        llm_scores: List of LLM binary scores (0 or 1)

    Returns:
        AlignmentMetrics with all computed values
    """
    if len(human_scores) != len(llm_scores):
        raise ValueError("Score arrays must have the same length")

    n = len(human_scores)
    if n == 0:
        raise ValueError("Cannot calculate metrics with empty arrays")

    # Get confusion matrix from caliber
    cm = confusion_matrix_binary(human_scores, llm_scores)
    tn, fp, fn, tp = cm["tn"], cm["fp"], cm["fn"], cm["tp"]

    # Calculate metrics using caliber functions
    accuracy = (tp + tn) / n
    kappa = cohen_kappa_score(human_scores, llm_scores)
    f1 = f1_score(human_scores, llm_scores)
    precision = precision_score(human_scores, llm_scores)
    recall = recall_score(human_scores, llm_scores)

    # Specificity: TN / (TN + FP)
    specificity = tn / (tn + fp) if (tn + fp) > 0 else 0.0

    return AlignmentMetrics(
        cohens_kappa=round(kappa, 4),
        f1_score=round(f1, 4),
        precision=round(precision, 4),
        recall=round(recall, 4),
        specificity=round(specificity, 4),
        accuracy=round(accuracy, 4),
        confusion_matrix=[[tn, fp], [fn, tp]],
        total_samples=n,
        agreement_count=tp + tn,
    )


async def run_llm_evaluation(
    records: list[dict[str, Any]],
    human_annotations: dict[str, int],
    config: JudgeConfig,
    batch_size: int = 5,
) -> tuple[list[AlignmentResult], AlignmentMetrics]:
    """Run LLM evaluation on a dataset using Axion WebAlignEval.

    Args:
        records: List of records to evaluate
        human_annotations: Dict mapping record_id to human score (0 or 1)
        config: Judge configuration
        batch_size: Number of concurrent evaluations (passed to Axion)

    Returns:
        Tuple of (AlignmentResult list, AlignmentMetrics)
    """
    return await run_axion_evaluation(
        records=records,
        human_annotations=human_annotations,
        config=config,
    )


async def analyze_misalignment_patterns(
    results: list[AlignmentResult],
    config: JudgeConfig,
) -> MisalignmentAnalysis:
    """Analyze patterns in misaligned cases using Axion MisalignmentAnalyzer.

    Uses LLM to identify common patterns and provide recommendations.

    Args:
        results: List of alignment results from evaluation
        config: Judge configuration with model settings

    Returns:
        MisalignmentAnalysis with patterns, summary, and recommendations
    """
    misaligned = [r for r in results if not r.is_aligned]

    if not misaligned:
        return MisalignmentAnalysis(
            total_misaligned=0,
            false_positives=0,
            false_negatives=0,
            patterns=[],
            summary="No misaligned cases found.",
            recommendations=[],
        )

    # Convert results to format expected by axion
    axion_results = [
        {
            "record_id": r.record_id,
            "query": r.query,
            "actual_output": r.actual_output,
            "human_score": r.human_score,
            "llm_score": r.llm_score,
            "llm_reasoning": r.llm_reasoning,
        }
        for r in results
    ]

    analyzer = MisalignmentAnalyzer(
        model_name=config.model,
        llm_provider=config.provider.value,
    )

    analysis = await analyzer.analyze(
        results=axion_results,
        evaluation_criteria=config.evaluation_criteria,
    )

    # Convert to AXIS schema
    return MisalignmentAnalysis(
        total_misaligned=analysis.total_misaligned,
        false_positives=analysis.false_positives,
        false_negatives=analysis.false_negatives,
        patterns=[
            MisalignmentPattern(
                pattern_type=p.pattern_type,
                description=p.description,
                count=p.count,
                examples=p.example_ids,
            )
            for p in analysis.patterns
        ],
        summary=analysis.summary,
        recommendations=analysis.recommendations,
    )


async def generate_optimized_prompt(
    results: list[AlignmentResult],
    current_config: JudgeConfig,
) -> OptimizedPrompt:
    """Generate an optimized judge prompt based on misalignment patterns.

    Uses Axion PromptOptimizer to analyze failures and suggest improvements.

    Args:
        results: List of alignment results from evaluation
        current_config: Current judge configuration

    Returns:
        OptimizedPrompt with improved criteria and suggestions
    """
    axion_results = [
        {
            "record_id": r.record_id,
            "query": r.query,
            "actual_output": r.actual_output,
            "human_score": r.human_score,
            "llm_score": r.llm_score,
            "llm_reasoning": r.llm_reasoning,
        }
        for r in results
    ]

    optimizer = PromptOptimizer(
        model_name=current_config.model,
        llm_provider=current_config.provider.value,
    )

    optimized = await optimizer.optimize(
        results=axion_results,
        current_criteria=current_config.evaluation_criteria,
        system_prompt=current_config.system_prompt,
    )

    # Build the full optimized prompt by replacing criteria in system prompt
    optimized_system_prompt = current_config.system_prompt.replace(
        current_config.evaluation_criteria,
        optimized.optimized_criteria,
    )

    return OptimizedPrompt(
        original_prompt=current_config.system_prompt,
        optimized_prompt=optimized_system_prompt,
        evaluation_criteria=optimized.optimized_criteria,
        suggestions=[
            PromptSuggestion(
                aspect=s.aspect,
                suggestion=s.suggestion,
                rationale=s.rationale,
            )
            for s in optimized.suggestions
        ],
        expected_improvement=optimized.expected_improvement,
    )


async def cluster_annotation_patterns(
    annotations: dict[str, AnnotationWithNotes],
    config: JudgeConfig | None = None,
    method: ClusteringMethod = ClusteringMethod.LLM,
    domain_context: str | None = None,
) -> tuple[
    list[ErrorPattern], list[str], list[LearningArtifactSchema], PipelineResultSchema | None
]:
    """Cluster annotation notes into error patterns using the EvidencePipeline.

    Runs the full EvidencePipeline which clusters annotations and distills
    them into rich LearningArtifacts with actionable insights.

    Supports three clustering methods:
    - LLM: Use LLM to categorize patterns (requires LLM API)
    - BERTOPIC: Use BERTopic for topic modeling (local, no API needed)
    - HYBRID: Combine BERTopic clustering with LLM labeling

    Args:
        annotations: Dict mapping record_id to annotation with notes
        config: Optional judge config for LLM settings
        method: Clustering method to use (default: LLM)
        domain_context: Domain context for distillation

    Returns:
        Tuple of (patterns, uncategorized, learnings, pipeline_metadata)
    """
    # Convert to AnnotatedItem format, filtering to annotations with notes
    axion_annotations = {
        record_id: AnnotatedItem(
            record_id=record_id,
            score=ann.score,
            notes=ann.notes,
        )
        for record_id, ann in annotations.items()
        if ann.notes and ann.notes.strip()
    }

    if not axion_annotations:
        return [], [], [], None

    # BERTopic/Hybrid require a minimum number of documents for UMAP dimensionality
    # reduction. With too few items, the sparse matrix eigenvector decomposition fails.
    min_bertopic_docs = 10
    if (
        method in (ClusteringMethod.BERTOPIC, ClusteringMethod.HYBRID)
        and len(axion_annotations) < min_bertopic_docs
    ):
        raise ValueError(
            f"{method.value.upper()} clustering requires at least {min_bertopic_docs} annotated notes "
            f"(found {len(axion_annotations)}). Add more annotations with notes, or use the LLM method."
        )

    model = config.model if config else "gpt-4o"
    provider = config.provider.value if config else "openai"

    # Map AXIS ClusteringMethod to axion ClusteringMethod
    method_map = {
        ClusteringMethod.LLM: AxionClusteringMethod.LLM,
        ClusteringMethod.BERTOPIC: AxionClusteringMethod.BERTOPIC,
        ClusteringMethod.HYBRID: AxionClusteringMethod.HYBRID,
    }
    axion_method = method_map.get(method, AxionClusteringMethod.LLM)

    evidence = annotations_to_evidence(axion_annotations)

    pipeline = EvidencePipeline(
        model_name=model,
        llm_provider=provider,
        method=axion_method,
        domain_context=domain_context,
        recurrence_threshold=2,
        max_learnings_per_cluster=3,
    )

    pipeline_result = await pipeline.run(
        evidence=evidence,
        method=axion_method,
    )

    # Map patterns from clustering result
    patterns = [
        ErrorPattern(
            category=p.category,
            count=p.count,
            examples=p.examples,
            record_ids=p.record_ids,
        )
        for p in pipeline_result.clustering_result.patterns
    ]

    uncategorized = pipeline_result.clustering_result.uncategorized

    # Map learnings
    learnings = [
        LearningArtifactSchema(
            title=la.title,
            content=la.content,
            tags=la.tags,
            confidence=la.confidence,
            supporting_item_ids=la.supporting_item_ids,
            recommended_actions=la.recommended_actions,
            counterexamples=la.counterexamples,
            scope=la.scope,
            when_not_to_apply=la.when_not_to_apply,
        )
        for la in pipeline_result.learnings
    ]

    # Map metadata from actual result objects
    pipeline_metadata = PipelineResultSchema(
        filtered_count=pipeline_result.filtered_count,
        deduplicated_count=pipeline_result.deduplicated_count,
        validation_repairs=pipeline_result.validation_repairs,
        total_analyzed=pipeline_result.clustering_result.total_analyzed,
        clustering_method=pipeline_result.clustering_result.method.value,
    )

    return patterns, uncategorized, learnings, pipeline_metadata


def select_few_shot_examples(
    records: list[dict[str, Any]],
    annotations: dict[str, int],
    strategy: ExampleSelectionStrategy,
    count: int = 4,
) -> list[FewShotExample]:
    """Select few-shot examples from the annotated dataset.

    Uses Axion ExampleSelector with various strategies for balanced,
    misalignment-guided, or pattern-aware selection.

    Args:
        records: All records in the dataset
        annotations: Dict mapping record_id to annotation (0 or 1)
        strategy: Selection strategy
        count: Number of examples to select

    Returns:
        List of FewShotExample objects
    """
    if not records or not annotations:
        return []

    selector = ExampleSelector()

    # Map AXIS strategy to axion strategy
    strategy_map = {
        ExampleSelectionStrategy.REPRESENTATIVE: SelectionStrategy.BALANCED,
        ExampleSelectionStrategy.DIVERSE: SelectionStrategy.BALANCED,
        ExampleSelectionStrategy.EDGE_CASES: SelectionStrategy.MISALIGNMENT_GUIDED,
        ExampleSelectionStrategy.RECENT: SelectionStrategy.BALANCED,
    }
    axion_strategy = strategy_map.get(strategy, SelectionStrategy.BALANCED)

    result = selector.select(
        records=records,
        annotations=annotations,
        count=count,
        strategy=axion_strategy,
    )

    return [
        FewShotExample(
            query=ex.get("query", ""),
            actual_output=ex.get("actual_output", ""),
            expected_output=ex.get("expected_output"),
            score=ex.get("score", 0),
            reasoning=ex.get(
                "reasoning",
                f"{'Accepted' if ex.get('score', 0) == 1 else 'Rejected'} based on human evaluation.",
            ),
        )
        for ex in result.examples
    ]
