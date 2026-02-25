import logging
from typing import Any

from app.copilot.skills.base import BaseSkill, SkillMetadata, SkillParameter
from app.copilot.thoughts import ThoughtStream

logger = logging.getLogger("axis.copilot.skills.query")


class QuerySkill(BaseSkill):
    """Skill for answering specific questions about evaluation data.

    Handles targeted queries like:
    - Finding records by ID
    - Finding min/max metrics
    - Filtering and counting records
    - Looking up specific values
    """

    def __init__(self) -> None:
        """Initialize the query skill."""
        metadata = SkillMetadata(
            name="query",
            description="Answer specific questions about the data: find records, lookup values, filter by conditions, find min/max metrics",
            version="1.0.0",
            parameters=[
                SkillParameter(
                    name="query_type",
                    type="string",
                    description="Type of query: 'lookup', 'filter', 'aggregate', 'find_extremes'",
                    required=False,
                    default="lookup",
                ),
                SkillParameter(
                    name="filter_field",
                    type="string",
                    description="Field to filter by",
                    required=False,
                ),
                SkillParameter(
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
        """Execute a data query based on the user's question.

        Args:
            message: User's query
            data: Evaluation records to query
            data_context: Context about the data
            params: Query parameters
            thought_stream: Stream for thoughts

        Returns:
            Query results with relevant data
        """
        params = self.validate_params(params)

        await self.emit_thought(
            thought_stream,
            f"Querying data: {message[:100]}...",
            "tool_use",
        )

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

            result = {
                "success": True,
                "total_records": len(df),
                "query": message,
            }

            # Extract potential IDs from the message
            id_patterns = [
                r"[a-zA-Z0-9]{15,18}",  # CRM-style IDs
                r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}",  # UUIDs
                r"test[-_]?\d+",  # test-123 or test_123
                r"record[-_]?\d+",  # record-123
            ]

            found_ids = []
            for pattern in id_patterns:
                matches = re.findall(pattern, message, re.IGNORECASE)
                found_ids.extend(matches)

            await self.emit_thought(
                thought_stream,
                f"Found {len(found_ids)} potential IDs in query",
                "observation",
            )

            # Look for ID columns
            id_columns = [
                col
                for col in df.columns
                if "id" in col.lower()
                or col.lower() in ["id", "test_id", "record_id", "evaluation_id"]
            ]

            # If we found IDs and have ID columns, filter to those records
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
                    # Deduplicate
                    seen = set()
                    unique_records = []
                    for record in matching_records:
                        record_str = str(sorted(record.items()))
                        if record_str not in seen:
                            seen.add(record_str)
                            unique_records.append(record)

                    result["matching_records"] = unique_records[:20]  # Limit to 20 records
                    result["match_count"] = len(unique_records)

                    await self.emit_thought(
                        thought_stream,
                        f"Found {len(unique_records)} matching records",
                        "observation",
                    )

            # Get numeric columns for metric analysis
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

            # Check for metric-related keywords in the message
            message_lower = message.lower()

            # Find extremes if asked about min/max/lowest/highest
            if any(
                word in message_lower for word in ["lowest", "minimum", "min", "worst", "smallest"]
            ):
                await self.emit_thought(
                    thought_stream,
                    "Looking for minimum values...",
                    "observation",
                )

                # If we have matching records, analyze those
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

                # Find the metric with the lowest average
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
                    thought_stream,
                    "Looking for maximum values...",
                    "observation",
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

            # Count if asked
            if any(word in message_lower for word in ["how many", "count", "number of"]):
                await self.emit_thought(
                    thought_stream,
                    "Counting records...",
                    "observation",
                )

                # Check for threshold conditions
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

            # Always include a sample of the relevant data for the LLM to reference
            if matching_records:
                result["data_sample"] = matching_records[:10]
            else:
                result["data_sample"] = df.head(10).to_dict("records")

            # Include column info
            result["available_columns"] = list(df.columns)
            result["numeric_columns"] = numeric_cols

            await self.emit_thought(
                thought_stream,
                "Query complete",
                "observation",
            )

            return result

        except Exception as e:
            logger.error(f"Query failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
            }
