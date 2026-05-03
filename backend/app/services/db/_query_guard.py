"""Shared read-only SQL guard used by all database backends."""

import re

from app.services.db._errors import DatabaseBackendError

# Comments stripped before keyword matching
_SINGLE_LINE_COMMENT = re.compile(r"--[^\n]*")
_MULTI_LINE_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)

# First non-blank token must be SELECT or WITH
_READ_ALLOWLIST = re.compile(r"^\s*(SELECT|WITH)\b", re.IGNORECASE)

# Any of these keywords appearing anywhere in the query is a sign of mutation
_MUTATION_PATTERN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|CALL|EXEC)\b",
    re.IGNORECASE,
)


def assert_read_only(sql: str) -> None:
    """Raise DatabaseBackendError if *sql* is not a read-only SELECT/WITH query.

    Strips SQL comments before checking so that ``-- INSERT`` style tricks
    don't bypass the guard.

    Raises:
        DatabaseBackendError: If the query contains mutation keywords or does
            not begin with SELECT/WITH.
    """
    # Strip comments
    cleaned = _SINGLE_LINE_COMMENT.sub("", sql)
    cleaned = _MULTI_LINE_COMMENT.sub("", cleaned).strip()

    if not cleaned:
        raise DatabaseBackendError("Query cannot be empty.")

    if not _READ_ALLOWLIST.match(cleaned):
        raise DatabaseBackendError("Only SELECT statements are allowed.")

    if _MUTATION_PATTERN.search(cleaned):
        raise DatabaseBackendError("Only SELECT statements are allowed.")
