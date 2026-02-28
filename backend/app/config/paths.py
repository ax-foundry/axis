import os
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_BACKEND_ENV_FILE = _PROJECT_ROOT / "backend" / ".env"

CUSTOM_DIR: Path = Path(os.environ.get("AXIS_CUSTOM_DIR", str(_PROJECT_ROOT / "custom")))
_CONFIG_DIR = CUSTOM_DIR / "config"


def resolve_config_path(filename: str) -> Path:
    """Resolve config file path from custom/config/."""
    return _CONFIG_DIR / filename


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
