---
icon: custom/overview
---

# User Guide

This guide covers the main features of AXIS and how to use them effectively.

---

## Modules

<div class="feature-grid" markdown>

<div class="feature-card" markdown>

### :material-chart-tree: Evaluate

Upload evaluation data, run batch evaluations with the Axion engine, and explore results through interactive tree visualizations and multi-chart analytics.

[:octicons-arrow-right-24: Evaluate guide](evaluate.md)

</div>

<div class="feature-card" markdown>

### :material-view-dashboard: Production

Executive overview combining Agent KPIs, AI quality monitoring, and human-in-the-loop signals in a single at-a-glance dashboard with sparkline trends.

[:octicons-arrow-right-24: Production guide](production.md)

</div>

<div class="feature-card" markdown>

### :material-monitor-dashboard: Monitoring

Deep-dive production observability — time-series score trends, metric breakdowns, latency distributions, classification analysis, and anomaly alerts.

[:octicons-arrow-right-24: Monitoring guide](monitoring.md)

</div>

<div class="feature-card" markdown>

### :material-account-edit: Annotation Studio

Human-in-the-loop quality assessment with 3 annotation formats, tag-based critiques, keyboard shortcuts, and CSV export.

[:octicons-arrow-right-24: Annotation Studio guide](annotation.md)

</div>

<div class="feature-card" markdown>

### :material-target: CaliberHQ

LLM judge calibration with a 3-step workflow — annotate ground truth, configure the judge, and validate alignment with Cohen's Kappa, confusion matrices, EvidencePipeline-powered pattern discovery, and actionable learning insights.

[:octicons-arrow-right-24: Calibration guide](calibration.md)

</div>

<div class="feature-card" markdown>

### :material-account-group: Simulation

Synthetic persona-based agent testing with configurable personas, knowledge base upload, and conversation replay.

[:octicons-arrow-right-24: Simulation guide](simulation.md)

</div>

<div class="feature-card" markdown>

### :material-brain: Memory

Decision memory dashboard with rule extraction, hard stops, batch analysis, decision quality metrics, and knowledge graph visualization.

[:octicons-arrow-right-24: Memory guide](memory.md)

</div>

<div class="feature-card" markdown>

### :material-message-text: Human Signals

Data-driven HITL dashboard showing signal trends, classification distributions, case-level drill-down, and dynamic KPI strips.

[:octicons-arrow-right-24: Human Signals guide](human-signals.md)

</div>

<div class="feature-card" markdown>

### :material-replay: Agent Replay

Debug and review AI agent execution traces from Langfuse — step through observation trees, inspect inputs/outputs, and submit verdicts for continuous improvement.

[:octicons-arrow-right-24: Agent Replay guide](agent-replay.md)

</div>

<div class="feature-card" markdown>

### :material-book-open-variant: Learn

Interactive learning modules and guided tutorials for mastering AXIS features, evaluation methodology, and AI quality best practices.

[:octicons-arrow-right-24: Learn guide](learn.md)

</div>

<div class="feature-card" markdown>

### :material-cog: Settings

System configuration, database connections, theme customization, and agent registry — all managed from a single page.

[:octicons-arrow-right-24: Settings guide](settings.md)

</div>

</div>

---

## Getting Data In

AXIS supports two data ingestion paths:

1. **CSV Upload** (default) — Drag and drop files through the UI
2. **Database Auto-Load** — Configure PostgreSQL connections in YAML

See [Data Sources](../configuration/data-sources.md) for setup details.
