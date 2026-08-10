"""Analytics endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import filter_params
from app.models.filters import TransactionFilters
from app.models.schemas import Analytics
from app.services import analytics as service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=Analytics)
def summary(filters: TransactionFilters = Depends(filter_params)) -> dict:
    """Category breakdown, monthly trend and totals for the current filters.

    Takes the same query parameters as ``/transactions``. Both charts and the
    table therefore describe exactly the same set of rows, which is what makes
    the cross-filtering trustworthy: narrow the table and the charts reshape,
    click a chart and the table narrows.
    """
    return service.summary(filters)
