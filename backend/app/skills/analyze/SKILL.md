# Analyze Skill

Performs comprehensive statistical analysis on evaluation data.

## When to Use

- User asks about data patterns or trends
- User wants statistical analysis
- User asks "what patterns do you see?"
- User wants to understand metric relationships

## Capabilities

1. **Distribution Analysis**: Compute detailed distribution statistics
2. **Correlation Analysis**: Find relationships between metrics
3. **Outlier Detection**: Identify unusual data points
4. **Pattern Recognition**: Detect skewness and data quality issues

## Parameters

- `analysis_type`: "distribution", "correlation", "pattern", or "all"
- `metrics`: List of specific metrics to analyze
- `include_outliers`: Whether to detect outliers (default: true)

## Output Format

Returns analysis results including:
- Distribution statistics (mean, std, quartiles, skewness)
- Correlation matrix between metrics
- Strong correlations highlighted
- Outlier counts and bounds
- Generated insights from the analysis

## Example Queries

- "Analyze the patterns in my data"
- "What correlations exist between metrics?"
- "Are there any outliers in the scores?"
- "Show me the distribution of response quality"
