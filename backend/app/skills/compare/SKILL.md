# Compare Skill

Compares evaluation results across different experiments, models, or conditions.

## When to Use

- User asks to compare experiments or models
- User wants to see differences between configurations
- User asks "which model is better?"
- User wants to identify the best performing variant

## Capabilities

1. **Group Comparison**: Compare aggregated metrics across groups
2. **Metric Analysis**: Analyze specific metrics across conditions
3. **Winner Identification**: Identify best performers for each metric

## Parameters

- `group_by`: Column to use for grouping (default: "evaluation_name")
- `metrics`: List of specific metrics to compare
- `comparison_type`: "aggregate" for summary stats, "per_case" for case-by-case

## Output Format

Returns comparison results including:
- Per-group statistics for each metric
- List of groups and metrics compared
- Insights identifying winners for each metric

## Example Queries

- "Compare the performance across experiments"
- "Which model has better accuracy?"
- "Show me the differences between baseline and challenger"
- "Compare all metrics across evaluation runs"
