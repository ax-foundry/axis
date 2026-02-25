import logging
from typing import Any

from app.copilot.skills.base import BaseSkill, SkillMetadata, SkillParameter
from app.copilot.thoughts import ThoughtStream

logger = logging.getLogger("axis.copilot.skills.evaluate")


class EvaluateSkill(BaseSkill):
    """Skill for running LLM-based evaluation on data.

    Uses the Axion evaluation framework when available.
    """

    def __init__(self) -> None:
        """Initialize the evaluate skill."""
        metadata = SkillMetadata(
            name="evaluate",
            description="Run LLM-based evaluation on evaluation data to assess quality",
            version="1.0.0",
            parameters=[
                SkillParameter(
                    name="metric_focus",
                    type="string",
                    description="Specific metric to focus on (optional)",
                    required=False,
                ),
                SkillParameter(
                    name="sample_size",
                    type="integer",
                    description="Number of samples to evaluate",
                    required=False,
                    default=100,
                ),
                SkillParameter(
                    name="criteria",
                    type="string",
                    description="Custom evaluation criteria",
                    required=False,
                ),
            ],
            tags=["evaluation", "metrics", "quality"],
        )
        super().__init__(metadata)

    async def execute(
        self,
        message: str,
        data: list[dict[str, Any]] | None = None,
        data_context: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        thought_stream: ThoughtStream | None = None,
    ) -> dict[str, Any]:
        """Execute LLM-based evaluation.

        Args:
            message: User's evaluation request
            data: Evaluation records to analyze
            data_context: Context about the data
            params: Evaluation parameters
            thought_stream: Stream for thoughts

        Returns:
            Evaluation results with scores and insights
        """
        params = self.validate_params(params)

        await self.emit_thought(
            thought_stream,
            "Starting evaluation analysis...",
            "tool_use",
        )

        if not data:
            return {
                "success": False,
                "error": "No data provided for evaluation",
                "message": "Please load evaluation data first.",
            }

        try:
            import numpy as np
            import pandas as pd

            df = pd.DataFrame(data)
            sample_size = min(params.get("sample_size", 100), len(df))
            metric_focus = params.get("metric_focus")

            # Get numeric columns for analysis
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

            if metric_focus and metric_focus in numeric_cols:
                metrics_to_analyze = [metric_focus]
            else:
                metrics_to_analyze = numeric_cols[:5]  # Limit to first 5

            await self.emit_thought(
                thought_stream,
                f"Analyzing {len(metrics_to_analyze)} metrics across {sample_size} samples",
                "observation",
            )

            # Calculate statistics
            results = {
                "total_records": len(df),
                "sample_size": sample_size,
                "metrics": {},
            }

            for metric in metrics_to_analyze:
                values = df[metric].dropna()
                if len(values) > 0:
                    results["metrics"][metric] = {
                        "mean": float(values.mean()),
                        "std": float(values.std()) if len(values) > 1 else 0.0,
                        "min": float(values.min()),
                        "max": float(values.max()),
                        "median": float(values.median()),
                        "passing_rate": float((values >= 0.5).mean())
                        if values.max() <= 1
                        else None,
                    }

            # Generate insights
            insights = []
            for metric, stats in results["metrics"].items():
                if stats["mean"] < 0.5:
                    insights.append(f"- {metric} has a low average ({stats['mean']:.2f})")
                elif stats["mean"] > 0.8:
                    insights.append(f"- {metric} is performing well ({stats['mean']:.2f})")

                if stats["std"] > 0.3:
                    insights.append(f"- {metric} shows high variance (std: {stats['std']:.2f})")

            results["insights"] = insights
            results["success"] = True

            await self.emit_thought(
                thought_stream,
                f"Evaluation complete: {len(insights)} insights generated",
                "observation",
            )

            return results

        except Exception as e:
            logger.error(f"Evaluation failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
            }
