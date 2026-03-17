import logging
from typing import Any

from app.copilot.thoughts import ThoughtStream
from app.copilot.tools.base import BaseTool, ToolMetadata, ToolParameter

logger = logging.getLogger("axis.copilot.tools.query")


class QueryTool(BaseTool):
    """Tool for answering specific questions about evaluation data."""

    def __init__(self) -> None:
        """Initialize the query tool."""
        metadata = ToolMetadata(
            name="query",
            description="Answer specific questions about the data: find records, lookup values, filter by conditions, find min/max metrics",
            version="1.0.0",
            parameters=[
                ToolParameter(
                    name="query_type",
                    type="string",
                    description="Type of query: 'lookup', 'filter', 'aggregate', 'find_extremes'",
                    required=False,
                    default="lookup",
                ),
                ToolParameter(
                    name="filter_field",
                    type="string",
                    description="Field to filter by",
                    required=False,
                ),
                ToolParameter(
                    name="filter_value",
                    type="string",
                    description="Value to filter for",
                    required=False,
                ),
            ],
            tags=["query", "lookup", "search", "filter"],
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
        """Execute a data query based on the user's question."""
        params = self.validate_params(params)
        await self.emit_thought(thought_stream, f"Querying data: {message[:100]}...", "tool_use")

        if not data:
            return {
                "success": False,
                "error": "No data provided for query",
                "message": "Please load evaluation data first.",
            }

        try:
            import re

            import numpy as np
            import pandas as pd

            df = pd.DataFrame(data)
            result = {"success": True, "total_records": len(df), "query": message}

            id_patterns = [
                r"[a-zA-Z0-9]{15,18}",
                r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}",
                r"test[-_]?\d+",
                r"record[-_]?\d+",
            ]
            found_ids = []
            for pattern in id_patterns:
                found_ids.extend(re.findall(pattern, message, re.IGNORECASE))

            await self.emit_thought(
                thought_stream, f"Found {len(found_ids)} potential IDs in query", "observation"
            )

            id_columns = [
                col
                for col in df.columns
                if "id" in col.lower()
                or col.lower() in ["id", "test_id", "record_id", "evaluation_id"]
            ]

            matching_records = []
            if found_ids and id_columns:
                for id_col in id_columns:
                    for search_id in found_ids:
                        matches = df[
                            df[id_col].astype(str).str.contains(search_id, case=False, na=False)
                        ]
                        if len(matches) > 0:
                            matching_records.extend(matches.to_dict("records"))

                if matching_records:
                    seen = set()
                    unique_records = []
                    for record in matching_records:
                        record_str = str(sorted(record.items()))
                        if record_str not in seen:
                            seen.add(record_str)
                            unique_records.append(record)

                    result["matching_records"] = unique_records[:20]
                    result["match_count"] = len(unique_records)
                    await self.emit_thought(
                        thought_stream,
                        f"Found {len(unique_records)} matching records",
                        "observation",
                    )

            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            message_lower = message.lower()

            if any(
                word in message_lower for word in ["lowest", "minimum", "min", "worst", "smallest"]
            ):
                await self.emit_thought(
                    thought_stream, "Looking for minimum values...", "observation"
                )
                analysis_df = pd.DataFrame(matching_records) if matching_records else df
                numeric_analysis_cols = analysis_df.select_dtypes(
                    include=[np.number]
                ).columns.tolist()
                min_values = {}
                for col in numeric_analysis_cols[:10]:
                    values = analysis_df[col].dropna()
                    if len(values) > 0:
                        min_values[col] = {
                            "value": float(values.min()),
                            "mean": float(values.mean()),
                        }
                if min_values:
                    lowest_metric = min(min_values.items(), key=lambda x: x[1]["mean"])
                    result["lowest_metric"] = {
                        "name": lowest_metric[0],
                        "min_value": lowest_metric[1]["value"],
                        "mean_value": lowest_metric[1]["mean"],
                    }
                    result["all_metrics_min"] = min_values

            elif any(
                word in message_lower for word in ["highest", "maximum", "max", "best", "largest"]
            ):
                await self.emit_thought(
                    thought_stream, "Looking for maximum values...", "observation"
                )
                analysis_df = pd.DataFrame(matching_records) if matching_records else df
                numeric_analysis_cols = analysis_df.select_dtypes(
                    include=[np.number]
                ).columns.tolist()
                max_values = {}
                for col in numeric_analysis_cols[:10]:
                    values = analysis_df[col].dropna()
                    if len(values) > 0:
                        max_values[col] = {
                            "value": float(values.max()),
                            "mean": float(values.mean()),
                        }
                if max_values:
                    highest_metric = max(max_values.items(), key=lambda x: x[1]["mean"])
                    result["highest_metric"] = {
                        "name": highest_metric[0],
                        "max_value": highest_metric[1]["value"],
                        "mean_value": highest_metric[1]["mean"],
                    }
                    result["all_metrics_max"] = max_values

            if any(word in message_lower for word in ["how many", "count", "number of"]):
                await self.emit_thought(thought_stream, "Counting records...", "observation")
                threshold_match = re.search(
                    r"(below|under|less than|above|over|greater than|more than)\s*(\d+\.?\d*)",
                    message_lower,
                )
                if threshold_match:
                    direction = threshold_match.group(1)
                    threshold = float(threshold_match.group(2))
                    counts = {}
                    analysis_df = pd.DataFrame(matching_records) if matching_records else df
                    for col in analysis_df.select_dtypes(include=[np.number]).columns[:10]:
                        values = analysis_df[col].dropna()
                        if direction in ["below", "under", "less than"]:
                            count = int((values < threshold).sum())
                        else:
                            count = int((values > threshold).sum())
                        counts[col] = count
                    result["threshold_counts"] = {
                        "condition": f"{direction} {threshold}",
                        "counts_by_metric": counts,
                    }

            result["data_sample"] = (
                matching_records[:10] if matching_records else df.head(10).to_dict("records")
            )
            result["available_columns"] = list(df.columns)
            result["numeric_columns"] = numeric_cols
            await self.emit_thought(thought_stream, "Query complete", "observation")
            return result
        except Exception as e:
            logger.error(f"Query failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
