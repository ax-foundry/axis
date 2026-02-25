# Summarize Skill

Generates comprehensive summaries and actionable insights from evaluation data.

## When to Use

- User asks for a summary or overview
- User wants key insights
- User asks "what are the main takeaways?"
- User needs recommendations

## Capabilities

1. **Overview Generation**: Create high-level data summaries
2. **Performance Summary**: Identify high and low performers
3. **Issue Detection**: Find data quality problems
4. **Recommendations**: Provide actionable next steps

## Parameters

- `focus`: "performance", "quality", "issues", or "all"
- `detail_level`: "brief", "standard", or "detailed"
- `include_recommendations`: Whether to generate recommendations (default: true)

## Output Format

Returns summary including:
- Data overview (record count, metric count, format)
- Performance summary with high/low performers
- Quality issues detected
- Key insights list
- Actionable recommendations

## Example Queries

- "Give me a summary of this data"
- "What are the main insights?"
- "What should I focus on improving?"
- "Summarize the evaluation results"
