from app.services.db._base import CatalogBackend, DatabaseBackend
from app.services.db._types import DatabaseType

_backends: dict[DatabaseType, DatabaseBackend] = {}
_catalogs: dict[DatabaseType, CatalogBackend] = {}


def get_backend(db_type: DatabaseType | str = DatabaseType.POSTGRES) -> DatabaseBackend:
    """Return the singleton ``DatabaseBackend`` for *db_type*."""
    db_type = DatabaseType(db_type)

    if db_type not in _backends:
        if db_type == DatabaseType.POSTGRES:
            from app.services.db._postgres import PostgresBackend

            _backends[db_type] = PostgresBackend()
        else:
            raise ValueError(f"Unsupported database type: {db_type}")

    return _backends[db_type]


def get_catalog(db_type: DatabaseType | str = DatabaseType.POSTGRES) -> CatalogBackend:
    """Return the singleton ``CatalogBackend`` for *db_type*."""
    db_type = DatabaseType(db_type)

    if db_type not in _catalogs:
        if db_type == DatabaseType.POSTGRES:
            from app.services.db._postgres import PostgresCatalog

            _catalogs[db_type] = PostgresCatalog()
        else:
            raise ValueError(f"Unsupported database type: {db_type}")

    return _catalogs[db_type]
