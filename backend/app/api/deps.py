"""Shared request dependencies.

The filter query parameters live here rather than being repeated across the
transactions and analytics routes — both endpoints must interpret an identical
query string identically, or the charts and the table would disagree.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from functools import lru_cache

from fastapi import Depends, Query

from app.core.config import get_settings
from app.db.session import get_cursor
from app.models.filters import SortField, SortOrder, TransactionFilters


@lru_cache(maxsize=1)
def _demo_user_id() -> int:
    """Resolve the single seeded user once.

    No auth in this build (see ASSUMPTIONS.md), but every query is still scoped
    by user_id, so introducing real sessions later means changing this function
    rather than every query in the codebase.
    """
    settings = get_settings()
    with get_cursor() as cur:
        cur.execute("SELECT id FROM users WHERE email = %s", [settings.demo_user_email])
        row = cur.fetchone()
        if row is None:
            raise RuntimeError(
                f"No user {settings.demo_user_email!r}. Has the seed been run? "
                "See README: python -m scripts.seed"
            )
        return int(row["id"])


def current_user_id() -> int:
    return _demo_user_id()


def filter_params(
    user_id: int = Depends(current_user_id),
    search: str | None = Query(None, description="Substring match on merchant name"),
    # Repeated params (?category=A&category=B) rather than comma-separated, so
    # a merchant or category containing a comma can never be mis-split.
    category: list[str] = Query(default=[]),
    status: list[str] = Query(default=[]),
    payment_method: list[str] = Query(default=[]),
    merchant: list[str] = Query(default=[]),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    amount_min: Decimal | None = Query(None),
    amount_max: Decimal | None = Query(None),
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$", description="YYYY-MM"),
    only_refunds: bool | None = Query(None),
    include_outliers: bool = Query(True),
) -> TransactionFilters:
    return TransactionFilters(
        user_id=user_id,
        search=search,
        categories=category,
        statuses=status,
        payment_methods=payment_method,
        merchants=merchant,
        date_from=date_from,
        date_to=date_to,
        amount_min=amount_min,
        amount_max=amount_max,
        month=month,
        only_refunds=only_refunds,
        include_outliers=include_outliers,
    )


def sort_params(
    sort: SortField = Query(SortField.DATE),
    order: SortOrder = Query(SortOrder.DESC),
) -> tuple[SortField, SortOrder]:
    return sort, order
