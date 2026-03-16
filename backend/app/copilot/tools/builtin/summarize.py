import logging
from typing import Any

from app.copilot.thoughts import ThoughtStream
from app.copilot.tools.base import BaseTool, ToolMetadata, ToolParameter

logger = logging.getLogger("axis.copilot.tools.summarize")


class SummarizeTool(BaseTool):
    """Tool for generating comprehensive summaries of evaluation data."""

    def __init__(self) -> None:
        """Initialize the summarize tool."""
        metadata = ToolMetadata(
            name="summarize",
            description="Generate a comprehensive summary and insights from evaluation data",
            version="1.0.0",
            parameters=[
                ToolParameter(
                    name="focus",
                    type="string",
                    description="Area to focus on: 'performance', 'quality', 'issues', 'all'",
                    required=False,
                    default="all",
                ),
                ToolParameter(
                    name="detail_level",
                    type="string",
                    description="Level of detail: 'brief', 'standard', 'detailed'",
                    required=False,
                    default="standard",
                ),
                ToolParameter(
                    name="include_recommendations",
                    type="boolean",
                    description="Whether to include recommendations",
                    required=False,
                    default=True,
                ),
            ],
            tags=["summary", "insights", "reporting"],
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
        """Generate a summary of the evaluation data."""
        params = self.validate_params(params)
        await self.emit_thought(thought_stream, "Generating data summary...", "tool_use")

        if not data:
            return {
                "success": False,
                "error": "No data provided for summarization",
                "message": "Please load evaluation data first.",
            }

        try:
            import numpy as np
            import pandas as pd

            df = pd.DataFrame(data)
            focus = params.get("focus", "all")
            _detail_level = params.get("detail_level", "standard")
            include_recommendations = params.get("include_recommendations", True)
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

            await self.emit_thought(
                thought_stream,
                f"Analyzing {len(df)} records with {len(numeric_cols)} metrics",
                "observation",
            )

            result = {
                "success": True,
                "overview": {
                    "total_records": len(df),
                    "total_metrics": len(numeric_cols),
                    "data_format": data_context.get("format", "unknown") if data_context else "unknown",
                },
            }

            if focus in ["performance", "all"]:
                performance = {}
                high_performers = []
                low_performers = []
                for metric in numeric_cols[:10]:
                    values = df[metric].dropna()
                    if len(values) > 0:
                        mean = float(values.mean())
                        performance[metric] = {
                            "average": mean,
                            "passing_rate": float((values >= 0.5).mean())
                            if values.max() <= 1
                            else None,
                        }
                        if mean >= 0.8:
                            high_performers.append(metric)
                        elif mean < 0.5:
                            low_performers.append(metric)

                result["performance"] = {
                    "metrics": performance,
                    "high_performers": high_performers,
                    "low_performers": low_performers,
                }

            if focus in ["quality", "issues", "all"]:
                await self.emit_thought(thought_stream, "Identifying quality issues...", "observation")
                issues = []
                missing = df.isnull().sum()
                high_missing = missing[missing > len(df) * 0.1]
                if len(high_missing) > 0:
                    issues.append(
                        {
                            "type": "missing_data",
                            "description": f"{len(high_missing)} columns have >10% missing values",
                            "columns": high_missing.index.tolist()[:5],
                        }
                    )

                for metric in numeric_cols[:10]:
                    values = df[metric].dropna()
                    if len(values) > 1:
                        variance = values.var()
                        if variance < 0.01 and values.max() <= 1:
                            issues.append(
                                {
                                    "type": "low_variance",
                                    "description": f"{metric} has very low variance ({variance:.4f})",
                                    "metric": metric,
                                }
                            )

                for metric in numeric_cols[:10]:
                    values = df[metric].dropna()
                    if len(values) > 0 and values.nunique() == 1:
                        issues.append(
                            {
                                "type": "constant_value",
                                "description": f"{metric} has only one unique value",
                                "metric": metric,
                            }
                        )

                result["quality_issues"] = issues

            insights = []
            if "performance" in result:
                perf = result["performance"]
                if perf["high_performers"]:
                    insights.append(f"Top performing metrics: {', '.join(perf['high_performers'][:3])}")
                if perf["low_performers"]:
                    insights.append(
                        f"Metrics needing attention: {', '.join(perf['low_performers'][:3])}"
                    )
            if result.get("quality_issues"):
                insights.append(f"Found {len(result['quality_issues'])} potential data quality issues")
            result["key_insights"] = insights

            if include_recommendations:
                recommendations = []
                if "performance" in result:
                    if result["performance"]["low_performers"]:
                        recommendations.append(
                            "Review and improve prompts/models for low-performing metrics"
                        )
                    if not result["performance"]["high_performers"]:
                        recommendations.append(
                            "Consider adjusting evaluation criteria or model configuration"
                        )

                if "quality_issues" in result:
                    for issue in result["quality_issues"][:3]:
                        if issue["type"] == "missing_data":
                            recommendations.append(
                                "Address missing data in key columns before analysis"
                            )
                        elif issue["type"] == "low_variance":
                            recommendations.append(
                                f"Review {issue['metric']} - low variance may indicate issues"
                            )
                if not recommendations:
                    recommendations.append(
                        "Data looks healthy - continue monitoring performance trends"
                    )
                result["recommendations"] = recommendations

            await self.emit_thought(
                thought_stream,
                f"Summary complete: {len(insights)} insights, {len(result.get('recommendations', []))} recommendations",
                "observation",
            )
            return result
        except Exception as e:
            logger.error(f"Summarization failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
