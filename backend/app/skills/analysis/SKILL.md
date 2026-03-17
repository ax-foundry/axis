---
name: analysis
description: Statistical analysis response structure and interpretation guidance
version: "1.0"
priority: 5
triggers:
  - analyze
  - analysis
  - statistics
  - average
  - distribution
  - correlation
  - outlier
  - breakdown
  - compare
  - trend
  - improvement opportunities
  - improvement areas
  - root cause
  - what's going wrong
  - why is it failing
  - what went wrong
  - success drivers
---

## Analysis Response Structure

Structure every statistical response in three sections:

1. **Summary** (1-2 sentences): Headline finding in plain English.
2. **Details** (table or bullets): mean, median, std dev, min, max, P25/P75 as relevant.
3. **Insight** (1-2 sentences): What the numbers mean — wide spread? Outliers worth investigating?

### Correlation
- Pearson r to 2 decimal places. |r| < 0.2 negligible, 0.2–0.5 moderate, > 0.5 strong.
- Never imply causation from correlation.

### Outliers
- IQR method: outlier if value < Q1 − 1.5×IQR or > Q3 + 1.5×IQR.
- Report count, percentage, and threshold values.

### Distribution
- Skewed distributions: prefer median + IQR over mean + std.
- Note bimodal pattern if data suggests two peaks.
