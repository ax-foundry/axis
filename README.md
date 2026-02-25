# AXIS

<strong>A</strong>gent <strong>X</strong>-Ray <strong>I</strong>nterface & <strong>S</strong>tatistics

<p align="center">
  <img src="resources/axis_transparent.png" width="500" alt="AXIS">
</p>

<p align="center">
  <a href="https://ax-foundry.github.io/axis/"><strong>Documentation</strong></a> &nbsp;&middot;&nbsp;
  <a href="https://ax-foundry.github.io/axis/getting-started/installation/"><strong>Getting Started</strong></a> &nbsp;&middot;&nbsp;
  <a href="https://ax-foundry.github.io/axis/api-reference/"><strong>API Reference</strong></a> &nbsp;&middot;&nbsp;
  <a href="https://ax-foundry.github.io/axis/contributing/"><strong>Contributing</strong></a>
</p>

<p align="center">
  <a href="https://github.com/ax-foundry/axis/actions"><img src="https://img.shields.io/github/actions/workflow/status/ax-foundry/axis/ci.yml?branch=master&style=flat-square&label=CI" alt="CI"></a>
  <a href="https://ax-foundry.github.io/axis/"><img src="https://img.shields.io/badge/docs-live-8B9F4F?style=flat-square" alt="Docs"></a>
  <a href="https://github.com/ax-foundry/axis/blob/master/LICENSE"><img src="https://img.shields.io/github/license/ax-foundry/axis?style=flat-square" alt="License"></a>
  <a href="https://github.com/ax-foundry/axis"><img src="https://img.shields.io/github/stars/ax-foundry/axis?style=flat-square" alt="Stars"></a>
</p>

---

**AXIS** is a comprehensive visualization layer and interactive dashboard for AI model evaluation data. Built as the frontend for the [AXION](https://github.com/ax-foundry/axion) evaluation engine, AXIS provides deep insights into model performance through hierarchical metric visualization, multi-dimensional analytics, and human-in-the-loop workflows.

## Features

- **Evaluate** — Upload data, run batch evaluations, visualize metric trees, and analyze with 8+ chart types
- **Compare** — Side-by-side model comparison with score deltas and radar overlays
- **Monitoring** — Production observability with time-series trends and latency tracking
- **Annotation** — Human-in-the-loop quality assessment with 3 annotation formats
- **Calibration** — LLM judge alignment validation against human annotations
- **Simulation** — Synthetic persona-based agent testing
- **Memory** — Decision memory dashboard with knowledge graph visualization
- **AI Copilot** — Context-aware data analysis assistant with streaming responses

## Quick Start

```bash
git clone https://github.com/ax-foundry/axis.git
cd axis
make install
make dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3500 |
| Backend | http://localhost:8500 |
| API Docs | http://localhost:8500/docs |

See the [installation guide](https://ax-foundry.github.io/axis/getting-started/installation/) for prerequisites and detailed setup.

## Documentation

Full documentation is available at the [AXIS docs site](https://ax-foundry.github.io/axis/).

- [Getting Started](https://ax-foundry.github.io/axis/getting-started/)
- [User Guide](https://ax-foundry.github.io/axis/user-guide/)
- [Configuration](https://ax-foundry.github.io/axis/configuration/)
- [Architecture](https://ax-foundry.github.io/axis/architecture/)
- [API Reference](https://ax-foundry.github.io/axis/api-reference/)
- [Development](https://ax-foundry.github.io/axis/development/)

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, Zustand, React Query, Plotly.js |
| **Backend** | FastAPI, Python 3.12, Pandas, Pydantic, Scikit-Learn |

## Related Projects

- **[AXION](https://github.com/ax-foundry/axion)** — Agent evaluation engine (the data source for AXIS)

## Contributing

See the [Contributing guide](https://ax-foundry.github.io/axis/contributing/) for setup instructions and code standards.
