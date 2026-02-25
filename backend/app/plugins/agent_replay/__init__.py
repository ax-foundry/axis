from fastapi import FastAPI

from app.plugins.types import PluginMeta, PluginNavItem, PluginTagMeta

PLUGIN_META = PluginMeta(
    name="agent_replay",
    version="0.1.0",
    description="Step through AI agent workflows from Langfuse",
    nav=[
        PluginNavItem(
            name="Agent Replay",
            href="/agent-replay",
            icon="PlayCircle",
            section="main",
            order=45,
        ),
    ],
    tags_metadata=[
        PluginTagMeta(
            name="agent-replay",
            description="Agent workflow replay from Langfuse traces",
        ),
    ],
)


def register(app: FastAPI) -> None:
    from .routers.replay import router

    app.include_router(router, prefix="/api/agent-replay", tags=["agent-replay"])
