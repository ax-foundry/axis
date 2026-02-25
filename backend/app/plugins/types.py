from pydantic import BaseModel, Field


class PluginNavItem(BaseModel):
    """A navigation item contributed by a plugin."""

    name: str
    href: str
    icon: str  # Lucide icon name, e.g. "Brain"
    section: str  # "main" or "tools"
    order: int = 50  # Stable sort key


class PluginTagMeta(BaseModel):
    """OpenAPI tag metadata contributed by a plugin."""

    name: str
    description: str = ""


class PluginMeta(BaseModel):
    """Plugin metadata — declares identity, nav items, and API tags."""

    name: str
    api_version: int = 1  # Bump when contract changes
    version: str = "0.1.0"
    description: str = ""
    nav: list[PluginNavItem] = Field(default_factory=list)
    tags_metadata: list[PluginTagMeta] = Field(default_factory=list)
