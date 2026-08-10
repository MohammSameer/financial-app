"""Transaction endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import current_user_id, filter_params, sort_params
from app.models.filters import SortField, SortOrder, TransactionFilters
from app.models.schemas import Transaction, TransactionPage
from app.services import transactions as service

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=TransactionPage)
def list_transactions(
    filters: TransactionFilters = Depends(filter_params),
    sorting: tuple[SortField, SortOrder] = Depends(sort_params),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> dict:
    """A page of transactions, with totals across the whole filtered set.

    Filtering, sorting and paging all happen in Postgres. The browser receives
    one page, so response size and render cost stay flat whether the history
    holds 10,000 rows or 10 million.
    """
    sort, order = sorting
    return service.list_transactions(
        filters, page=page, page_size=page_size, sort=sort, order=order
    )


@router.get("/{transaction_id}")
def get_transaction(
    transaction_id: int, user_id: int = Depends(current_user_id)
) -> dict:
    """Full detail for one transaction, for the drawer.

    Includes any other transactions sharing its external id, so the collision
    flag comes with its own explanation.
    """
    result = service.get_transaction(user_id, transaction_id)
    return {
        "transaction": Transaction.model_validate(result["transaction"]),
        "id_collision_siblings": [
            Transaction.model_validate(row) for row in result["id_collision_siblings"]
        ],
    }
