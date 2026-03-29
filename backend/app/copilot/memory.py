"""Cross-session copilot memory — heuristic extraction and injection of learned patterns.

Extracts SQL patterns, column usage, and error-to-fix pairs from each successful
copilot request.  Persists per-table (keyed by schema fingerprint) in DuckDB KV
storage.  Injects compact SQL-comment blocks into the system prompt alongside
schema hints.

Lifecycle: lazy singleton.  Memory is loaded from DuckDB on first access and
updated after each successful SQL-executing request.

Trust boundary: content derives from SQL queries and error messages — sanitized
before persistence to strip literals, IDs, and emails.
"""

from __future__ import annotations

import hashlib
import logging
import re
import threading
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("axis.copilot.memory")

_store_instance: CopilotMemoryStore | None = None

# ---------------------------------------------------------------------------
# Caps
# ---------------------------------------------------------------------------
_MAX_INJECTION_CHARS = 1000
_MAX_SQL_PATTERNS = 10
_MAX_COLUMN_FREQ = 15
_MAX_ERROR_FIXES = 5
_DECAY_FACTOR = 0.9
_MIN_HITS = 0.5

# ---------------------------------------------------------------------------
# Counters (logged at INFO for observability)
# ---------------------------------------------------------------------------
_counter_recorded = 0
_counter_injected = 0
_counter_pruned = 0


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def schema_fingerprint(store: Any, table_name: str) -> str:
    """Short hash of column names + types — changes when schema changes.

    Used by both agents and the request router to key memory storage.
    """
    meta = store.get_metadata(table_name)
    cols = sorted((c["column_name"], c.get("column_type", "")) for c in meta.get("columns", []))
    return hashlib.sha256(str(cols).encode()).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _sanitize_for_storage(text: str) -> str:
    """Strip literals, IDs, emails from text before persistence."""
    text = re.sub(r"'[^']*'", "'?'", text)  # SQL string literals
    text = re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "<id>", text, flags=re.I
    )
    text = re.sub(r"\S+@\S+\.\S+", "<email>", text)  # emails
    text = re.sub(r"\b\d{4,}\b", "<num>", text)  # long numbers
    return text[:120]


def _now_iso() -> str:
    return datetime.now(tz=UTC).isoformat()


def _empty_blob() -> dict[str, Any]:
    return {
        "version": 1,
        "sql_patterns": [],
        "column_freq": {},
        "error_fixes": [],
    }


# ---------------------------------------------------------------------------
# SQL parsing (intentionally conservative — miss > hallucinate)
# ---------------------------------------------------------------------------

# SQL keywords to exclude from column name extraction
_SQL_KEYWORDS = frozenset(
    {
        "select",
        "from",
        "where",
        "group",
        "by",
        "order",
        "limit",
        "having",
        "and",
        "or",
        "not",
        "in",
        "is",
        "null",
        "as",
        "on",
        "join",
        "left",
        "right",
        "inner",
        "outer",
        "cross",
        "full",
        "union",
        "all",
        "distinct",
        "case",
        "when",
        "then",
        "else",
        "end",
        "between",
        "like",
        "ilike",
        "asc",
        "desc",
        "nulls",
        "first",
        "last",
        "with",
        "recursive",
        "insert",
        "update",
        "delete",
        "create",
        "drop",
        "alter",
        "table",
        "index",
        "view",
        "cast",
        "try_cast",
        "filter",
        "over",
        "partition",
        "count",
        "sum",
        "avg",
        "min",
        "max",
        "stddev",
        "median",
        "round",
        "coalesce",
        "generate_series",
        "json_extract",
        "json_extract_string",
        "json_array_length",
        "date_trunc",
        "quantile_cont",
        "approx_count_distinct",
        "current_timestamp",
        "bigint",
        "double",
        "varchar",
        "integer",
        "float",
        "boolean",
        "timestamp",
        "text",
        "true",
        "false",
    }
)

# Table names to exclude from column extraction
_KNOWN_TABLES = frozenset(
    {
        "monitoring_data",
        "eval_data",
        "human_signals_cases",
        "kpi_data",
        "axis_datasets",
        "_store_metadata",
    }
)


