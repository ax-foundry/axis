import importlib
import importlib.util
import logging
import os
import pkgutil
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from app.config.env import settings
from app.plugins.types import PluginMeta

logger = logging.getLogger(__name__)

_plugin_registry: list[dict[str, Any]] | None = None  # None = not yet discovered

# Plugins that live in-tree for reference only; never auto-enabled via "*"
_DEMO_PLUGINS: frozenset[str] = frozenset({"example_agent"})


def _enabled_set() -> set[str] | None:
    """Return the set of enabled plugin names, or None for all (excluding demos)."""
    raw = settings.AXIS_PLUGINS_ENABLED
    if raw.strip() == "*":
        return None  # caller must still exclude _DEMO_PLUGINS
    return {n.strip() for n in raw.split(",") if n.strip()}


def _external_dirs() -> list[Path]:
    """Return validated external plugin directories from AXIS_EXTERNAL_PLUGINS_DIR.

    The env var is a colon-separated list of absolute paths.  Non-existent
    entries are silently skipped so misconfigured deployments don't crash
    at startup.
    """
    raw = os.getenv("AXIS_EXTERNAL_PLUGINS_DIR", "").strip()
    if not raw:
        return []
    dirs: list[Path] = []
    for part in raw.split(":"):
        part = part.strip()
        if not part:
            continue
        p = Path(part).resolve()
        if p.is_dir():
            dirs.append(p)
        else:
            logger.warning("AXIS_EXTERNAL_PLUGINS_DIR: %s does not exist, skipping", p)
    return dirs


def _load_plugin_from_dir(
    name: str,
    dir_path: Path,
    enabled: set[str] | None,
    is_external: bool,
) -> dict[str, Any]:
    """Import a single plugin package and return its registry entry."""
    # External plugins are imported by their bare package name (dir is on sys.path).
    # In-tree plugins use the dotted app.plugins.<name> path.
    module_name = name if is_external else f"app.plugins.{name}"
    try:
        mod = importlib.import_module(module_name)
        raw_meta = getattr(mod, "PLUGIN_META", None)
        if raw_meta is None:
            logger.warning("Plugin %s has no PLUGIN_META", name)
            return {
                "meta": PluginMeta(name=name),
                "module": None,
                "enabled": False,
                "error": "no PLUGIN_META",
            }

        meta = raw_meta if isinstance(raw_meta, PluginMeta) else PluginMeta(**raw_meta)

        reg_fn = getattr(mod, "register", None)
        if not callable(reg_fn):
            logger.error("Plugin %s has no callable register(), skipping", name)
            return {"meta": meta, "module": None, "enabled": False, "error": "no register()"}

        # Demo plugins are only enabled when explicitly listed, never via "*"
        if meta.name in _DEMO_PLUGINS and enabled is None:
            return {"meta": meta, "module": mod, "enabled": False, "error": None}

        is_enabled = enabled is None or meta.name in enabled
        return {"meta": meta, "module": mod, "enabled": is_enabled, "error": None}

    except Exception:
        logger.exception("Failed to discover plugin %s", name)
        return {
            "meta": PluginMeta(name=name),
            "module": None,
            "enabled": False,
            "error": "discovery failed",
        }


def discover_plugins() -> list[dict[str, Any]]:
    """Discover all plugins: in-tree (app/plugins/) and external (AXIS_EXTERNAL_PLUGINS_DIR).

    Returns a list of dicts with keys: meta, module, enabled, error.
    Results are cached after first call.
    """
    global _plugin_registry
    if _plugin_registry is not None:
        return _plugin_registry

    enabled = _enabled_set()
    result: list[dict[str, Any]] = []
    seen_names: set[str] = set()

    # 1. In-tree plugins
    pkg_path = str(Path(__file__).parent)
    for _, name, is_pkg in sorted(pkgutil.iter_modules([pkg_path]), key=lambda x: x[1]):
        if not is_pkg or name == "types":
            continue
        seen_names.add(name)
        result.append(
            _load_plugin_from_dir(name, Path(pkg_path) / name, enabled, is_external=False)
        )

    # 2. External plugins (AXIS_EXTERNAL_PLUGINS_DIR)
    # NOTE: sys.path.insert is permanent for the process lifetime — anything else
    # inside ext_dir becomes globally importable (e.g. a config/ subdir could shadow
    # `import config`).  External plugin dirs should contain only plugin packages.
    for ext_dir in _external_dirs():
        if str(ext_dir) not in sys.path:
            sys.path.insert(0, str(ext_dir))
        for _, name, is_pkg in sorted(pkgutil.iter_modules([str(ext_dir)]), key=lambda x: x[1]):
            if not is_pkg:
                continue
            if name in seen_names:
                logger.warning("External plugin %s shadows in-tree plugin with same name", name)
            seen_names.add(name)
            result.append(_load_plugin_from_dir(name, ext_dir / name, enabled, is_external=True))

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
