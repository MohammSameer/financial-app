"""Data access for transactions. All transaction SQL lives here."""

from __future__ import annotations

from app.db.session import get_cursor
from app.models.filters import SortField, SortOrder, TransactionFilters, order_by_clause

# Joined once and reused by both the page query and the totals query so the two
# can never disagree about what "matching" means.
_FROM = """
    FROM transactions t
    JOIN merchants  m ON m.id = t.merchant_id
    JOIN categories c ON c.id = t.category_id
"""

_COLUMNS = """
    t.id,
    t.external_id,
    t.occurred_at,
    t.occurred_on,
    m.name   AS merchant,
    c.name   AS category,
    c.colour AS category_colour,
    t.amount,
    t.currency,
    t.status::text        AS status,
    t.payment_method::text AS payment_method,
    t.coins_earned,
    t.is_refund,
    t.is_outlier,
    t.is_id_collision,
    t.raw_timestamp,
    t.ingest_notes
"""


def fetch_page(
    filters: TransactionFilters,
    *,
    page: int,
    page_size: int,
    sort: SortField,
    order: SortOrder,
) -> list[dict]:
    """One page of rows.

    LIMIT/OFFSET rather than keyset pagination: the UI offers jump-to-page and
    a total count, which keyset cannot express, and at 10k rows with an index
    on the sort column the offset cost is irrelevant. See DECISIONS.md.
    """
    where, params = filters.build_where()
    sql = f"""
        SELECT {_COLUMNS}
        {_FROM}
        WHERE {where}
        ORDER BY {order_by_clause(sort, order)}
        LIMIT %s OFFSET %s
    """
    with get_cursor() as cur:
        cur.execute(sql, [*params, page_size, (page - 1) * page_size])
        return cur.fetchall()


def fetch_totals(filters: TransactionFilters) -> dict:
    """Count and money totals over the entire filtered set.

    One pass with FILTER clauses rather than several round trips. "Spend"
    deliberately counts only positive, successful, non-outlier amounts: a
    refund is money returning, a failed payment never moved, and the
    ₹99,99,99,999 row is a data error that would otherwise dominate every
    total on the screen.
    """
    where, params = filters.build_where()
    sql = f"""
        SELECT
            COUNT(*) AS transaction_count,

            COUNT(*) FILTER (
                WHERE t.status = 'SUCCESS' AND t.amount > 0 AND NOT t.is_outlier
            ) AS successful_count,

            COALESCE(SUM(t.amount) FILTER (
                WHERE t.status = 'SUCCESS' AND t.amount > 0 AND NOT t.is_outlier
            ), 0) AS total_spend,

            COALESCE(ABS(SUM(t.amount) FILTER (WHERE t.amount < 0)), 0) AS total_refunded,

            COALESCE(AVG(t.amount) FILTER (
                WHERE t.status = 'SUCCESS' AND t.amount > 0 AND NOT t.is_outlier
            ), 0) AS average_spend,

            COALESCE(SUM(t.coins_earned), 0) AS coins_earned
        {_FROM}
        WHERE {where}
    """
    with get_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def count(filters: TransactionFilters) -> int:
    where, params = filters.build_where()
    with get_cursor() as cur:
        cur.execute(f"SELECT COUNT(*) AS n {_FROM} WHERE {where}", params)
        return cur.fetchone()["n"]


def fetch_by_id(user_id: int, transaction_id: int) -> dict | None:
    """Single row by our surrogate id.

    Keyed on the internal id, not external_id, precisely because external_id
    is not unique in this dataset — looking up by it could return two rows.
    """
    sql = f"""
        SELECT {_COLUMNS}
        {_FROM}
        WHERE t.user_id = %s AND t.id = %s
    """
    with get_cursor() as cur:
        cur.execute(sql, [user_id, transaction_id])
        return cur.fetchone()


def fetch_id_collision_siblings(user_id: int, external_id: str, exclude_id: int) -> list[dict]:
    """Other transactions sharing this external_id.

    Surfaced in the detail drawer. When a user opens a transaction whose id is
    duplicated, showing the sibling explains the flag instead of leaving a
    scary badge unexplained.
    """
    sql = f"""
        SELECT {_COLUMNS}
        {_FROM}
        WHERE t.user_id = %s AND t.external_id = %s AND t.id <> %s
        ORDER BY t.occurred_at
    """
    with get_cursor() as cur:
        cur.execute(sql, [user_id, external_id, exclude_id])
        return cur.fetchall()
