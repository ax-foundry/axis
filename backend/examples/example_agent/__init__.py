"""Example custom agent plugin.

Demonstrates how to register a custom copilot agent that replaces the
built-in pydantic-ai / OAI agent for a specific ``agent_name`` value.

Deployment:
1. Copy this directory alongside your project (keep it out of axis's tree)
2. Set ``AXIS_EXTERNAL_PLUGINS_DIR=/path/to/parent/dir`` so AXIS discovers it
3. Set ``AXIS_PLUGINS_ENABLED=example_agent`` (or ``*`` for all external plugins)
4. Add a matching entry in ``custom/config/agents.yaml`` for display metadata
5. Replace the body of ``demo_agent.DemoAgent.process()`` with your own logic
"""

from fastapi import FastAPI

from app.copilot.agent_registry import register_agent
from app.plugins.types import PluginMeta

PLUGIN_META = PluginMeta(
    name="example_agent",
    version="0.1.0",
    description="Example plugin: demonstrates how to register a custom copilot agent.",
)


def register(app: FastAPI) -> None:  # noqa: ARG001
    """Register the DemoAgent under the name ``"demo"``."""
    from example_agent.demo_agent import DemoAgent  # relative import: package is on sys.path

    register_agent("demo", DemoAgent)
