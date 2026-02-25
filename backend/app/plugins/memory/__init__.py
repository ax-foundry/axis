from fastapi import FastAPI

from app.plugins.types import PluginMeta, PluginNavItem, PluginTagMeta

PLUGIN_META = PluginMeta(
    name="memory",
    version="0.1.0",
    description="Decision memory rules, hard stops, and batch analysis",
    nav=[
        PluginNavItem(name="Memory", href="/memory", icon="Brain", section="main", order=50),
    ],
    tags_metadata=[
        PluginTagMeta(
            name="memory",
            description="Decision memory rules, hard stops, and batch analysis",
        ),
        PluginTagMeta(
            name="graph",
            description="Knowledge graph queries and visualization (FalkorDB)",
        ),
    ],
)


def register(app: FastAPI) -> None:
    """Register memory routers with the FastAPI application."""
    from .routers.graph import router as graph_router
    from .routers.memory import router as memory_router

    app.include_router(memory_router, prefix="/api/memory", tags=["memory"])
    app.include_router(graph_router, prefix="/api/memory/graph", tags=["graph"])
