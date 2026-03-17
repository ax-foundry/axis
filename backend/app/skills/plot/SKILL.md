---
name: plot
description: Plotly chart conventions and layout rules for AXIS
version: "2.0"
priority: 10
triggers:
  - plot
  - chart
  - graph
  - visualize
  - histogram
  - scatter
  - heatmap
  - bar chart
  - line chart
---

## Chart Guidelines

Always produce Plotly JSON — never matplotlib or Python code.

---

### Colors

The UI applies a consistent palette automatically via `colorway` — do not set `marker.color` for multi-series charts.

Only set explicit colors for **semantic reference lines and annotation borders**:

| Role | Hex | Use |
|---|---|---|
| accent | `#2D5F8A` | Mean line |
| success | `#10b981` | Median line |
| warning | `#f59e0b` | P95 line |
| danger | `#ef4444` | P99 line |

For single-series bars or histograms where a specific color aids clarity, use `#4A90C9`.

---

### Trace Types

- `type: "bar"` for categorical comparisons; `barmode: "stack"` in layout for stacked.
- `type: "histogram"` with `histnorm: "percent"` for distributions — normalises to percentage so y-axis reads as "% of samples".
- `type: "scatter"` with `mode: "lines"` for time-series or KDE overlays; `mode: "markers"` for scatter.
- `type: "box"` for distribution comparisons across groups.
- `type: "heatmap"` for correlation matrices (`z` = 2D correlation array).
- `x` and `y` must reference actual column values from the SQL result — never fabricate values.

---

### Layout

The UI component handles all visual defaults (colors, fonts, bg, margins, axis tick styling, spines). Only specify what is structural or data-driven:

**Title + subtitle** — always provide a short, descriptive title:
```
title: { text: "Chart Title<br><sup>Dataset or time range context</sup>" }
```
Do not set `title.font`, `title.x`, or size — the UI sets those.

**Axis titles** — always label both axes:
```
xaxis: { title: "Metric name" }
yaxis: { title: "Average score" }
```
Do not set `tickfont`, `gridcolor`, `linecolor`, `automargin`, `zeroline`, `showline`, or `mirror` — the UI sets those.

**Only override margin in two cases:**
- Stats panel annotation: `margin: { r: 220 }`
- Horizontal bar chart with long category labels: `margin: { l: 180 }`

Otherwise omit margin entirely — the UI sets safe defaults.

**Histogram y-axis** — only add `ticksuffix: "%"` when using `histnorm: "percent"`:
```
yaxis: { title: "Frequency", ticksuffix: "%" }
```

**Legend orientation** — only specify when multi-series and horizontal layout is preferred:
```
legend: { orientation: "h", y: -0.15, x: 0.5, xanchor: "center" }
```

---

### Reference Lines (mean / median / P95 / P99)

For any distribution or time-series chart, add vertical (or horizontal) reference lines using `layout.shapes` and label them with `layout.annotations`.

**Shape entry** (one per statistic):
```
{ type: "line",
  x0: <value>, x1: <value>, y0: 0, y1: 1, yref: "paper",
  line: { color: "<semantic color>", width: 2.5, dash: "<dash style>" } }
```

Dash styles by statistic: median → `"solid"`, mean → `"dash"`, P95 → `"dashdot"`, P99 → `"dot"`

**Callout annotation** for each line — float the label near the top, push alternating lines to different heights to avoid overlap (use `y: 0.92`, `0.82`, `0.72`, `0.62` for lines that are close together):
```
{ xref: "x", yref: "paper",
  x: <value>, y: 0.92,
  text: "Median<br><b>X.XXs</b>",
  showarrow: true, arrowhead: 0, arrowwidth: 1.5, ax: 0, ay: -28,
  font: { size: 10, color: "<semantic color>" },
  bgcolor: "white", bordercolor: "<semantic color>", borderwidth: 1.5,
  borderpad: 5, align: "center" }
```

---

### Stats Panel Annotation

For distribution charts, add a monospace statistics panel anchored to the top-right of the plot area. Use `xref/yref: "paper"` so it stays fixed regardless of data range.

