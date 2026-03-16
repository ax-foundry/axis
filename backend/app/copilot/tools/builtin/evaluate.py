import logging
from typing import Any

from app.copilot.thoughts import ThoughtStream
from app.copilot.tools.base import BaseTool, ToolMetadata, ToolParameter

logger = logging.getLogger("axis.copilot.tools.evaluate")


class EvaluateTool(BaseTool):
    """Tool for running LLM-based evaluation on data."""

    def __init__(self) -> None:
        """Initialize the evaluate tool."""
        metadata = ToolMetadata(
            name="evaluate",
            description="Run LLM-based evaluation on evaluation data to assess quality",
            version="1.0.0",
            parameters=[
                ToolParameter(
                    name="metric_focus",
                    type="string",
                    description="Specific metric to focus on (optional)",
                    required=False,
                ),
                ToolParameter(
                    name="sample_size",
                    type="integer",
                    description="Number of samples to evaluate",
                    required=False,
                    default=100,
                ),
                ToolParameter(
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
        """Execute LLM-based evaluation."""
        params = self.validate_params(params)
        await self.emit_thought(thought_stream, "Starting evaluation analysis...", "tool_use")

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
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

            if metric_focus and metric_focus in numeric_cols:
                metrics_to_analyze = [metric_focus]
            else:
                metrics_to_analyze = numeric_cols[:5]

            await self.emit_thought(
                thought_stream,
                f"Analyzing {len(metrics_to_analyze)} metrics across {sample_size} samples",
                "observation",
            )

            results = {"total_records": len(df), "sample_size": sample_size, "metrics": {}}
            for metric in metrics_to_analyze:
                values = df[metric].dropna()
                if len(values) > 0:
                    results["metrics"][metric] = {
                        "mean": float(values.mean()),
                        "std": float(values.std()) if len(values) > 1 else 0.0,
                        "min": float(values.min()),
                        "max": float(values.max()),
                        "median": float(values.median()),
                        "passing_rate": float((values >= 0.5).mean()) if values.max() <= 1 else None,
                    }

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
            return {"success": False, "error": str(e)}