def _extract_sql_skeleton(sql: str) -> str | None:
    """Extract a normalized query skeleton from SQL.

    Returns a compact pattern string or None if nothing useful extracted.
    """
    parts: list[str] = []

    # Aggregation functions in SELECT
    select_match = re.search(r"SELECT\s+(.+?)\s+FROM", sql, re.I | re.S)
    if select_match:
        aggs = re.findall(
            r"(COUNT|AVG|SUM|MIN|MAX|STDDEV|MEDIAN|QUANTILE_CONT|APPROX_COUNT_DISTINCT)\s*\(",
            select_match.group(1),
            re.I,
        )
        if aggs:
            unique_aggs = sorted({a.upper() for a in aggs})
            parts.append("aggs: " + ", ".join(unique_aggs))

    # GROUP BY clause
    gb_match = re.search(
        r"GROUP\s+BY\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s+HAVING|$)",
        sql,
        re.I | re.S,
    )
    if gb_match:
        gb_text = gb_match.group(1).strip().rstrip(";")
        # Normalize: replace string literals
        gb_norm = re.sub(r"'[^']*'", "'?'", gb_text)
        parts.append("GROUP BY " + gb_norm[:120])

    # WHERE pattern (strip literal values)
    where_match = re.search(
        r"WHERE\s+(.+?)(?:\s+GROUP|\s+ORDER|\s+LIMIT|$)",
        sql,
        re.I | re.S,
    )
    if where_match:
        where_text = where_match.group(1).strip()
        normalized = re.sub(r"'[^']*'", "?", where_text)
        normalized = re.sub(r"\b\d+\.?\d*\b", "?", normalized)
        parts.append("WHERE " + normalized[:120])

    return " | ".join(parts) if parts else None


def _extract_columns(sql: str, known_columns: set[str]) -> list[str]:
    """Extract column names from SQL, filtering against known columns.

    Intentionally conservative — only returns names that actually exist
    in the table schema.
    """
    # Double-quoted identifiers (DuckDB standard)
    quoted = set(re.findall(r'"(\w+)"', sql))

    # Unquoted identifiers — broad capture, then filter
    unquoted = set(re.findall(r"\b([A-Za-z_]\w*)\b", sql))

    candidates = quoted | unquoted

    # Remove SQL keywords, table names, and aliases
    candidates -= _SQL_KEYWORDS
    candidates -= _KNOWN_TABLES
    # Also remove case-insensitive matches
    candidates = {c for c in candidates if c.lower() not in _SQL_KEYWORDS}
    candidates = {c for c in candidates if c.lower() not in _KNOWN_TABLES}

    # Intersect with known columns (case-insensitive)
    known_lower = {c.lower(): c for c in known_columns}
    return [known_lower[c.lower()] for c in candidates if c.lower() in known_lower]


# ---------------------------------------------------------------------------
# CopilotMemoryStore
# ---------------------------------------------------------------------------


