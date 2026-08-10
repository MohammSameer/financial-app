"""Transaction business logic: paging arithmetic and detail assembly."""

from __future__ import annotations

import math

from app.core.config import get_settings
from app.models.filters import SortField, SortOrder, TransactionFilters
from app.repositories import transactions as repo
from app.services.errors import NotFound


def list_transactions(
    filters: TransactionFilters,
    *,
    page: int,
    page_size: int,
    sort: SortField,
    order: SortOrder,
) -> dict:
    settings = get_settings()
    page_size = max(1, min(page_size, settings.max_page_size))
    page = max(1, page)

    totals = repo.fetch_totals(filters)
    total = int(totals["transaction_count"])
    total_pages = max(1, math.ceil(total / page_size)) if total else 0

    # A filter change can leave the user on a page that no longer exists —
    # sitting on page 40 and then filtering down to 3 pages would otherwise
    # render an empty table that looks like a bug. Clamp instead, and report
    # the page actually served so the pagination control stays in sync.
    if total_pages and page > total_pages:
        page = total_pages

    items = repo.fetch_page(
        filters, page=page, page_size=page_size, sort=sort, order=order
    )

    return {
        "items": items,
        "meta": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1,
        },
        "totals": totals,
    }


def get_transaction(user_id: int, transaction_id: int) -> dict:
    row = repo.fetch_by_id(user_id, transaction_id)
    if row is None:
        raise NotFound("No such transaction.", transaction_id=transaction_id)

    # Only look for siblings when the row is actually flagged, so the common
    # case costs nothing.
    siblings = (
        repo.fetch_id_collision_siblings(user_id, row["external_id"], transaction_id)
        if row["is_id_collision"]
        else []
    )
    return {"transaction": row, "id_collision_siblings": siblings}
