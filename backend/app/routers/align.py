import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.models.align_schemas import (
    DEFAULT_EVALUATION_CRITERIA,
    DEFAULT_JUDGE_PROMPT,
    ClusterPatternsRequest,
    ClusterPatternsResponse,
    ConfigsListResponse,
    EvaluationRequest,
    EvaluationResponse,
    LLMProvider,
    MetricsRequest,
    MetricsResponse,
    MisalignmentAnalysis,
    MisalignmentAnalysisRequest,
    MisalignmentAnalysisResponse,
    ModelInfo,
    ModelsResponse,
    OptimizePromptRequest,
    OptimizePromptResponse,
    SaveConfigRequest,
    SaveConfigResponse,
    SavedConfig,
    SuggestExamplesRequest,
    SuggestExamplesResponse,
)
from app.services.align_service import (
    analyze_misalignment_patterns,
    calculate_alignment_metrics,
    cluster_annotation_patterns,
    generate_optimized_prompt,
    run_llm_evaluation,
    select_few_shot_examples,
)
from app.services.axion_adapter import (
    AVAILABLE_MODELS,
    get_configured_providers,
    is_provider_configured,
)

router = APIRouter()

# In-memory storage for saved configurations (in production, use a database)
saved_configs: dict[str, SavedConfig] = {}


@router.post("/evaluate", response_model=EvaluationResponse)
async def evaluate_dataset(request: EvaluationRequest) -> EvaluationResponse:
    """Run LLM judge evaluation on a dataset.

    Takes records with human annotations and evaluates them using the configured LLM judge.
    Returns individual results and aggregated alignment metrics.
    """
    try:
        # Validate we have annotations
        if not request.human_annotations:
            raise HTTPException(status_code=400, detail="No human annotations provided")

        # Validate provider is configured
        provider = request.judge_config.provider
        if not is_provider_configured(provider.value):
            raise HTTPException(
                status_code=400,
                detail=f"{provider.value} API key not configured. Set the appropriate environment variable.",
            )

        # Run evaluation (returns both results and metrics from Axion)
        results, metrics = await run_llm_evaluation(
            records=request.records,
            human_annotations=request.human_annotations,
            config=request.judge_config,
        )

        return EvaluationResponse(
            success=True,
            results=results,
            metrics=metrics,
            message=f"Evaluated {len(results)} records",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {e!s}")


@router.post("/metrics", response_model=MetricsResponse)
async def calculate_metrics(request: MetricsRequest) -> MetricsResponse:
    """Calculate alignment metrics from human and LLM scores.

    Use this endpoint when you already have scores and just need metrics.
    """
    try:
        if len(request.human_scores) != len(request.llm_scores):
            raise HTTPException(
                status_code=400,
                detail="Human and LLM score arrays must have the same length",
            )

        if not request.human_scores:
            raise HTTPException(status_code=400, detail="No scores provided")

        metrics = calculate_alignment_metrics(request.human_scores, request.llm_scores)

        return MetricsResponse(success=True, metrics=metrics)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Metrics calculation failed: {e!s}")


@router.post("/analyze-misalignment", response_model=MisalignmentAnalysisResponse)
async def analyze_misalignment(
    request: MisalignmentAnalysisRequest,
) -> MisalignmentAnalysisResponse:
    """Analyze patterns in misaligned cases.

    Identifies common patterns in cases where LLM and human judgments disagree,
    and provides recommendations for improvement.
    """
    try:
        misaligned = [r for r in request.results if not r.is_aligned]

        if not misaligned:
            return MisalignmentAnalysisResponse(
                success=True,
                analysis=MisalignmentAnalysis(
                    total_misaligned=0,
                    false_positives=0,
                    false_negatives=0,
                    patterns=[],
                    summary="No misaligned cases found. The judge is fully aligned with human annotations.",
                    recommendations=[],
                ),
            )

        analysis = await analyze_misalignment_patterns(
            results=request.results,
            config=request.judge_config,
        )

        return MisalignmentAnalysisResponse(success=True, analysis=analysis)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e!s}")