class CopilotMemoryStore:
    """Singleton store for cross-session copilot memory.

    Follows the same pattern as ``SchemaHintsStore`` and ``MetricCatalogStore``.
    """

    def __init__(self) -> None:
        """Initialize with empty caches and locks."""
        self._cache: dict[str, dict[str, Any]] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._global_lock = threading.Lock()

    @classmethod
    def reset_instance(cls) -> None:
        """Reset singleton — for testing only."""
        global _store_instance
        _store_instance = None

    def _get_lock(self, key: str) -> threading.Lock:
        """Lazy per-key lock creation (protected by global lock)."""
        if key not in self._locks:
            with self._global_lock:
                if key not in self._locks:
                    self._locks[key] = threading.Lock()
        return self._locks[key]

    def _kv_key(self, table_name: str, schema_fp: str, agent_name: str | None = None) -> str:
        base = f"copilot_memory:{table_name}:{schema_fp}"
        if agent_name:
            return f"{base}:{agent_name}"
        return base

    def _load(self, kv_key: str) -> dict[str, Any]:
        """Load memory blob from hot cache or DuckDB KV."""
        if kv_key in self._cache:
            return self._cache[kv_key]

        from app.services.duckdb_store import get_store

        raw = get_store().get_kv(kv_key)
        if isinstance(raw, dict) and raw.get("version") == 1:
            self._cache[kv_key] = raw
            return raw

        blob = _empty_blob()
        self._cache[kv_key] = blob
        return blob

    def _save(self, kv_key: str, blob: dict[str, Any]) -> None:
        """Persist memory blob to DuckDB KV and update hot cache."""
        from app.services.duckdb_store import get_store

        get_store().set_kv(kv_key, blob)
        self._cache[kv_key] = blob

    def record(
        self,
        table_name: str,
        schema_fp: str,
        turn_sql: str,
        error_fixes: list[dict[str, str]] | None = None,
        known_columns: set[str] | None = None,
        agent_name: str | None = None,
    ) -> None:
        """Extract and store memory from a completed request.

        All sanitization happens here — callers pass raw data.
        Thread-safe via per-key locking.  When ``agent_name`` is provided,
        memory is scoped to that agent; otherwise it is global for the table.
        """
        global _counter_recorded, _counter_pruned

        kv_key = self._kv_key(table_name, schema_fp, agent_name)
        lock = self._get_lock(kv_key)

        with lock:
            blob = self._load(kv_key)

            # --- Decay all existing hits ---
            for entry in blob.get("sql_patterns", []):
                entry["hits"] = entry.get("hits", 1.0) * _DECAY_FACTOR
            for col in list(blob.get("column_freq", {})):
                blob["column_freq"][col] *= _DECAY_FACTOR
            for entry in blob.get("error_fixes", []):
                entry["hits"] = entry.get("hits", 1.0) * _DECAY_FACTOR

            # --- Extract and merge SQL pattern ---
            skeleton = _extract_sql_skeleton(turn_sql)
            if skeleton:
                sanitized_skeleton = _sanitize_for_storage(skeleton)
                patterns = blob.get("sql_patterns", [])
                found = False
                for p in patterns:
                    if p["pattern"] == sanitized_skeleton:
                        p["hits"] = p.get("hits", 0.0) + 1.0
                        p["last_seen"] = _now_iso()
                        found = True
                        break
                if not found:
                    patterns.append(
                        {
                            "pattern": sanitized_skeleton,
                            "hits": 1.0,
                            "last_seen": _now_iso(),
                        }
                    )
                blob["sql_patterns"] = patterns

            # --- Extract and merge column frequency ---
            cols = _extract_columns(turn_sql, known_columns or set())
            freq = blob.get("column_freq", {})
            for col in cols:
                freq[col] = freq.get(col, 0.0) + 1.0
            blob["column_freq"] = freq

            # --- Merge error fixes (sanitize here, not at call site) ---
            if error_fixes:
                existing_fixes = blob.get("error_fixes", [])
                for ef in error_fixes:
                    sanitized_error = _sanitize_for_storage(ef.get("error", ""))
                    sanitized_fix = _sanitize_for_storage(ef.get("fix", ""))
                    if not sanitized_fix:
                        continue
                    found = False
                    for ex in existing_fixes:
                        if ex["fix"] == sanitized_fix:
                            ex["hits"] = ex.get("hits", 0.0) + 1.0
                            ex["last_seen"] = _now_iso()
                            found = True
                            break
                    if not found:
                        existing_fixes.append(
                            {
                                "error": sanitized_error,
                                "fix": sanitized_fix,
                                "hits": 1.0,
                                "last_seen": _now_iso(),
                            }
                        )
                blob["error_fixes"] = existing_fixes

            # --- Prune below threshold ---
            pre_count = (
                len(blob.get("sql_patterns", []))
                + len(blob.get("column_freq", {}))
                + len(blob.get("error_fixes", []))
            )

            blob["sql_patterns"] = [
                p for p in blob.get("sql_patterns", []) if p.get("hits", 0) >= _MIN_HITS
            ]
            blob["column_freq"] = {
                c: v for c, v in blob.get("column_freq", {}).items() if v >= _MIN_HITS
            }
            blob["error_fixes"] = [
                f for f in blob.get("error_fixes", []) if f.get("hits", 0) >= _MIN_HITS
            ]

            post_count = (
                len(blob["sql_patterns"]) + len(blob["column_freq"]) + len(blob["error_fixes"])
            )
            pruned = pre_count - post_count
            if pruned > 0:
                _counter_pruned += pruned

            # --- Enforce caps ---
            blob["sql_patterns"] = sorted(blob["sql_patterns"], key=lambda p: -p.get("hits", 0))[
                :_MAX_SQL_PATTERNS
            ]

            if len(blob["column_freq"]) > _MAX_COLUMN_FREQ:
                top = sorted(blob["column_freq"].items(), key=lambda x: -x[1])[:_MAX_COLUMN_FREQ]
                blob["column_freq"] = dict(top)

            blob["error_fixes"] = sorted(blob["error_fixes"], key=lambda f: -f.get("hits", 0))[
                :_MAX_ERROR_FIXES
            ]

            # --- Persist ---
            self._save(kv_key, blob)
            _counter_recorded += 1

        logger.info(
            "Memory recorded for %s (patterns=%d, cols=%d, fixes=%d, pruned=%d)",
            kv_key,
            len(blob.get("sql_patterns", [])),
            len(blob.get("column_freq", {})),
            len(blob.get("error_fixes", [])),
            pruned,
        )

    def _load_blob(
        self, table_name: str, schema_fp: str, agent_name: str | None = None
    ) -> tuple[dict[str, Any], str]:
        """Load blob and compute scope label. Shared by compact/full renderers."""
        from app.config.env import settings

        if not settings.copilot_memory_enabled:
            return _empty_blob(), ""

        kv_key = self._kv_key(table_name, schema_fp, agent_name)
        blob = self._load(kv_key)
        scope = f"{table_name}/{agent_name}" if agent_name else table_name
        return blob, scope

    def get_compact_injection(
        self, table_name: str, schema_fp: str, agent_name: str | None = None
    ) -> str:
        """Render a compact always-on memory block (~200 chars).

        Includes only frequently queried columns and error fixes — enough to
        prevent repeat mistakes without bloating the prompt.  The LLM can call
        ``recall_memory`` for full SQL patterns.
        """
        global _counter_injected

        blob, scope = self._load_blob(table_name, schema_fp, agent_name)
        if not blob.get("column_freq") and not blob.get("error_fixes"):
            return ""

        parts: list[str] = [f"-- Session memory ({scope}):"]

        # Top columns only
        freq = blob.get("column_freq", {})
        if freq:
            top_cols = sorted(freq.items(), key=lambda x: -x[1])[:8]
            parts.append(f"-- Frequently queried: {', '.join(c for c, _ in top_cols)}")

        # Error fixes only (top 2)
        fixes = sorted(blob.get("error_fixes", []), key=lambda f: -f.get("hits", 0))
        for f in fixes[:2]:
            parts.append(f"-- Fix: {f['fix'][:100]}")

        has_patterns = bool(blob.get("sql_patterns"))
        if has_patterns:
            parts.append("-- (call recall_memory for full SQL patterns)")

        _counter_injected += 1
        return "\n".join(parts)

    def get_full_memory(
        self, table_name: str, schema_fp: str, agent_name: str | None = None
    ) -> str:
        """Render full memory for the ``recall_memory`` tool.

        Includes SQL patterns, column frequency, and error fixes — everything
        the compact injection omits.
        """
        blob, scope = self._load_blob(table_name, schema_fp, agent_name)
        if (
            not blob.get("sql_patterns")
            and not blob.get("column_freq")
            and not blob.get("error_fixes")
        ):
            return "No memory recorded for this dataset yet."

        parts: list[str] = [f"Session memory ({scope}):"]
        entry_count = 0

        # Column frequency
        freq = blob.get("column_freq", {})
        if freq:
            top_cols = sorted(freq.items(), key=lambda x: -x[1])[:_MAX_COLUMN_FREQ]
            col_list = ", ".join(f"{c} ({v:.0f}x)" for c, v in top_cols)
            parts.append(f"Frequently queried columns: {col_list}")
            entry_count += len(top_cols)

        # SQL patterns (full list)
        patterns = sorted(blob.get("sql_patterns", []), key=lambda p: -p.get("hits", 0))
        if patterns:
            parts.append("Successful SQL patterns:")
            for p in patterns[:_MAX_SQL_PATTERNS]:
                parts.append(f"  ({p['hits']:.0f}x) {p['pattern'][:200]}")
                entry_count += 1

        # Error fixes (full list)
        fixes = sorted(blob.get("error_fixes", []), key=lambda f: -f.get("hits", 0))
        if fixes:
            parts.append("Known error fixes:")
            for f in fixes[:_MAX_ERROR_FIXES]:
                parts.append(f"  ({f['hits']:.0f}x) {f['error'][:100]} → {f['fix'][:100]}")
                entry_count += 1

        parts.append(f"({entry_count} entries)")
        return "\n".join(parts)


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------


def get_copilot_memory_store() -> CopilotMemoryStore:
    """Lazy singleton accessor."""
    global _store_instance
    if _store_instance is None:
        _store_instance = CopilotMemoryStore()
    return _store_instance
