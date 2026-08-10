"""The transaction filter set, and the one place it becomes SQL.

Both the table and the charts are driven by the *same* filter object. That is
what makes cross-filtering two-way for free: clicking a pie slice adds a
category to these filters, and every panel — table, category breakdown, monthly
trend, totals — re-reads from the same narrowed set. If the WHERE clause were
built separately per endpoint they would drift apart, and the charts would
eventually disagree with the table sitting directly below them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import Enum


class SortField(str, Enum):
    """Whitelist of sortable columns.

    Sort input reaches SQL as an identifier, which cannot be parameterised, so
    it is resolved through this enum into a fixed fragment below. Interpolating
    the raw query-string value would be an injection hole.
    """

    DATE = "date"
    AMOUNT = "amount"
    MERCHANT = "merchant"
    CATEGORY = "category"


class SortOrder(str, Enum):
    ASC = "asc"
    DESC = "desc"


# Enum -> ORDER BY fragment. Every branch appends a tiebreak on t.id: without
# one, rows with an identical sort key can come back in a different order on
# different pages, so a row silently appears twice while another never shows.
_ORDER_BY: dict[tuple[SortField, SortOrder], str] = {
    (SortField.DATE, SortOrder.DESC): "t.occurred_at DESC, t.id DESC",
    (SortField.DATE, SortOrder.ASC): "t.occurred_at ASC, t.id ASC",
    (SortField.AMOUNT, SortOrder.DESC): "t.amount DESC, t.id DESC",
    (SortField.AMOUNT, SortOrder.ASC): "t.amount ASC, t.id ASC",
    (SortField.MERCHANT, SortOrder.DESC): "m.name DESC, t.id DESC",
    (SortField.MERCHANT, SortOrder.ASC): "m.name ASC, t.id ASC",
    (SortField.CATEGORY, SortOrder.DESC): "c.name DESC, t.id DESC",
    (SortField.CATEGORY, SortOrder.ASC): "c.name ASC, t.id ASC",
}


def order_by_clause(sort: SortField, order: SortOrder) -> str:
    return _ORDER_BY[(sort, order)]


@dataclass(frozen=True)
class TransactionFilters:
    """Every filter the dashboard can apply. All combinable, all optional."""

    user_id: int

    # Substring match on the merchant name, case-insensitive.
    search: str | None = None

    # Multi-select facets. Empty list means "no constraint", never "match none".
    categories: list[str] = field(default_factory=list)
    statuses: list[str] = field(default_factory=list)
    payment_methods: list[str] = field(default_factory=list)
    merchants: list[str] = field(default_factory=list)

    # Inclusive IST calendar-date bounds, matching what the date picker shows.
    date_from: date | None = None
    date_to: date | None = None

    # Inclusive amount bounds, compared on the signed amount.
    amount_min: Decimal | None = None
    amount_max: Decimal | None = None

    # A specific month from the trend chart, as 'YYYY-MM'. Kept separate from
    # date_from/date_to so clicking a bar doesn't clobber a date range the user
    # set by hand, and so it can be cleared independently.
    month: str | None = None

    # Rows flagged during ingest. Default None means "don't care".
    only_refunds: bool | None = None
    include_outliers: bool = True

    def build_where(self) -> tuple[str, list]:
        """Return an ``AND``-joined WHERE body and its positional parameters.

        Every value is a placeholder. The only text that ever reaches the query
        from user input is via the enums above.
        """
        clauses: list[str] = ["t.user_id = %s"]
        params: list = [self.user_id]

        if self.search:
            # ILIKE with a leading wildcard so "zom" finds "Zomato" mid-string.
            # The merchants table carries a trigram index for this.
            clauses.append("m.name ILIKE %s")
            params.append(f"%{self.search.strip()}%")

        if self.categories:
            clauses.append("c.name = ANY(%s)")
            params.append(self.categories)

        if self.statuses:
            # Cast because the column is an enum and the parameter is text[].
            clauses.append("t.status = ANY(%s::transaction_status[])")
            params.append(self.statuses)

        if self.payment_methods:
            clauses.append("t.payment_method = ANY(%s::payment_method[])")
            params.append(self.payment_methods)

        if self.merchants:
            clauses.append("m.name = ANY(%s)")
            params.append(self.merchants)

        if self.date_from:
            clauses.append("t.occurred_on >= %s")
            params.append(self.date_from)

        if self.date_to:
            clauses.append("t.occurred_on <= %s")
            params.append(self.date_to)

        if self.month:
            # date_trunc over a DATE needs the explicit ::timestamp cast to hit
            # the IMMUTABLE overload, which is the one the index was built on.
            clauses.append(
                "date_trunc('month', t.occurred_on::timestamp) = "
                "date_trunc('month', to_date(%s, 'YYYY-MM')::timestamp)"
            )
            params.append(self.month)

        if self.amount_min is not None:
            clauses.append("t.amount >= %s")
            params.append(self.amount_min)

        if self.amount_max is not None:
            clauses.append("t.amount <= %s")
            params.append(self.amount_max)

        if self.only_refunds is True:
            clauses.append("t.is_refund")
        elif self.only_refunds is False:
            clauses.append("NOT t.is_refund")

        if not self.include_outliers:
            clauses.append("NOT t.is_outlier")

        return " AND ".join(clauses), params
