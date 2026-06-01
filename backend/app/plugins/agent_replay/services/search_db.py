from __future__ import annotations

import logging
from dataclasses import dataclass

from app.plugins.agent_replay.config import get_replay_config
from app.services.db._registry import get_backend
from app.services.db._types import TableId

logger = logging.getLogger(__name__)


@dataclass
class TraceMatch:
    """A single trace ID returned from the lookup database."""

    trace_id: str
    agent_name: str | None = None


class SearchDBNotConfiguredError(Exception):
    """Raised when the search DB is not enabled or configured."""


class SearchDBQueryError(Exception):
    """Raised when a query against the search DB fails."""


def _canonicalize_agent_name(name: str) -> str:
    """Normalize agent name to match env var discovery format.

    ``discover_langfuse_agents()`` lowercases names and uses underscores,
    so ``"my-agent"`` becomes ``"my_agent"``.
    """
    return name.lower().replace("-", "_").strip()


async def lookup_trace_ids(
    search_value: str,
    agent_name: str | None = None,
    limit: int = 50,
    search_column: str | None = None,
) -> list[TraceMatch]:
    """Look up Langfuse trace IDs by a business field value.

    Args:
        search_value: The value to match in the configured search column.
        agent_name: Optional agent name to resolve per-agent table/columns.
        limit: Maximum number of results to return.
        search_column: Specific column to search in. Must be a key in the
            resolved ``search_columns`` dict.  If ``None``, the first
            configured column is used.

    Returns:
        List of ``TraceMatch`` objects (may be empty).

    Raises:
        SearchDBNotConfiguredError: If the DB is not enabled or lacks config.
        SearchDBQueryError: If the database query fails.
    """
    cfg = get_replay_config().search_db

    if not cfg.enabled:
        raise SearchDBNotConfiguredError(
            "Agent replay lookup database is not enabled. "
            "Set agent_replay_db.enabled=true in agent_replay_db.yaml."
        )
    if not cfg.is_configured:
        if cfg.db_type == "bigquery":
            raise SearchDBNotConfiguredError(
                "Agent replay lookup database is not configured. "
                "Add connection_params.dataset to agent_replay_db.yaml."
            )
        raise SearchDBNotConfiguredError(
            "Agent replay lookup database is not configured. "
            "Provide a url or host+database in agent_replay_db.yaml."
        )

    resolved = cfg.get_agent_config(agent_name)

    if not resolved.search_columns:
        raise SearchDBNotConfiguredError(
            "No search columns configured for field-based search. "
            "Add search_columns to agent_replay_db.yaml."
        )

    # Determine which column to use
    if search_column and search_column in resolved.search_columns:
        effective_column = search_column
    elif search_column and search_column not in resolved.search_columns:
        raise SearchDBNotConfiguredError(
            f"Search column {search_column!r} is not configured. "
            f"Available columns: {list(resolved.search_columns.keys())}"
        )
    else:
        # Default to first configured column
        effective_column = next(iter(resolved.search_columns))

    backend = get_backend(cfg.db_type)
    params = backend.build_connection_params(cfg)

    # Build query using dialect-agnostic helpers
    bp = backend.new_bound_params()
    search_placeholder = backend.bind_param(bp, search_value, name="search_value")

    # For BigQuery use connection_params.dataset as the schema so the table
    # reference becomes `project.dataset.table` rather than `project.public.table`.
    effective_schema = params.get("dataset") or resolved.schema
    table_id = TableId(
        project=params.get("project_id", ""),
        schema=effective_schema,
        table=resolved.table,
    )
    quoted_table = backend.quote_table_id(table_id)
    trace_col = backend.quote_identifier(resolved.trace_id_column)
    search_col = backend.quote_identifier(effective_column)

    safe_limit = max(1, int(limit))
    if resolved.agent_name_column:
        agent_col = backend.quote_identifier(resolved.agent_name_column)
        query_str = (
            f"SELECT {trace_col}, {agent_col} FROM {quoted_table} "
            f"WHERE {search_col} = {search_placeholder} LIMIT {safe_limit}"
        )
    else:
        query_str = (
            f"SELECT {trace_col} FROM {quoted_table} "
            f"WHERE {search_col} = {search_placeholder} LIMIT {safe_limit}"
        )

    bound = backend.to_params(bp)

    try:
        async with backend.pooled_connection(
            params,
            statement_timeout_ms=cfg.query_timeout * 1000,
            connect_timeout=cfg.connect_timeout,
            min_size=cfg.pool_min_size,
            max_size=cfg.pool_max_size,
        ) as conn:
            rows = await conn.fetch_all(query_str, bound)
    except Exception as exc:
        logger.exception("Agent replay DB lookup failed for %r", search_value)
        raise SearchDBQueryError(f"Database query failed: {exc}") from exc

    matches: list[TraceMatch] = []
    for row in rows:
        trace_id = row.get(resolved.trace_id_column)
        if not trace_id:
            continue
        row_agent_name = None
        if resolved.agent_name_column:
            raw_agent = row.get(resolved.agent_name_column)
            if raw_agent:
                row_agent_name = _canonicalize_agent_name(str(raw_agent))
        matches.append(TraceMatch(trace_id=str(trace_id), agent_name=row_agent_name))

    logger.info(
        "DB lookup for %r (agent=%s) returned %d match(es)",
        search_value,
        agent_name,
        len(matches),
    )
    return matches
