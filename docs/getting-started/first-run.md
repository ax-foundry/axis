---
icon: custom/first-run
---

# First Run

With dependencies installed and environment files configured, you are ready to start the development servers and explore the dashboard.

!!! note "This page covers local development"
    For production deployment with Docker and reverse proxy, see the [Deployment guide](../deployment/index.md).

---

## Start the Dev Servers

### One-command start (recommended)

From the repository root:

```bash
make dev
```

This launches both services concurrently:

- **Backend** at [http://localhost:8500](http://localhost:8500) (uvicorn with hot-reload)
- **Frontend** at [http://localhost:3500](http://localhost:3500) (Next.js dev server)

### Manual start

If you need to run the services in separate terminals:

=== "Backend"

    ```bash
    cd backend
    uvicorn app.main:app --reload --port 8500
    ```

=== "Frontend"

    ```bash
    cd frontend
    npm run dev
    ```

!!! tip
    Running in separate terminals is useful when you only need to restart one service, or when you want to isolate log output.

---

## Open the Dashboard

Navigate to [http://localhost:3500](http://localhost:3500) in your browser. You will see the AXIS landing page.

### Load Data

AXIS needs evaluation data to display. You have two options on first launch:

=== "Upload a CSV"

    Click **Upload CSV** on the landing page and select an evaluation results file. AXIS will parse the data and populate the dashboard automatically.

=== "Use example data"

    Click one of the example dataset buttons to load sample data without uploading anything:

    - **Example Single Model** -- loads a single-model evaluation dataset for exploring the Evaluate and Analytics tabs.
    - **Example Model Comparison** -- loads a two-model dataset for exploring the Compare tab alongside Evaluate.

!!! info "No data required for all features"
    Some features (Monitoring, Annotation, Simulation, Memory) have their own data pipelines and may require additional configuration. The example datasets are designed to get you started with core evaluation workflows.

---

## Explore the Interface

Once data is loaded, use the top navigation to explore the main modules:

| Tab | What it does |
|-----|-------------|
| **Evaluate** | Hierarchical metric tree, score distributions, and per-sample drill-down |
| **Analytics** | Eight chart types for slicing evaluation results across dimensions |
| **Compare** | Side-by-side model comparison with score deltas and metadata alignment |

---

## Verify the Backend API

The backend serves interactive API documentation at:

- **Swagger UI**: [http://localhost:8500/docs](http://localhost:8500/docs)
- **ReDoc**: [http://localhost:8500/redoc](http://localhost:8500/redoc)

Use these to inspect available endpoints, test requests, and review response schemas.

---

## Next Steps

- **[User Guide](../user-guide/index.md)** -- deep dives into each feature module (Evaluate, Monitoring, Compare, Annotation, and more).
- **[Configuration](../configuration/index.md)** -- environment variables, YAML configs, data sources, and theming.
- **[Architecture](../architecture/index.md)** -- how the frontend and backend are structured.
