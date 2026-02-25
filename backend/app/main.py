import asyncio
import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

logger = logging.getLogger(__name__)

from app.plugins import get_all_tags_metadata, register_all  # noqa: E402
from app.routers import (  # noqa: E402
    ai,
    align,
    analytics,
    config,
    data,
    database,
    eval_runner,
    human_signals,
    kpi,
    monitoring,
    monitoring_analytics,
    reports,
    store,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)

# Set specific loggers to INFO level
logging.getLogger("axis").setLevel(logging.INFO)
logging.getLogger("axis.copilot").setLevel(logging.INFO)
logging.getLogger("axis.routers.ai").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifecycle events."""
    # Startup
    print(f"Starting AXIS Backend on {settings.HOST}:{settings.PORT}")

    # DuckDB store initialization
    from app.config import duckdb_config

    # Background tasks to keep alive during app lifetime
    background_tasks: set[asyncio.Task[object]] = set()

    if duckdb_config.enabled:
        from app.services.duckdb_store import get_store
        from app.services.sync_engine import (
            _build_human_signals_derived_tables,
            periodic_sync_loop,
            sync_with_lock,
        )

        duckdb_store = get_store()

        # Load persisted metadata from DuckDB (fast, populates hot cache)
        duckdb_store.load_metadata_from_db()

        # Always rebuild human_signals_cases from human_signals_raw on startup
        # to pick up any changes to aggregation logic in human_signals_service.py.
        raw_id = duckdb_store.get_kv("human_signals_raw_sync_id")
        if raw_id and duckdb_store.has_table("human_signals_raw"):
            logger.info("Rebuilding human_signals_cases derived table on startup")
            task: asyncio.Task[object] = asyncio.create_task(
                _build_human_signals_derived_tables(duckdb_store, raw_id)
            )
            background_tasks.add(task)
            task.add_done_callback(background_tasks.discard)

        # Background sync on startup (globally controlled by duckdb.sync_mode).
        startup_sync_task: asyncio.Task[object] | None = None
        if duckdb_config.sync_mode == "startup":
            startup_sync_task = asyncio.create_task(sync_with_lock(duckdb_store, reason="startup"))
            background_tasks.add(startup_sync_task)
            startup_sync_task.add_done_callback(background_tasks.discard)
            logger.info("DuckDB background sync started")

        # Periodic incremental sync scheduler — starts after startup sync completes
        _captured_startup_task = startup_sync_task

        async def _start_periodic_scheduler() -> None:
            if _captured_startup_task is not None:
                logger.info("Periodic scheduler waiting for startup sync to finish...")
                await asyncio.shield(_captured_startup_task)
                logger.info("Startup sync done, periodic scheduler starting")
            await periodic_sync_loop(duckdb_store)

        scheduler_task: asyncio.Task[object] = asyncio.create_task(_start_periodic_scheduler())
        background_tasks.add(scheduler_task)
        scheduler_task.add_done_callback(background_tasks.discard)

    yield
    # Shutdown — cancel all background tasks gracefully
    for task in list(background_tasks):
        task.cancel()
    if background_tasks:
        await asyncio.gather(*background_tasks, return_exceptions=True)

    from app.services.db import get_backend

    await get_backend().close_all_pools()
    print("Shutting down AXIS Backend")


tags_metadata = [
    {"name": "config", "description": "Theme configuration and application settings"},
    {"name": "data", "description": "CSV upload, format detection, and data processing"},
    {"name": "analytics", "description": "Statistical aggregations, distributions, and chart data"},
    {"name": "ai", "description": "AI Copilot chat with streaming SSE responses"},
    {"name": "align", "description": "LLM judge calibration and alignment workflows"},
    {"name": "reports", "description": "Report generation and issue extraction"},
    {
        "name": "database",
        "description": "PostgreSQL connection management, schema browsing, and import",
    },
    {"name": "human-signals", "description": "Human signals upload and processing"},
    {"name": "monitoring", "description": "Monitoring data upload and management"},
    {
        "name": "monitoring-analytics",
        "description": "Time-series trends, metric breakdowns, and latency analysis",
    },
    {"name": "eval-runner", "description": "Batch evaluation execution via Axion engine"},
    {"name": "store", "description": "DuckDB analytics store: sync, status, metadata, data"},
    {"name": "kpi", "description": "Agent KPI analytics: category views, trends, filters"},
]

# Merge plugin tags (deduped by name, first wins)
tags_metadata += get_all_tags_metadata()

app = FastAPI(
    title="AXIS API",
    description=(
        "**AXIS** (Agent X-Ray Interface & Statistics) — "
        "AI Evaluation Platform Backend.\n\n"
        "Provides REST APIs for data processing, analytics, monitoring, "
        "human-in-the-loop workflows, and AI copilot features."
    ),
    version="0.1.0",
    lifespan=lifespan,
    openapi_tags=tags_metadata,
    contact={"name": "AXIS", "url": "https://github.com/ax-foundry/axis"},
    license_info={"name": "MIT"},
)

# Build CORS allowlist from defaults + configured frontend origins.
cors_origins = {"http://localhost:3500", "http://127.0.0.1:3500", settings.FRONTEND_URL}
if settings.FRONTEND_URLS:
    extra_origins = [origin.strip() for origin in settings.FRONTEND_URLS.split(",")]
    cors_origins.update(origin for origin in extra_origins if origin)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(config.router, prefix="/api/config", tags=["config"])
app.include_router(data.router, prefix="/api/data", tags=["data"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(align.router, prefix="/api/align", tags=["align"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(database.router, prefix="/api/database", tags=["database"])
app.include_router(human_signals.router, prefix="/api/human-signals", tags=["human-signals"])
app.include_router(monitoring.router, prefix="/api/monitoring", tags=["monitoring"])
app.include_router(
    monitoring_analytics.router,
    prefix="/api/monitoring/analytics",
    tags=["monitoring-analytics"],
)
app.include_router(
    eval_runner.router,
    prefix="/api/eval-runner",
    tags=["eval-runner"],
)
app.include_router(store.router, prefix="/api/store", tags=["store"])
app.include_router(kpi.router, prefix="/api/kpi", tags=["kpi"])

# Register plugin routers
register_all(app)


@app.get("/")
async def root() -> dict[str, str]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "AXIS API",
        "version": "0.1.0",
    }


@app.get("/health")
async def health_check() -> dict[str, object]:
    """Detailed health check."""
    return {
        "status": "healthy",
        "components": {
            "api": "up",
            "data_processor": "up",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
