"""Database backend error types."""


class DatabaseBackendError(Exception):
    """Error raised by database backends at the db layer.

    These are caught and re-wrapped by database_service.py as
    DatabaseServiceError so that routers never need to import db-layer types.
    """
