import logging
from typing import Any

import anyio
from fastapi import APIRouter, HTTPException

from app.config.constants import Columns, Thresholds
from app.services.duckdb_store import get_store

logger = logging.getLogger(__name__)

router = APIRouter()

TABLE = "eval_data"

# Index columns excluded from auto-detected metrics
INDEX_COLUMNS = set(Columns.INDEX_COLUMNS)


def _ensure_table() -> None:
    """Raise 503/404 if eval_data not available."""
    get_store().ensure_ready(TABLE, "Eval data")


def _clean(v: Any) -> float | None:
    """Clean NaN/Inf for JSON."""
    return get_store().clean_value(v)


@router.post("/summary")
async def get_summary_stats(data: list[dict[str, Any]]) -> dict[str, object]:
    """Calculate summary statistics for metrics.

    Accepts POST body for backward compat with uploaded data.
    If DuckDB has eval_data, queries that instead.
    """
    store = get_store()

    # If DuckDB has data, query it
    if store.has_table(TABLE):
        table_cols = store.get_table_columns(TABLE)
        # Find numeric metric columns by checking column types
        meta = store.get_metadata(TABLE)
        numeric_cols = []
        if meta and "columns" in meta:
            for c in meta["columns"]:
                name = c["column_name"]
                ctype = c["column_type"].upper()
                if name not in INDEX_COLUMNS and any(
                    t in ctype for t in ["DOUBLE", "FLOAT", "INTEGER", "BIGINT", "DECIMAL"]
                ):
                    numeric_cols.append(name)

        if not numeric_cols:
            return {"success": True, "summary": [], "total_records": 0}

        def _query() -> tuple[list[dict[str, Any]], int]:
            total = store.query_value(f"SELECT COUNT(*) FROM {TABLE}") or 0
            summary = []
            for col in numeric_cols:
                if col not in table_cols:
                    continue
                row = store.query_list(
                    f"""
                    SELECT
                        AVG(CAST({col} AS DOUBLE)) AS mean_val,
                        STDDEV_SAMP(CAST({col} AS DOUBLE)) AS std_val,
                        MIN(CAST({col} AS DOUBLE)) AS min_val,
                        MAX(CAST({col} AS DOUBLE)) AS max_val,
                        COUNT({col}) AS cnt,
                        COUNT(*) FILTER (WHERE CAST({col} AS DOUBLE) >= ?) * 1.0 / NULLIF(COUNT({col}), 0) AS pass_rate
                    FROM {TABLE}
                    WHERE {col} IS NOT NULL
                """,
                    [Thresholds.PASSING_RATE],
                )
                if row and row[0]["cnt"] > 0:
                    r = row[0]
                    summary.append(
                        {
                            "metric_name": col,
                            "mean": _clean(r["mean_val"]) or 0.0,
                            "std": _clean(r["std_val"]) or 0.0,
                            "min": _clean(r["min_val"]) or 0.0,
                            "max": _clean(r["max_val"]) or 0.0,
                            "count": int(r["cnt"]),
                            "passing_rate": _clean(r["pass_rate"]) or 0.0,
                        }
                    )
            return summary, total

        summary, total = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)
        return {"success": True, "summary": summary, "total_records": total}

    # Fallback: use POST body data (backward compat)
    import numpy as np
    import pandas as pd

    try:
        df = pd.DataFrame(data)
        numeric_cols_list = df.select_dtypes(include=[np.number]).columns
        metric_cols = [c for c in numeric_cols_list if c not in INDEX_COLUMNS]

        summary = []
        for col in metric_cols:
            values = df[col].dropna()
            if len(values) > 0:
                summary.append(
                    {
                        "metric_name": col,
                        "mean": float(values.mean()),
                        "std": float(values.std()) if len(values) > 1 else 0,
                        "min": float(values.min()),
                        "max": float(values.max()),
                        "count": len(values),
                        "passing_rate": float((values >= Thresholds.PASSING_RATE).mean()),
                    }
                )
        return {"success": True, "summary": summary, "total_records": len(df)}
    except Exception as e:
        raise HTTPException(500, f"Summary error: {e!s}")


