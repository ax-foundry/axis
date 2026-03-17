"""Datasets router — CRUD and download for copilot-saved datasets."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel

from app.services.duckdb_store import get_store

logger = logging.getLogger(__name__)

router = APIRouter()


class CreateDatasetRequest(BaseModel):
    """Request body for creating a dataset from SQL."""

    name: str
    sql: str
    description: str | None = None
    tags: list[str] = []
    max_rows: int = 10_000


@router.get("/")
async def list_datasets(
    user_id: str | None = Query(default=None, description="Filter to datasets owned by this user"),
) -> list[dict[str, Any]]:
    """List saved datasets. Pass ?user_id= to show only that user's datasets."""
    return get_store().list_datasets(user_id=user_id)


@router.post("/")
async def create_dataset(req: CreateDatasetRequest) -> dict[str, Any]:
    """Materialize a SQL query as a named, persisted dataset."""
    try:
        return get_store().create_dataset_from_sql(
            name=req.name,
            sql=req.sql,
            description=req.description,
            tags=req.tags,
            max_rows=req.max_rows,
        )
    except Exception as exc:
        logger.exception("Failed to create dataset")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{dataset_id}")
async def get_dataset(dataset_id: str) -> dict[str, Any]:
    """Return metadata for one saved dataset."""
    ds = get_store().get_dataset(dataset_id)
    if ds is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return ds


@router.delete("/{dataset_id}")
async def delete_dataset(dataset_id: str) -> dict[str, Any]:
    """Delete a saved dataset."""
    ok = get_store().delete_dataset(dataset_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"deleted": True, "dataset_id": dataset_id}


@router.get("/{dataset_id}/download")
async def download_dataset(dataset_id: str) -> Response:
    """Download a saved dataset as CSV."""
    csv = get_store().get_dataset_as_csv(dataset_id)
    if csv is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return Response(
        content=csv,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{dataset_id}.csv"'},
    )
