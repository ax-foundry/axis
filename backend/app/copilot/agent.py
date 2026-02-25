import json
import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from pydantic_ai import Agent, RunContext

from app.copilot.llm.provider import LLMProvider
from app.copilot.thoughts import ThoughtStream


def safe_json_dumps(obj: Any) -> str:
    """JSON dumps that handles non-serializable types like lists in DataFrames."""

    def default_handler(o):
        if isinstance(o, np.integer | np.floating):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        if pd.isna(o):
            return None
        return str(o)

    return json.dumps(obj, default=default_handler)


logger = logging.getLogger("axis.copilot.agent")


@dataclass
class CopilotDeps:
    """Dependencies passed to all tools."""

    thought_stream: ThoughtStream
    data: list[dict[str, Any]] | None = None
    data_context: dict[str, Any] = field(default_factory=dict)

    @property
    def has_data(self) -> bool:
        """Check if data is loaded."""
        return self.data is not None and len(self.data) > 0

    @property
    def dataframe(self) -> pd.DataFrame | None:
        """Return data as a DataFrame, or None if empty."""
        if not self.has_data:
            return None
        return pd.DataFrame(self.data)


class CopilotAgent:
    """AI Copilot using pydantic-ai tools for data analysis.

    Tools are called directly by the LLM through native function calling,
    making the system simpler and more reliable than graph-based routing.
    """

    def __init__(
        self,
        thought_stream: ThoughtStream | None = None,
        llm_provider: LLMProvider | None = None,
    ) -> None:
        """Initialize the copilot agent with optional thought stream and LLM provider."""
        self.thought_stream = thought_stream or ThoughtStream()
        self.llm_provider = llm_provider or LLMProvider()
        self._agent: Agent[CopilotDeps, str] | None = None

    def _get_agent(self) -> Agent[CopilotDeps, str]:
        """Create or return the pydantic-ai agent with tools."""
        if self._agent is not None:
            return self._agent

        model = self.llm_provider._get_model()

        self._agent = Agent(
            model,
            deps_type=CopilotDeps,
            system_prompt="""You are an AI assistant helping users analyze evaluation data.

You have access to tools for querying and analyzing the data. Use them to answer questions.

IMPORTANT:
- When asked about specific data (metrics, scores, IDs), ALWAYS use the appropriate tool
- Use query_data for lookups: finding records by ID, min/max values, filtering
- Use analyze_data for statistics: distributions, correlations, patterns
- Use summarize_data for overviews: key insights, recommendations
- Use compare_data for comparisons: across experiments, metrics, groups

Provide concrete answers based on the tool results. Don't give generic instructions.
If no data is loaded, let the user know they need to upload data first.""",
        )

        # Register all tools
        self._register_tools()

        return self._agent

    def _register_tools(self) -> None:
        """Register all copilot tools."""
        agent = self._agent

        @agent.tool
        async def query_data(
            ctx: RunContext[CopilotDeps],
            search_id: str | None = None,
            find_min_metric: bool = False,
            find_max_metric: bool = False,
            filter_field: str | None = None,
            filter_value: str | None = None,
            count_below: float | None = None,
            count_above: float | None = None,
        ) -> str:
            """Query the evaluation data for specific records or values.

            Args:
                ctx: The run context with dependencies.
                search_id: ID to search for in the data (partial match supported)
                find_min_metric: Find the metric with the lowest average value
                find_max_metric: Find the metric with the highest average value
                filter_field: Field name to filter by
                filter_value: Value to filter for
                count_below: Count records with metric values below this threshold
                count_above: Count records with metric values above this threshold

            Returns:
                JSON string with query results
            """
            deps = ctx.deps

            await deps.thought_stream.emit_tool_use(
                f"Querying data: id={search_id}, min={find_min_metric}, max={find_max_metric}",
                skill_name="query_data",
            )

            if not deps.has_data:
                return json.dumps({"error": "No data loaded. Please upload evaluation data first."})

            df = deps.dataframe
            result = {"total_records": len(df)}

            # Search by ID
            if search_id:
                id_cols = [c for c in df.columns if "id" in c.lower()]
                matches = pd.DataFrame()
                seen_indices = set()
                for col in id_cols:
                    col_matches = df[
                        df[col].astype(str).str.contains(search_id, case=False, na=False)
                    ]
                    # Track by index instead of using drop_duplicates (which fails on list columns)
                    new_indices = set(col_matches.index) - seen_indices
                    if new_indices:
                        matches = pd.concat([matches, col_matches.loc[list(new_indices)]])
                        seen_indices.update(new_indices)

                if len(matches) > 0:
                    result["matching_records"] = matches.head(20).to_dict("records")
                    result["match_count"] = len(matches)
                else:
                    result["matching_records"] = []
                    result["match_count"] = 0

            # Find min/max metrics
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

            if find_min_metric and numeric_cols:
                # If we have matching records, use those
                analysis_df = (
                    pd.DataFrame(result.get("matching_records", []))
                    if "matching_records" in result
                    else df
                )
                if len(analysis_df) > 0:
                    analysis_numeric = analysis_df.select_dtypes(
                        include=[np.number]
                    ).columns.tolist()
                    if analysis_numeric:
                        means = {
                            col: float(analysis_df[col].mean())
                            for col in analysis_numeric
                            if not analysis_df[col].isna().all()
                        }
                        if means:
                            min_metric = min(means.items(), key=lambda x: x[1])
                            result["lowest_metric"] = {
                                "name": min_metric[0],
                                "mean_value": min_metric[1],
                            }
                            result["all_metric_means"] = means

            if find_max_metric and numeric_cols:
                analysis_df = (
                    pd.DataFrame(result.get("matching_records", []))
                    if "matching_records" in result
                    else df
                )
                if len(analysis_df) > 0:
                    analysis_numeric = analysis_df.select_dtypes(
                        include=[np.number]
                    ).columns.tolist()
                    if analysis_numeric:
                        means = {
                            col: float(analysis_df[col].mean())
                            for col in analysis_numeric
                            if not analysis_df[col].isna().all()
                        }
                        if means:
                            max_metric = max(means.items(), key=lambda x: x[1])
                            result["highest_metric"] = {
                                "name": max_metric[0],
                                "mean_value": max_metric[1],
                            }
                            if "all_metric_means" not in result:
                                result["all_metric_means"] = means

            # Filter by field/value
            if filter_field and filter_value and filter_field in df.columns:
                filtered = df[
                    df[filter_field].astype(str).str.contains(filter_value, case=False, na=False)
                ]
                result["filtered_records"] = filtered.head(20).to_dict("records")
                result["filtered_count"] = len(filtered)

            # Count above/below thresholds
            if count_below is not None or count_above is not None:
                counts = {}
                for col in numeric_cols[:10]:
                    values = df[col].dropna()
                    if count_below is not None:
                        counts[f"{col}_below_{count_below}"] = int((values < count_below).sum())
                    if count_above is not None:
                        counts[f"{col}_above_{count_above}"] = int((values > count_above).sum())
                result["threshold_counts"] = counts

            await deps.thought_stream.emit_observation(
                f"Query complete: {len(result.get('matching_records', []))} matches found",
                skill_name="query_data",
            )

            return safe_json_dumps(result)

        @agent.tool
        async def analyze_data(
            ctx: RunContext[CopilotDeps],
            metrics: list[str] | None = None,
            include_distributions: bool = True,
            include_correlations: bool = True,
            include_outliers: bool = True,
        ) -> str:
            """Perform statistical analysis on the evaluation data.

            Args:
                ctx: The run context with dependencies.
                metrics: Specific metrics to analyze (analyzes all if not specified)
                include_distributions: Include distribution statistics (mean, std, quartiles)
                include_correlations: Include correlation analysis between metrics
                include_outliers: Include outlier detection

            Returns:
                JSON string with analysis results
            """
            deps = ctx.deps

            await deps.thought_stream.emit_tool_use(
                "Performing statistical analysis...",
                skill_name="analyze_data",
            )

            if not deps.has_data:
                return json.dumps({"error": "No data loaded. Please upload evaluation data first."})

            df = deps.dataframe
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

            # Filter to requested metrics
            if metrics:
                numeric_cols = [c for c in metrics if c in numeric_cols]
            numeric_cols = numeric_cols[:10]  # Limit for performance

            result = {
                "total_records": len(df),
                "metrics_analyzed": numeric_cols,
            }

            if include_distributions:
                await deps.thought_stream.emit_observation(
                    "Computing distribution statistics...",
                    skill_name="analyze_data",
                )

                distributions = {}
                for col in numeric_cols:
                    values = df[col].dropna()
                    if len(values) > 0:
                        distributions[col] = {
                            "count": len(values),
                            "mean": float(values.mean()),
                            "std": float(values.std()) if len(values) > 1 else 0.0,
                            "min": float(values.min()),
                            "max": float(values.max()),
                            "median": float(values.median()),
                            "q25": float(values.quantile(0.25)),
                            "q75": float(values.quantile(0.75)),
                        }
                result["distributions"] = distributions

            if include_correlations and len(numeric_cols) > 1:
                await deps.thought_stream.emit_observation(
                    "Computing correlations...",
                    skill_name="analyze_data",
                )

                corr_df = df[numeric_cols].dropna()
                if len(corr_df) > 2:
                    corr_matrix = corr_df.corr()
                    strong = []
                    for i, c1 in enumerate(numeric_cols):
                        for j, c2 in enumerate(numeric_cols):
                            if i < j:
                                val = corr_matrix.loc[c1, c2]
                                if not pd.isna(val) and abs(val) > 0.7:
                                    strong.append(
                                        {
                                            "metrics": [c1, c2],
                                            "correlation": float(val),
                                            "strength": "strong positive"
                                            if val > 0
                                            else "strong negative",
                                        }
                                    )
                    result["strong_correlations"] = strong

            if include_outliers:
                await deps.thought_stream.emit_observation(
                    "Detecting outliers...",
                    skill_name="analyze_data",
                )

                outliers = {}
                for col in numeric_cols:
                    values = df[col].dropna()
                    if len(values) > 4:
                        q1, q3 = values.quantile(0.25), values.quantile(0.75)
                        iqr = q3 - q1
                        outlier_mask = (values < q1 - 1.5 * iqr) | (values > q3 + 1.5 * iqr)
                        count = int(outlier_mask.sum())
                        if count > 0:
                            outliers[col] = {
                                "count": count,
                                "percentage": float(count / len(values) * 100),
                            }
                result["outliers"] = outliers

            # Generate insights
            insights = []
            if "distributions" in result:
                for metric, dist in result["distributions"].items():
                    if dist["mean"] < 0.5 and dist["max"] <= 1.0:
                        insights.append(f"{metric} has low average ({dist['mean']:.2f})")
            if result.get("strong_correlations"):
                for c in result["strong_correlations"]:
                    insights.append(
                        f"{c['metrics'][0]} and {c['metrics'][1]} are {c['strength']}ly correlated"
                    )
            result["insights"] = insights

            await deps.thought_stream.emit_observation(
                f"Analysis complete: {len(insights)} insights",
                skill_name="analyze_data",
            )

            return safe_json_dumps(result)

        @agent.tool
        async def summarize_data(
            ctx: RunContext[CopilotDeps],
            focus: str = "all",
            include_recommendations: bool = True,
        ) -> str:
            """Generate a summary of the evaluation data with key insights.

            Args:
                ctx: The run context with dependencies.
                focus: Area to focus on: 'performance', 'quality', 'issues', or 'all'
                include_recommendations: Whether to include actionable recommendations

            Returns:
                JSON string with summary and insights
            """
            deps = ctx.deps

            await deps.thought_stream.emit_tool_use(
                f"Generating summary (focus: {focus})...",
                skill_name="summarize_data",
            )

            if not deps.has_data:
                return json.dumps({"error": "No data loaded. Please upload evaluation data first."})

            df = deps.dataframe
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()[:10]

            result = {
                "overview": {
                    "total_records": len(df),
                    "total_columns": len(df.columns),
                    "numeric_metrics": len(numeric_cols),
                    "data_format": deps.data_context.get("format", "unknown"),
                }
            }

            if focus in ["performance", "all"]:
                await deps.thought_stream.emit_observation(
                    "Analyzing performance...",
                    skill_name="summarize_data",
                )

                high_performers, low_performers = [], []
                for col in numeric_cols:
                    mean = df[col].mean()
                    if mean >= 0.8:
                        high_performers.append(col)
                    elif mean < 0.5:
                        low_performers.append(col)

                result["performance"] = {
                    "high_performers": high_performers,
                    "low_performers": low_performers,
                }

            if focus in ["quality", "issues", "all"]:
                issues = []
                missing = df.isnull().sum()
                high_missing = missing[missing > len(df) * 0.1]
                if len(high_missing) > 0:
                    issues.append(f"{len(high_missing)} columns have >10% missing values")

                for col in numeric_cols:
                    if df[col].nunique() == 1:
                        issues.append(f"{col} has only one unique value")

                result["quality_issues"] = issues

            # Key insights
            insights = []
            if result.get("performance", {}).get("high_performers"):
                insights.append(
                    f"Top metrics: {', '.join(result['performance']['high_performers'][:3])}"
                )
            if result.get("performance", {}).get("low_performers"):
                insights.append(
                    f"Needs attention: {', '.join(result['performance']['low_performers'][:3])}"
                )
            if result.get("quality_issues"):
                insights.append(f"{len(result['quality_issues'])} quality issues found")

            result["key_insights"] = insights

            if include_recommendations:
                recs = []
                if result.get("performance", {}).get("low_performers"):
                    recs.append("Review prompts/models for low-performing metrics")
                if result.get("quality_issues"):
                    recs.append("Address data quality issues before analysis")
                if not recs:
                    recs.append("Data looks healthy - continue monitoring")
                result["recommendations"] = recs

            await deps.thought_stream.emit_observation(
                f"Summary complete: {len(insights)} insights",
                skill_name="summarize_data",
            )

            return safe_json_dumps(result)

        @agent.tool
        async def compare_data(
            ctx: RunContext[CopilotDeps],
            group_by: str,
            metrics: list[str] | None = None,
        ) -> str:
            """Compare metrics across different groups in the data.

            Args:
                ctx: The run context with dependencies.
                group_by: Column name to group by (e.g., 'experiment_name', 'model')
                metrics: Specific metrics to compare (compares all numeric if not specified)

            Returns:
                JSON string with comparison results
            """
            deps = ctx.deps

            await deps.thought_stream.emit_tool_use(
                f"Comparing data by {group_by}...",
                skill_name="compare_data",
            )

            if not deps.has_data:
                return json.dumps({"error": "No data loaded. Please upload evaluation data first."})

            df = deps.dataframe

            if group_by not in df.columns:
                # Try to find similar column
                similar = [c for c in df.columns if group_by.lower() in c.lower()]
                if similar:
                    group_by = similar[0]
                else:
                    return json.dumps(
                        {
                            "error": f"Column '{group_by}' not found",
                            "available_columns": list(df.columns),
                        }
                    )

            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if metrics:
                numeric_cols = [c for c in metrics if c in numeric_cols]
            numeric_cols = numeric_cols[:10]

            groups = df[group_by].unique().tolist()[:20]  # Limit groups

            comparison = {}
            for group in groups:
                group_df = df[df[group_by] == group]
                comparison[str(group)] = {"count": len(group_df), "metrics": {}}
                for col in numeric_cols:
                    values = group_df[col].dropna()
                    if len(values) > 0:
                        comparison[str(group)]["metrics"][col] = {
                            "mean": float(values.mean()),
                            "std": float(values.std()) if len(values) > 1 else 0.0,
                        }

            # Find best/worst performers
            rankings = {}
            for col in numeric_cols:
                group_means = [
                    (g, comparison[g]["metrics"].get(col, {}).get("mean", 0))
                    for g in comparison
                    if col in comparison[g]["metrics"]
                ]
                if group_means:
                    group_means.sort(key=lambda x: x[1], reverse=True)
                    rankings[col] = {
                        "best": group_means[0][0] if group_means else None,
                        "worst": group_means[-1][0] if group_means else None,
                    }

            result = {
                "group_by": group_by,
                "groups": groups,
                "comparison": comparison,
                "rankings": rankings,
            }

            await deps.thought_stream.emit_observation(
                f"Compared {len(groups)} groups across {len(numeric_cols)} metrics",
                skill_name="compare_data",
            )

            return safe_json_dumps(result)

    async def process(
        self,
        message: str,
        data_context: dict[str, Any] | None = None,
        data: list[dict[str, Any]] | None = None,
    ) -> str:
        """Process a user message using the tool-based agent.

        Args:
            message: User's message/query
            data_context: Context about the loaded data
            data: Actual data rows for analysis

        Returns:
            Agent's response
        """
        logger.info(f"Processing message: {message[:100]}...")
        logger.info(f"Data rows: {len(data) if data else 0}")

        deps = CopilotDeps(
            thought_stream=self.thought_stream,
            data=data,
            data_context=data_context or {},
        )

        await self.thought_stream.emit_reasoning(
            f"Processing: {message[:100]}...",
            node_name="Agent",
        )

        try:
            agent = self._get_agent()
            result = await agent.run(message, deps=deps)

            await self.thought_stream.emit_success(
                "Request completed",
                node_name="Agent",
            )

            return result.output

        except Exception as e:
            logger.error(f"Agent error: {e}", exc_info=True)
            await self.thought_stream.emit_error(
                f"Error: {e}",
                node_name="Agent",
            )
            return f"I encountered an error: {e}"

        finally:
            await self.thought_stream.close()

    @property
    def is_configured(self) -> bool:
        """Check if the agent has a working LLM provider."""
        return LLMProvider.get_default_provider() is not None

    def get_available_tools(self) -> list[dict[str, Any]]:
        """Get information about available tools."""
        return [
            {
                "name": "query_data",
                "description": "Query data for specific records, find min/max metrics, filter by conditions",
            },
            {
                "name": "analyze_data",
                "description": "Statistical analysis: distributions, correlations, outliers",
            },
            {
                "name": "summarize_data",
                "description": "Generate summaries with insights and recommendations",
            },
            {
                "name": "compare_data",
                "description": "Compare metrics across groups/experiments",
            },
        ]
