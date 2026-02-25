import hashlib
import logging
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

logger = logging.getLogger(__name__)

# TTL for connection handles (15 minutes)
HANDLE_TTL_MINUTES = 15
# Maximum concurrent handles
MAX_HANDLES = 100


@dataclass
class ConnectionInfo:
    """Stored connection information."""

    host: str
    port: int
    database: str
    username: str
    password: str  # Stored in memory only, never logged
    ssl_mode: str
    db_type: str = "postgres"
    created_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: datetime = field(
        default_factory=lambda: datetime.utcnow() + timedelta(minutes=HANDLE_TTL_MINUTES)
    )
    request_count: int = 0
    last_request_at: datetime = field(default_factory=datetime.utcnow)

    def is_expired(self) -> bool:
        """Check if this connection handle has expired."""
        return datetime.utcnow() > self.expires_at

    def increment_request_count(self) -> None:
        """Increment request count and update last request time."""
        self.request_count += 1
        self.last_request_at = datetime.utcnow()


class ConnectionStore:
    """Thread-safe in-memory store for connection handles."""

    def __init__(self) -> None:
        """Initialize the connection store."""
        self._store: dict[str, ConnectionInfo] = {}
        self._lock = threading.RLock()

    def _cleanup_expired(self) -> None:
        """Remove expired handles from the store."""
        expired_handles = [handle for handle, info in self._store.items() if info.is_expired()]
        for handle in expired_handles:
            del self._store[handle]
            logger.debug(f"Cleaned up expired handle: {handle[:8]}...")

    def _hash_host(self, host: str) -> str:
        """Hash host for logging (privacy)."""
        return hashlib.sha256(host.encode()).hexdigest()[:8]

    def create_handle(
        self,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
        ssl_mode: str,
        db_type: str = "postgres",
    ) -> str:
        """Create a new connection handle.

        Args:
            host: Database host
            port: Database port
            database: Database name
            username: Database username
            password: Database password
            ssl_mode: SSL mode
            db_type: Database type (default: "postgres")

        Returns:
            UUID handle string

        Raises:
            ValueError: If max handles exceeded
        """
        with self._lock:
            # Cleanup expired handles first
            self._cleanup_expired()

            # Check rate limit
            if len(self._store) >= MAX_HANDLES:
                raise ValueError(
                    f"Maximum concurrent connections ({MAX_HANDLES}) exceeded. "
                    "Please wait for existing connections to expire."
                )

            # Generate unique handle
            handle = str(uuid.uuid4())

            # Store connection info
            self._store[handle] = ConnectionInfo(
                host=host,
                port=port,
                database=database,
                username=username,
                password=password,
                ssl_mode=ssl_mode,
                db_type=db_type,
            )

            logger.info(
                f"Created connection handle: {handle[:8]}... "
                f"host_hash={self._hash_host(host)} db={database}"
            )

            return handle

    def get_connection(self, handle: str) -> ConnectionInfo | None:
        """Get connection info for a handle.

        Args:
            handle: Connection handle UUID

        Returns:
            ConnectionInfo if valid, None if expired or not found
        """
        with self._lock:
            # Cleanup expired handles
            self._cleanup_expired()

            info = self._store.get(handle)
            if info is None:
                return None

            if info.is_expired():
                del self._store[handle]
                return None

            # Track request
            info.increment_request_count()
            return info

    def delete_handle(self, handle: str) -> bool:
        """Delete a connection handle.

        Args:
            handle: Connection handle UUID

        Returns:
            True if deleted, False if not found
        """
        with self._lock:
            if handle in self._store:
                del self._store[handle]
                logger.info(f"Deleted connection handle: {handle[:8]}...")
                return True
            return False

    def get_stats(self) -> dict[str, Any]:
        """Get store statistics for monitoring."""
        with self._lock:
            self._cleanup_expired()
            return {
                "active_handles": len(self._store),
                "max_handles": MAX_HANDLES,
            }


# Global singleton instance
_connection_store: ConnectionStore | None = None


def get_connection_store() -> ConnectionStore:
    """Get the global connection store instance."""
    global _connection_store
    if _connection_store is None:
        _connection_store = ConnectionStore()
    return _connection_store
