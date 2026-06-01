import os
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_BACKEND_ENV_FILE = _PROJECT_ROOT / "backend" / ".env"


def get_custom_dir() -> Path:
    """Return the custom directory, re-reading AXIS_CUSTOM_DIR each call.

    Not cached: agents.py and metric_definitions.py call this at import time,
    before bootstrap_env() has loaded .env into os.environ. Re-reading avoids
    the ordering trap.
    """
    return Path(os.environ.get("AXIS_CUSTOM_DIR", str(_PROJECT_ROOT / "custom")))


# Back-compat alias (deprecated — prefer get_custom_dir())
CUSTOM_DIR = _PROJECT_ROOT / "custom"


def resolve_config_path(filename: str) -> Path:
    """Resolve config file path from custom/config/."""
    return get_custom_dir() / "config" / filename


def require_config_path(filename: str) -> Path:
    """Resolve and validate a config file exists.

    Raises FileNotFoundError with setup hint.
    """
    path = resolve_config_path(filename)
    if not path.exists():
        raise FileNotFoundError(
            f"Config file not found: {path}. Run 'make setup' to create config files."
        )
    return path
