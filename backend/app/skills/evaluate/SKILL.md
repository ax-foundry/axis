# Evaluate Skill

Runs LLM-based evaluation using the AXIS evaluation framework.

## When to Use

- User asks about response quality
- User wants to evaluate model outputs
- User needs quality scores for their data
- User asks "how good are the responses?"

## Capabilities

1. **Quality Assessment**: Analyze response quality across multiple metrics
2. **Statistical Analysis**: Compute mean, standard deviation, and passing rates
3. **Insight Generation**: Identify low-performing and high-performing areas

## Parameters

- `metric_focus`: Focus on a specific metric (optional)
- `sample_size`: Number of records to evaluate (default: 100)
- `criteria`: Custom evaluation criteria to apply

## Output Format

Returns evaluation results including:
- Per-metric statistics (mean, std, min, max, median)
- Passing rates for metrics on 0-1 scale
- Generated insights highlighting issues and successes

## Example Queries

- "Evaluate the quality of my data"
- "What are the scores for the relevance metric?"
- "How many records are passing quality thresholds?"