```
{ xref: "paper", yref: "paper",
  x: 0.98, y: 0.98, xanchor: "right", yanchor: "top",
  showarrow: false, align: "left",
  font: { family: "monospace", size: 10.5, color: "#2C3E50" },
  bgcolor: "white", bordercolor: "#e2e8f0", borderwidth: 2, borderpad: 12,
  text: (build from SQL results — use <br> for newlines)
}
```

**Panel text template** (populate with actual computed values):
```
DISTRIBUTION METRICS
────────────────────────────
Samples      <count>

CENTRAL TENDENCY
────────────────────────────
Mean         <mean>
Median       <median>
Std Dev      <std>

PERCENTILES
────────────────────────────
P25          <p25>
P50          <p50>
P75          <p75>
P90          <p90>
P95          <p95>
P99          <p99>

RANGE
────────────────────────────
Min          <min>
Max          <max>
Span         <max-min>
```

When using in a Plotly annotation, replace newlines with `<br>` and spaces with `&nbsp;` for alignment.

---

### Consistency Badge (distribution charts only)

Add a second annotation top-left that computes CV = std / mean and maps to a variance label:

| CV | Label |
|---|---|
| < 0.2 | LOW VARIANCE |
| 0.2 – 0.4 | MODERATE VARIANCE |
| 0.4 – 0.6 | HIGH VARIANCE |
| ≥ 0.6 | VERY HIGH VARIANCE |

```
{ xref: "paper", yref: "paper",
  x: 0.02, y: 0.98, xanchor: "left", yanchor: "top",
  showarrow: false,
  font: { size: 11, color: "#1E3A5F", family: "Inter, Arial, sans-serif" },
  bgcolor: "white", bordercolor: "#1E3A5F", borderwidth: 2.5, borderpad: 8,
  text: "<b>CONSISTENCY</b><br>● <label><br>CV: <cv>%" }
```

---

### KDE Density Overlay

For histogram charts, add a smoothed density curve by querying percentile points from SQL and plotting them as a scatter trace:

1. Use `run_sql` to compute ~20 evenly-spaced percentile values across the data range.
2. Add a `type: "scatter"`, `mode: "lines"` trace using those points.
3. Set `fill: "tozeroy"`, `fillcolor: "rgba(74,144,201,0.12)"` for the shaded area under the curve.
4. Set `line: { color: "#1E3A5F", width: 3, shape: "spline", smoothing: 1.3 }` for smooth curve.
5. Scale y-values to match the histogram's `histnorm: "percent"` range.

---

### Bar / Category Chart Orientation

**When a chart compares categories along one axis:**

- **≤ 6 short-label categories** → vertical bars or scatter (`orientation: "v"`)
- **> 6 categories OR any label longer than ~12 chars** → **horizontal bars** (`type: "bar"`, `orientation: "h"`)
  - Sort descending (highest value at top): reverse the data arrays before plotting.
  - Set `yaxis: { title: "..." }` and `xaxis: { title: "..." }` as normal — axes swap for horizontal.
  - Add `margin: { l: 180 }` so long category names are not clipped on the left.

This applies to scatter/dot charts used for category comparisons too: if the categories would stack on the x-axis with rotated labels, convert to horizontal bars instead.

**Bar polish:**
- `marker: { color: "#4A90C9", opacity: 0.85, line: { color: "white", width: 1.5 } }`
- For grouped bars: `barmode: "group"`, `bargap: 0.2`, `bargroupgap: 0.05`.

---

### Response Text

After calling `plot_data`, write one short sentence describing what was plotted in plain English.
- Say **what** the chart shows and **which data** it uses.
- Do NOT mention chart implementation details: axis ranges, color choices, bin counts, barmode, margin values, or any Plotly config.
- Wrong: "Rendered a bar chart of metric_name vs average metric_score with the y-axis fixed to [0, 1]."
- Right: "Here are the average scores per metric for the most recent date."

### Follow-up Requests

Re-call `plot_data` with updated SQL and a revised full Plotly spec — do not describe changes in text.
