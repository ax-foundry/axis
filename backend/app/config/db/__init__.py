from ._base import BaseDBImportConfig  # — used by get_import_config
from .eval_db import eval_db_config
from .human_signals import human_signals_db_config
from .monitoring import monitoring_db_config

VALID_STORES = ("data", "monitoring", "human_signals")


def get_import_config(store: str) -> BaseDBImportConfig:
    """Return the DB import config for a given target store.

    Raises ValueError on unknown store.
    """
    registry: dict[str, BaseDBImportConfig] = {
        "data": eval_db_config,
        "monitoring": monitoring_db_config,
        "human_signals": human_signals_db_config,
    }
    if store not in registry:
        raise ValueError(f"Unknown store: {store!r}. Valid stores: {list(registry.keys())}")
    return registry[store]
