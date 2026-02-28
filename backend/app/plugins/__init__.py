import importlib
import logging
import pkgutil
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from app.config.env import settings
from app.plugins.types import PluginMeta

logger = logging.getLogger(__name__)

_plugin_registry: list[dict[str, Any]] | None = None  # None = not yet discovered


def _enabled_set() -> set[str] | None:
    """Return the set of enabled plugin names, or None for all."""
    raw = settings.AXIS_PLUGINS_ENABLED
    if raw.strip() == "*":
        return None
    return {n.strip() for n in raw.split(",") if n.strip()}


def discover_plugins() -> list[dict[str, Any]]:
    """Discover all plugins in the plugins/ directory.

    Returns a list of dicts with keys: meta, module, enabled, error.
    Results are cached after first call.
    """
    global _plugin_registry
    if _plugin_registry is not None:
        return _plugin_registry

    enabled = _enabled_set()
    pkg_path = str(Path(__file__).parent)
    result: list[dict[str, Any]] = []

    for _, name, is_pkg in sorted(pkgutil.iter_modules([pkg_path]), key=lambda x: x[1]):
        if not is_pkg or name == "types":
            continue
        try:
            mod = importlib.import_module(f"app.plugins.{name}")
            raw_meta = getattr(mod, "PLUGIN_META", None)
            if raw_meta is None:
                logger.warning("Plugin %s has no PLUGIN_META", name)
                result.append(
                    {
                        "meta": PluginMeta(name=name),
                        "module": None,
                        "enabled": False,
                        "error": "no PLUGIN_META",
                    }
                )
                continue

            meta = raw_meta if isinstance(raw_meta, PluginMeta) else PluginMeta(**raw_meta)

            reg_fn = getattr(mod, "register", None)
            if not callable(reg_fn):
                logger.error("Plugin %s has no callable register(), skipping", name)
                result.append(
                    {
                        "meta": meta,
                        "module": None,
                        "enabled": False,
                        "error": "no register()",
                    }
                )
                continue

            is_enabled = enabled is None or meta.name in enabled
            result.append({"meta": meta, "module": mod, "enabled": is_enabled, "error": None})
        except Exception:
            logger.exception("Failed to discover plugin %s", name)
            result.append(
                {
                    "meta": PluginMeta(name=name),
                    "module": None,
                    "enabled": False,
                    "error": "discovery failed",
                }
            )

    _plugin_registry = result  # Atomic assign — no partial cache
    return _plugin_registry


def register_all(app: FastAPI) -> None:
    """Call register(app) on every enabled plugin."""
    for entry in discover_plugins():
        if not entry["enabled"] or entry["error"]:
            continue
        try:
            entry["module"].register(app)
        except Exception:
            logger.exception("Failed to register plugin %s", entry["meta"].name)
            entry["error"] = "register failed"


def get_all_tags_metadata() -> list[dict[str, str]]:
    """Collect OpenAPI tags from all enabled plugins (deduped by name, first wins)."""
    seen: set[str] = set()
    tags: list[dict[str, str]] = []
    for entry in discover_plugins():
        if not entry["enabled"] or entry["error"]:
            continue
        for tag in entry["meta"].tags_metadata:
            if tag.name not in seen:
                seen.add(tag.name)
                tags.append({"name": tag.name, "description": tag.description})
    return sorted(tags, key=lambda t: t["name"])


def get_all_nav_items() -> list[dict[str, Any]]:
    """Collect nav items from all enabled plugins (deduped by href, first wins)."""
    seen: set[str] = set()
    items: list[dict[str, Any]] = []
    for entry in discover_plugins():
        if not entry["enabled"] or entry["error"]:
            continue
        for nav in entry["meta"].nav:
            if nav.href not in seen:
                seen.add(nav.href)
                items.append(nav.model_dump())
    return sorted(items, key=lambda x: (x["order"], x["name"]))
