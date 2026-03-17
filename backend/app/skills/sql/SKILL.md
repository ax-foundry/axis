---
name: sql
description: DuckDB SQL patterns — date functions, QUALIFY, window functions, safe casting
version: "1.0"
priority: 5
triggers:
  - sql
  - query
  - group by
  - aggregate
  - date
  - time series
  - trend
  - weekly
  - monthly
  - filter by
  - signals
  - pass rate
  - breakdown
---

## DuckDB SQL Patterns

### Date truncation (time-series grouping)
Always CAST timestamp columns explicitly — DuckDB may store them as VARCHAR:
  DATE_TRUNC('day',   CAST("timestamp" AS TIMESTAMP)) AS day
  DATE_TRUNC('week',  CAST("timestamp" AS TIMESTAMP)) AS week
  DATE_TRUNC('month', CAST("timestamp" AS TIMESTAMP)) AS month

### QUALIFY (deduplicate / latest-per-group)
  SELECT * FROM eval_data
  QUALIFY ROW_NUMBER() OVER (PARTITION BY "Case_ID" ORDER BY "Timestamp" DESC) = 1

### Safe numeric aggregation
  AVG(TRY_CAST("score" AS DOUBLE))            -- NULL if cast fails
  ROUND(AVG("score"), 3)
  COUNT(*) FILTER (WHERE "score" >= 0.8)     -- conditional count

### Never append a semicolon — the query runner adds LIMIT automatically.

### String patterns
  WHERE LOWER("col") LIKE '%keyword%'
  WHERE REGEXP_MATCHES("col", '(?i)pattern')

---

## Q → SQL Examples

**Most recent date only (eval / monitoring)**
```sql
-- Q: "Show scores for the latest evaluation run"
SELECT "metric_name", ROUND(AVG("metric_score"), 3) AS avg_score
FROM eval_data
WHERE DATE_TRUNC('day', CAST("timestamp" AS TIMESTAMP)) = (
    SELECT MAX(DATE_TRUNC('day', CAST("timestamp" AS TIMESTAMP))) FROM eval_data
)
GROUP BY "metric_name"
ORDER BY avg_score DESC
```

**Weekly trend**
```sql
-- Q: "How has average score trended week over week?"
SELECT
    DATE_TRUNC('week', CAST("timestamp" AS TIMESTAMP)) AS week,
    ROUND(AVG("metric_score"), 3) AS avg_score,
    COUNT(*) AS n
FROM eval_data
GROUP BY week
ORDER BY week
```

**Top-N by group**
```sql
-- Q: "Which source_name has the highest average score?"
SELECT "source_name", ROUND(AVG("metric_score"), 3) AS avg_score, COUNT(*) AS n
FROM eval_data
GROUP BY "source_name"
ORDER BY avg_score DESC
```

**Deduplicate to latest record per case**
```sql
-- Q: "Unique cases with their most recent scores"
SELECT *
FROM eval_data
QUALIFY ROW_NUMBER() OVER (PARTITION BY "Case_ID" ORDER BY CAST("Timestamp" AS TIMESTAMP) DESC) = 1
```

**Pass rate (score >= threshold)**
```sql
-- Q: "What percentage of runs pass (score >= 0.8)?"
SELECT
    "metric_name",
    ROUND(100.0 * COUNT(*) FILTER (WHERE TRY_CAST("metric_score" AS DOUBLE) >= 0.8) / COUNT(*), 1) AS pass_pct,
    COUNT(*) AS total
FROM eval_data
GROUP BY "metric_name"
ORDER BY pass_pct DESC
```

**KPI trend (kpi_data table)**
```sql
-- Q: "Show KPI values over the last 30 days"
SELECT
    DATE_TRUNC('day', CAST("timestamp" AS TIMESTAMP)) AS day,
    "kpi_name",
    ROUND(AVG("kpi_value"), 3) AS avg_value
FROM kpi_data
WHERE CAST("timestamp" AS TIMESTAMP) >= CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY day, "kpi_name"
ORDER BY day, "kpi_name"
```

---

## Human Signals Table (`human_signals_cases`)

Columns follow the pattern `{metric_name}__{signal_key}`. The prefix is the metric; the suffix is the signal field.

**Select all signal columns for one metric**
```sql
-- Q: "Show all signals for the 'intervention' metric"
SELECT * EXCLUDE (metric_name)
FROM human_signals_cases
WHERE "metric_name" = 'intervention'
```

**Aggregate a specific signal across cases**
```sql
-- Q: "What is the pass rate for evaluation__is_correct?"
SELECT
    ROUND(100.0 * COUNT(*) FILTER (WHERE "evaluation__is_correct" = true) / COUNT(*), 1) AS pass_pct,
    COUNT(*) AS total
FROM human_signals_cases
WHERE "evaluation__is_correct" IS NOT NULL
```

**Distribution of a categorical signal**
```sql
-- Q: "Break down intervention categories"
SELECT "intervention__categories", COUNT(*) AS n
FROM human_signals_cases
WHERE "intervention__categories" IS NOT NULL
GROUP BY "intervention__categories"
ORDER BY n DESC
```

**Trend of a boolean signal over time**
```sql
-- Q: "Weekly pass rate for is_correct"
SELECT
    DATE_TRUNC('week', CAST("Timestamp" AS TIMESTAMP)) AS week,
    ROUND(100.0 * COUNT(*) FILTER (WHERE "evaluation__is_correct" = true) / COUNT(*), 1) AS pass_pct
FROM human_signals_cases
GROUP BY week
ORDER BY week
```
