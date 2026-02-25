import logging
from typing import Any

from app.copilot.skills.base import BaseSkill, SkillMetadata, SkillParameter
from app.copilot.thoughts import ThoughtStream

logger = logging.getLogger("axis.copilot.skills.analyze")


class AnalyzeSkill(BaseSkill):
    """Skill for performing statistical analysis on evaluation data."""

    def __init__(self) -> None:
        """Initialize the analyze skill."""
        metadata = SkillMetadata(
            name="analyze",
            description="Perform statistical analysis on evaluation data including distributions, correlations, and patterns",
            version="1.0.0",
            parameters=[
                SkillParameter(
                    name="analysis_type",
                    type="string",
                    description="Type of analysis: 'distribution', 'correlation', 'pattern', 'all'",
                    required=False,
                    default="all",
                ),
                SkillParameter(
                    name="metrics",
                    type="array",
                    description="Specific metrics to analyze",
                    required=False,
                ),
                SkillParameter(
                    name="include_outliers",
                    type="boolean",
                    description="Whether to identify outliers",
                    required=False,
                    default=True,
                ),
            ],
            tags=["analysis", "statistics", "patterns"],
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
        """Execute statistical analysis.

        Args:
            message: User's analysis request
            data: Evaluation records to analyze
            data_context: Context about the data
            params: Analysis parameters
            thought_stream: Stream for thoughts

        Returns:
            Analysis results with statistics and insights
        """
        params = self.validate_params(params)

        await self.emit_thought(
            thought_stream,
            "Starting statistical analysis...",
            "tool_use",
        )

        if not data:
            return {
                "success": False,
                "error": "No data provided for analysis",
                "message": "Please load evaluation data first.",
            }

        try:
            import numpy as np
            import pandas as pd

            df = pd.DataFrame(data)
            analysis_type = params.get("analysis_type", "all")
            include_outliers = params.get("include_outliers", True)

            # Get numeric columns
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            metrics_to_analyze = params.get("metrics") or numeric_cols[:10]
            metrics_to_analyze = [m for m in metrics_to_analyze if m in numeric_cols]

            result = {
                "success": True,
                "total_records": len(df),
                "metrics_analyzed": metrics_to_analyze,
            }

            # Distribution analysis
            if analysis_type in ["distribution", "all"]:
                await self.emit_thought(
                    thought_stream,
                    "Computing distribution statistics...",
                    "observation",
                )

                distributions = {}
                for metric in metrics_to_analyze:
                    values = df[metric].dropna()
                    if len(values) > 0:
                        distributions[metric] = {
                            "count": len(values),
                            "mean": float(values.mean()),
                            "std": float(values.std()) if len(values) > 1 else 0.0,
                            "min": float(values.min()),
                            "max": float(values.max()),
                            "median": float(values.median()),
                            "q25": float(values.quantile(0.25)),
                            "q75": float(values.quantile(0.75)),
                            "skewness": float(values.skew()) if len(values) > 2 else 0.0,
                        }

                result["distributions"] = distributions

            # Correlation analysis
            if analysis_type in ["correlation", "all"] and len(metrics_to_analyze) > 1:
                await self.emit_thought(
                    thought_stream,
                    "Computing correlations...",
                    "observation",
                )

                corr_data = df[metrics_to_analyze].dropna()
                if len(corr_data) > 2:
                    corr_matrix = corr_data.corr()
                    correlations = {}

                    # Find strong correlations
                    strong_correlations = []
                    for i, m1 in enumerate(metrics_to_analyze):
                        for j, m2 in enumerate(metrics_to_analyze):
                            if i < j:  # Upper triangle only
                                corr_val = corr_matrix.loc[m1, m2]
                                if not pd.isna(corr_val):
                                    correlations[f"{m1}_vs_{m2}"] = float(corr_val)
                                    if abs(corr_val) > 0.7:
                                        strong_correlations.append(
                                            {
                                                "metrics": [m1, m2],
                                                "correlation": float(corr_val),
                                                "strength": "strong positive"
                                                if corr_val > 0
                                                else "strong negative",
                                            }
                                        )

                    result["correlations"] = correlations
                    result["strong_correlations"] = strong_correlations

            # Outlier detection
            if include_outliers and analysis_type in ["pattern", "all"]:
                await self.emit_thought(
                    thought_stream,
                    "Detecting outliers...",
                    "observation",
                )

                outliers = {}
                for metric in metrics_to_analyze:
                    values = df[metric].dropna()
                    if len(values) > 4:
                        q1 = values.quantile(0.25)
                        q3 = values.quantile(0.75)
                        iqr = q3 - q1
                        lower_bound = q1 - 1.5 * iqr
                        upper_bound = q3 + 1.5 * iqr

                        outlier_mask = (values < lower_bound) | (values > upper_bound)
                        outlier_count = int(outlier_mask.sum())

                        if outlier_count > 0:
                            outliers[metric] = {
                                "count": outlier_count,
                                "percentage": float(outlier_count / len(values) * 100),
                                "bounds": {
                                    "lower": float(lower_bound),
                                    "upper": float(upper_bound),
                                },
                            }

                result["outliers"] = outliers

            # Generate insights
            insights = []

            if "distributions" in result:
                for metric, dist in result["distributions"].items():
                    if dist["mean"] < 0.5 and dist["max"] <= 1.0:
                        insights.append(f"- {metric} has a low average score ({dist['mean']:.2f})")
                    if abs(dist.get("skewness", 0)) > 1:
                        direction = "right" if dist["skewness"] > 0 else "left"
                        insights.append(f"- {metric} is skewed to the {direction}")

            if "strong_correlations" in result:
                for corr in result["strong_correlations"]:
                    insights.append(
                        f"- {corr['metrics'][0]} and {corr['metrics'][1]} have {corr['strength']} correlation ({corr['correlation']:.2f})"
                    )

            if "outliers" in result:
                for metric, outlier_info in result["outliers"].items():
                    if outlier_info["percentage"] > 5:
                        insights.append(
                            f"- {metric} has {outlier_info['count']} outliers ({outlier_info['percentage']:.1f}%)"
                        )

            result["insights"] = insights

            await self.emit_thought(
                thought_stream,
                f"Analysis complete: {len(insights)} insights generated",
                "observation",
            )

            return result

        except Exception as e:
            logger.error(f"Analysis failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
            }
