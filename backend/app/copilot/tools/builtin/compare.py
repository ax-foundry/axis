import logging
from typing import Any

from app.copilot.thoughts import ThoughtStream
from app.copilot.tools.base import BaseTool, ToolMetadata, ToolParameter

logger = logging.getLogger("axis.copilot.tools.compare")


class CompareTool(BaseTool):
    """Tool for comparing experiments and metrics across different conditions."""

    def __init__(self) -> None:
        """Initialize the compare tool."""
        metadata = ToolMetadata(
            name="compare",
            description="Compare evaluation results across experiments or models",
            version="1.0.0",
            parameters=[
                ToolParameter(
                    name="group_by",
                    type="string",
                    description="Column to group by for comparison",
                    required=False,
                    default="evaluation_name",
                ),
                ToolParameter(
                    name="metrics",
                    type="array",
                    description="Specific metrics to compare",
                    required=False,
                ),
                ToolParameter(
                    name="comparison_type",
                    type="string",
                    description="Type of comparison: 'aggregate' or 'per_case'",
                    required=False,
                    default="aggregate",
                ),
            ],
            tags=["comparison", "experiments", "analysis"],
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
        """Execute comparison analysis."""
        params = self.validate_params(params)
        await self.emit_thought(thought_stream, "Starting comparison analysis...", "tool_use")

        if not data:
            return {
                "success": False,
                "error": "No data provided for comparison",
                "message": "Please load evaluation data first.",
            }

        try:
            import numpy as np
            import pandas as pd

            df = pd.DataFrame(data)
            group_by = params.get("group_by", "evaluation_name")
            if group_by not in df.columns:
                possible_groups = ["evaluation_name", "experiment_name", "model", "source"]
                for col in possible_groups:
                    if col in df.columns:
                        group_by = col
                        break
                else:
                    return {
                        "success": False,
                        "error": f"Grouping column '{group_by}' not found in data",
                        "available_columns": list(df.columns),
                    }

            await self.emit_thought(thought_stream, f"Grouping data by '{group_by}'", "observation")

            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            metrics_to_compare = params.get("metrics") or numeric_cols[:5]
            metrics_to_compare = [m for m in metrics_to_compare if m in numeric_cols]

            groups = df[group_by].unique().tolist()
            comparison_results = {}
            for group in groups:
                group_data = df[df[group_by] == group]
                comparison_results[str(group)] = {"count": len(group_data), "metrics": {}}
                for metric in metrics_to_compare:
                    values = group_data[metric].dropna()
                    if len(values) > 0:
                        comparison_results[str(group)]["metrics"][metric] = {
                            "mean": float(values.mean()),
                            "std": float(values.std()) if len(values) > 1 else 0.0,
                            "min": float(values.min()),
                            "max": float(values.max()),
                        }

            insights = []
            if len(groups) >= 2 and metrics_to_compare:
                for metric in metrics_to_compare:
                    best_group = None
                    best_mean = -float("inf")
                    for group, tool_data in comparison_results.items():
                        if metric in tool_data["metrics"]:
                            mean = tool_data["metrics"][metric]["mean"]
                            if mean > best_mean:
                                best_mean = mean
                                best_group = group
                    if best_group:
                        insights.append(f"- {best_group} has the best {metric} ({best_mean:.3f})")

            result = {
                "success": True,
                "group_by": group_by,
                "groups": groups,
                "metrics": metrics_to_compare,
                "comparison": comparison_results,
                "insights": insights,
            }

            await self.emit_thought(
                thought_stream,
                f"Comparison complete: {len(groups)} groups compared across {len(metrics_to_compare)} metrics",
                "observation",
            )
            return result
        except Exception as e:
            logger.error(f"Comparison failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