@router.post("/optimize-prompt", response_model=OptimizePromptResponse)
async def optimize_prompt(request: OptimizePromptRequest) -> OptimizePromptResponse:
    """Generate an optimized judge prompt based on misalignment patterns.

    Uses AI to analyze misaligned cases and suggest prompt improvements.
    """
    try:
        provider = request.current_config.provider
        if not is_provider_configured(provider.value):
            raise HTTPException(
                status_code=400,
                detail=f"{provider.value} API key not configured",
            )

        optimized = await generate_optimized_prompt(
            results=request.results,
            current_config=request.current_config,
        )

        return OptimizePromptResponse(
            success=True,
            optimized=optimized,
            message="Prompt optimization complete",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {e!s}")


@router.post("/suggest-examples", response_model=SuggestExamplesResponse)
async def suggest_examples(request: SuggestExamplesRequest) -> SuggestExamplesResponse:
    """Suggest few-shot examples from the annotated dataset.

    Selects examples based on the specified strategy:
    - representative: Balanced examples
    - edge_cases: Difficult or ambiguous cases
    - diverse: Maximum diversity in examples
    - recent: Most recently annotated
    """
    try:
        if not request.human_annotations:
            raise HTTPException(status_code=400, detail="No annotations provided")

        examples = select_few_shot_examples(
            records=request.records,
            annotations=request.human_annotations,
            strategy=request.strategy,
            count=request.count,
        )

        return SuggestExamplesResponse(
            success=True,
            examples=examples,
            strategy_used=request.strategy.value,
            message=f"Selected {len(examples)} examples using {request.strategy.value} strategy",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Example selection failed: {e!s}")


@router.post("/cluster-patterns", response_model=ClusterPatternsResponse)
async def cluster_patterns(request: ClusterPatternsRequest) -> ClusterPatternsResponse:
    """Cluster annotation notes into error patterns using AI.

    Takes annotations with optional notes and returns grouped patterns
    for pattern discovery and analysis. Optionally distills clusters into
    rich learning artifacts when include_learnings is True.
    """
    try:
        # Provider guardrail: LLM and hybrid methods require a configured provider
        if request.method in ("llm", "hybrid"):
            provider = (
                request.judge_config.provider.value
                if request.judge_config and request.judge_config.provider
                else "openai"
            )
            if not is_provider_configured(provider):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{provider} API key not configured. Required for {request.method} clustering. "
                        "Use 'bertopic' method for local-only clustering."
                    ),
                )

        # Filter to annotations with notes
        notes_count = sum(
            1 for ann in request.annotations.values() if ann.notes and ann.notes.strip()
        )

        if notes_count == 0:
            return ClusterPatternsResponse(
                success=True,
                patterns=[],
                uncategorized=[],
                message="No annotations with notes found to cluster.",
            )

        patterns, uncategorized, learnings, pipeline_metadata = await cluster_annotation_patterns(
            annotations=request.annotations,
            config=request.judge_config,
            method=request.method,
            domain_context=request.domain_context,
        )

        return ClusterPatternsResponse(
            success=True,
            patterns=patterns,
            uncategorized=uncategorized,
            learnings=learnings,
            pipeline_metadata=pipeline_metadata,
            message=f"Found {len(patterns)} patterns from {notes_count} annotated notes.",
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pattern clustering failed: {e!s}")


@router.get("/models", response_model=ModelsResponse)
async def get_available_models() -> ModelsResponse:
    """Get list of available LLM models.

    Returns models grouped by provider, with availability status
    based on whether the provider API key is configured.
    """
    models = []

    for provider_name, provider_models in AVAILABLE_MODELS.items():
        configured = is_provider_configured(provider_name)
        # Map string provider name to LLMProvider enum
        provider_enum = LLMProvider(provider_name)

        for model in provider_models:
            # context_window is always int in AVAILABLE_MODELS
            context_window = model["context_window"]
            models.append(
                ModelInfo(
                    id=str(model["id"]),
                    name=f"{model['name']}{'' if configured else ' (not configured)'}",
                    provider=provider_enum,
                    context_window=context_window
                    if isinstance(context_window, int)
                    else int(context_window),
                    supports_function_calling=True,
                )
            )

    return ModelsResponse(success=True, models=models)


@router.post("/save-config", response_model=SaveConfigResponse)
async def save_config(request: SaveConfigRequest) -> SaveConfigResponse:
    """Save a judge configuration.

    Configurations are stored in memory (use a database in production).
    """
    config_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    saved_config = SavedConfig(
        id=config_id,
        name=request.name,
        config=request.config,
        created_at=now,
        updated_at=now,
        metrics=request.metrics,
    )

    saved_configs[config_id] = saved_config

    return SaveConfigResponse(
        success=True,
        config_id=config_id,
        message=f"Configuration '{request.name}' saved",
    )


@router.get("/configs", response_model=ConfigsListResponse)
async def list_configs() -> ConfigsListResponse:
    """List all saved judge configurations."""
    return ConfigsListResponse(
        success=True,
        configs=list(saved_configs.values()),
    )


@router.get("/configs/{config_id}")
async def get_config(config_id: str) -> SavedConfig:
    """Get a specific saved configuration."""
    if config_id not in saved_configs:
        raise HTTPException(status_code=404, detail="Configuration not found")

    return saved_configs[config_id]


@router.delete("/configs/{config_id}")
async def delete_config(config_id: str) -> dict[str, object]:
    """Delete a saved configuration."""
    if config_id not in saved_configs:
        raise HTTPException(status_code=404, detail="Configuration not found")

    del saved_configs[config_id]
    return {"success": True, "message": "Configuration deleted"}


@router.get("/defaults")
async def get_defaults() -> dict[str, str]:
    """Get default prompt templates and evaluation criteria."""
    return {
        "system_prompt": DEFAULT_JUDGE_PROMPT,
        "evaluation_criteria": DEFAULT_EVALUATION_CRITERIA,
    }


@router.get("/status")
async def get_status() -> dict[str, object]:
    """Get status of the align service including configured providers."""
    configured_providers = get_configured_providers()

    return {
        "configured": len(configured_providers) > 0,
        "providers": {
            "openai": "openai" in configured_providers,
            "anthropic": "anthropic" in configured_providers,
        },
        "saved_configs_count": len(saved_configs),
    }
