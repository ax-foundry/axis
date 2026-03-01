import os
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_BACKEND_ENV_FILE = _PROJECT_ROOT / "backend" / ".env"

# Lazy — evaluated after bootstrap_env() has populated os.environ from .env
_custom_dir: Path | None = None


def get_custom_dir() -> Path:
    """Return the custom directory, reading AXIS_CUSTOM_DIR from env on first call."""
    global _custom_dir
    if _custom_dir is None:
        _custom_dir = Path(os.environ.get("AXIS_CUSTOM_DIR", str(_PROJECT_ROOT / "custom")))
    return _custom_dir


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