@router.post("/distribution")
async def get_distribution_data(
    data: list[dict[str, Any]], metric: str, bins: int = 20
) -> dict[str, object]:
    """Get distribution data for a specific metric."""
    store = get_store()

    if store.has_table(TABLE):
        table_cols = store.get_table_columns(TABLE)
        if metric not in table_cols:
            raise HTTPException(400, f"Metric '{metric}' not found")

        def _query() -> dict[str, Any]:
            # Get values for histogram
            values = store.query_df(
                f"SELECT CAST({metric} AS DOUBLE) AS val FROM {TABLE} WHERE {metric} IS NOT NULL"
            )["val"].tolist()

            stats = store.query_list(f"""
                SELECT
                    AVG(CAST({metric} AS DOUBLE)) AS mean_val,
                    quantile_cont(CAST({metric} AS DOUBLE), 0.5) AS median_val,
                    STDDEV_SAMP(CAST({metric} AS DOUBLE)) AS std_val,
                    quantile_cont(CAST({metric} AS DOUBLE), 0.25) AS q25,
                    quantile_cont(CAST({metric} AS DOUBLE), 0.75) AS q75
                FROM {TABLE}
                WHERE {metric} IS NOT NULL
            """)
            return {"values": values, "stats": stats[0] if stats else {}}

        result = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)
        values = result["values"]
        s = result["stats"]

        import numpy as np

        arr = np.array(values)
        hist, bin_edges = np.histogram(arr, bins=bins)

        return {
            "success": True,
            "metric": metric,
            "values": values,
            "histogram": {"counts": hist.tolist(), "bin_edges": bin_edges.tolist()},
            "stats": {
                "mean": _clean(s.get("mean_val")) or 0.0,
                "median": _clean(s.get("median_val")) or 0.0,
                "std": _clean(s.get("std_val")) or 0.0,
                "q25": _clean(s.get("q25")) or 0.0,
                "q75": _clean(s.get("q75")) or 0.0,
            },
        }

    # Fallback
    import numpy as np
    import pandas as pd

    try:
        df = pd.DataFrame(data)
        if metric not in df.columns:
            raise HTTPException(400, f"Metric '{metric}' not found")
        values = df[metric].dropna()
        hist, bin_edges = np.histogram(values, bins=bins)
        return {
            "success": True,
            "metric": metric,
            "values": values.tolist(),
            "histogram": {"counts": hist.tolist(), "bin_edges": bin_edges.tolist()},
            "stats": {
                "mean": float(values.mean()),
                "median": float(values.median()),
                "std": float(values.std()) if len(values) > 1 else 0,
                "q25": float(values.quantile(0.25)),
                "q75": float(values.quantile(0.75)),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Distribution error: {e!s}")


@router.post("/comparison")
async def get_comparison_data(
    data: list[dict[str, Any]], group_by: str, metrics: list[str] | None = None
) -> dict[str, object]:
    """Get data for comparing metrics across groups."""
    store = get_store()

    if store.has_table(TABLE):
        table_cols = store.get_table_columns(TABLE)
        if group_by not in table_cols:
            raise HTTPException(400, f"Group column '{group_by}' not found")

        # Auto-detect numeric columns if not specified
        if not metrics:
            meta = store.get_metadata(TABLE)
            metrics = []
            if meta and "columns" in meta:
                for c in meta["columns"]:
                    name = c["column_name"]
                    ctype = c["column_type"].upper()
                    if name not in INDEX_COLUMNS and any(
                        t in ctype for t in ["DOUBLE", "FLOAT", "INTEGER", "BIGINT"]
                    ):
                        metrics.append(name)

        valid_metrics = [m for m in metrics if m in table_cols]

        def _query() -> tuple[list[dict[str, Any]], list[str]]:
            comparison = []
            groups = store.query_list(
                f"SELECT DISTINCT CAST({group_by} AS VARCHAR) AS grp FROM {TABLE} WHERE {group_by} IS NOT NULL"
            )
            group_names = [r["grp"] for r in groups]

            for grp_name in group_names:
                group_stats: dict[str, Any] = {"group": grp_name}
                for m in valid_metrics:
                    row = store.query_list(
                        f"""
                        SELECT
                            AVG(CAST({m} AS DOUBLE)) AS mean_val,
                            STDDEV_SAMP(CAST({m} AS DOUBLE)) AS std_val,
                            COUNT({m}) AS cnt
                        FROM {TABLE}
                        WHERE {group_by} = ? AND {m} IS NOT NULL
                    """,
                        [grp_name],
                    )
                    if row and row[0]["cnt"] > 0:
                        r = row[0]
                        group_stats[m] = {
                            "mean": _clean(r["mean_val"]),
                            "std": _clean(r["std_val"]) or 0,
                            "count": int(r["cnt"]),
                        }
                comparison.append(group_stats)
            return comparison, group_names

        db_comparison, group_names = await anyio.to_thread.run_sync(
            _query, limiter=store.query_limiter
        )
        return {
            "success": True,
            "comparison": db_comparison,
            "metrics": valid_metrics,
            "groups": group_names,
        }

    # Fallback
    import numpy as np
    import pandas as pd

    try:
        df = pd.DataFrame(data)
        if group_by not in df.columns:
            raise HTTPException(400, f"Group column '{group_by}' not found")
        if metrics is None:
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            metrics = [c for c in numeric_cols if c not in INDEX_COLUMNS]
        comparison: list[dict[str, Any]] = []
        for group_name, group_df in df.groupby(group_by):
            group_stats: dict[str, Any] = {"group": group_name}
            for m in metrics:
                if m in group_df.columns:
                    values = group_df[m].dropna()
                    group_stats[m] = {
                        "mean": float(values.mean()) if len(values) > 0 else None,
                        "std": float(values.std()) if len(values) > 1 else 0,
                        "count": len(values),
                    }
            comparison.append(group_stats)
        return {
            "success": True,
            "comparison": comparison,
            "metrics": metrics,
            "groups": df[group_by].unique().tolist(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Comparison error: {e!s}")


@router.post("/correlation")
async def get_correlation_matrix(
    data: list[dict[str, Any]], metrics: list[str] | None = None
) -> dict[str, object]:
    """Calculate correlation matrix for metrics."""
    store = get_store()

    if store.has_table(TABLE):
        table_cols = store.get_table_columns(TABLE)
        if metrics is None:
            meta = store.get_metadata(TABLE)
            metrics = []
            if meta and "columns" in meta:
                for c in meta["columns"]:
                    name = c["column_name"]
                    ctype = c["column_type"].upper()
                    if name not in INDEX_COLUMNS and any(
                        t in ctype for t in ["DOUBLE", "FLOAT", "INTEGER", "BIGINT"]
                    ):
                        metrics.append(name)

        valid_metrics = [m for m in metrics if m in table_cols]
        if len(valid_metrics) < 2:
            raise HTTPException(400, "Need at least 2 metrics for correlation")

        select_cols = ", ".join(f"CAST({m} AS DOUBLE) AS {m}" for m in valid_metrics)
        sql = f"SELECT {select_cols} FROM {TABLE}"

        def _query() -> dict[str, Any]:
            df = store.query_df(sql)
            corr = df.corr()
            result: dict[str, Any] = corr.to_dict()  # type: ignore[assignment]
            return result

        corr_dict = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)
        return {"success": True, "correlation": corr_dict, "metrics": valid_metrics}

    # Fallback
    import numpy as np
    import pandas as pd

    try:
        df = pd.DataFrame(data)
        if metrics is None:
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            metrics = [c for c in numeric_cols if c not in INDEX_COLUMNS]
        valid_metrics = [m for m in metrics if m in df.columns]
        if len(valid_metrics) < 2:
            raise HTTPException(400, "Need at least 2 metrics for correlation")
        corr_matrix = df[valid_metrics].corr()
        return {"success": True, "correlation": corr_matrix.to_dict(), "metrics": valid_metrics}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Correlation error: {e!s}")


@router.post("/radar")
async def get_radar_data(
    data: list[dict[str, Any]], metrics: list[str], group_by: str | None = None
) -> dict[str, object]:
    """Prepare data for radar chart visualization."""
    store = get_store()

    if store.has_table(TABLE):
        table_cols = store.get_table_columns(TABLE)
        valid_metrics = [m for m in metrics if m in table_cols]
        if len(valid_metrics) < 3:
            raise HTTPException(400, "Need at least 3 metrics for radar chart")

        def _query() -> list[dict[str, Any]]:
            if group_by and group_by in table_cols:
                traces = []
                groups = store.query_list(
                    f"SELECT DISTINCT CAST({group_by} AS VARCHAR) AS grp FROM {TABLE}"
                )
                for g in groups:
                    avgs = []
                    for m in valid_metrics:
                        r = store.query_value(
                            f"SELECT AVG(CAST({m} AS DOUBLE)) FROM {TABLE} WHERE {group_by} = ?",
                            [g["grp"]],
                        )
                        avgs.append(_clean(r) or 0.0)
                    traces.append({"name": g["grp"], "values": avgs})
                return traces
            else:
                avgs = []
                for m in valid_metrics:
                    r = store.query_value(f"SELECT AVG(CAST({m} AS DOUBLE)) FROM {TABLE}")
                    avgs.append(_clean(r) or 0.0)
                return [{"name": "Overall", "values": avgs}]

        traces = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)
        return {"success": True, "metrics": valid_metrics, "traces": traces}

    # Fallback
    import pandas as pd

    try:
        df = pd.DataFrame(data)
        valid_metrics = [m for m in metrics if m in df.columns]
        if len(valid_metrics) < 3:
            raise HTTPException(400, "Need at least 3 metrics for radar chart")
        if group_by and group_by in df.columns:
            traces = []
            for group_name, group_df in df.groupby(group_by):
                values = [float(group_df[m].mean()) for m in valid_metrics]
                traces.append({"name": str(group_name), "values": values})
            return {"success": True, "metrics": valid_metrics, "traces": traces}
        else:
            values = [float(df[m].mean()) for m in valid_metrics]
            return {
                "success": True,
                "metrics": valid_metrics,
                "traces": [{"name": "Overall", "values": values}],
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Radar error: {e!s}")


@router.post("/scatter")
async def get_scatter_data(
    data: list[dict[str, Any]], x_metric: str, y_metric: str, color_by: str | None = None
) -> dict[str, object]:
    """Prepare data for scatter plot visualization."""
    store = get_store()

    if store.has_table(TABLE):
        table_cols = store.get_table_columns(TABLE)
        if x_metric not in table_cols:
            raise HTTPException(400, f"X metric '{x_metric}' not found")
        if y_metric not in table_cols:
            raise HTTPException(400, f"Y metric '{y_metric}' not found")

        select = f"CAST({x_metric} AS DOUBLE) AS x, CAST({y_metric} AS DOUBLE) AS y"
        if color_by and color_by in table_cols:
            select += f", CAST({color_by} AS VARCHAR) AS color"
        if Columns.DATASET_ID in table_cols:
            select += f", {Columns.DATASET_ID} AS id"

        sql = f"SELECT {select} FROM {TABLE}"

        def _query() -> list[dict[str, Any]]:
            return store.query_list(sql)

        rows = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)

        result: dict[str, Any] = {
            "success": True,
            "x": [r["x"] for r in rows],
            "y": [r["y"] for r in rows],
            "x_metric": x_metric,
            "y_metric": y_metric,
        }
        if color_by and "color" in (rows[0] if rows else {}):
            result["color"] = [r["color"] for r in rows]
            result["color_by"] = color_by
        if "id" in (rows[0] if rows else {}):
            result["ids"] = [r["id"] for r in rows]
        return result

    # Fallback
    import pandas as pd

    try:
        df = pd.DataFrame(data)
        if x_metric not in df.columns:
            raise HTTPException(400, f"X metric '{x_metric}' not found")
        if y_metric not in df.columns:
            raise HTTPException(400, f"Y metric '{y_metric}' not found")
        result = {
            "success": True,
            "x": df[x_metric].tolist(),
            "y": df[y_metric].tolist(),
            "x_metric": x_metric,
            "y_metric": y_metric,
        }
        if color_by and color_by in df.columns:
            result["color"] = df[color_by].tolist()
            result["color_by"] = color_by
        if Columns.DATASET_ID in df.columns:
            result["ids"] = df[Columns.DATASET_ID].tolist()
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Scatter error: {e!s}")
