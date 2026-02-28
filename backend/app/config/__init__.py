"""Application configuration package — no facade exports.

Import directly from submodules::

    from app.config.env import settings, bootstrap_env
    from app.config.paths import resolve_config_path, CUSTOM_DIR
    from app.config.constants import Columns, Thresholds, Colors
    from app.config.theme import load_theme_config
    from app.config.agents import load_agents_config
    from app.config.db import get_import_config
    from app.config.db.monitoring import monitoring_db_config

``from app.config import settings`` does **not** work. This is intentional:
each submodule has its own dependency footprint, and facade re-exports would
force every consumer to transitively import YAML loaders, pydantic-settings,
and all database config modules.
"""
