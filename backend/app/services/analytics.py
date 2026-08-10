"""Analytics business logic."""

from __future__ import annotations

from decimal import Decimal

from app.models.filters import TransactionFilters
from app.repositories import analytics as repo
from app.repositories import transactions as txn_repo


def summary(filters: TransactionFilters) -> dict:
    by_category = repo.by_category(filters)
    by_month = repo.by_month(filters)
    totals = txn_repo.fetch_totals(filters)

    # Percentage share is computed here rather than in SQL (a window function
    # would do it) and rather than in the browser. Doing it once server-side
    # means the pie legend, the tooltip and any future export all quote the
    # same number.
    grand_total = sum((Decimal(row["total"]) for row in by_category), Decimal(0))
    for row in by_category:
        row["share"] = (
            float(Decimal(row["total"]) / grand_total * 100) if grand_total else 0.0
        )

    return {"by_category": by_category, "by_month": by_month, "totals": totals}
