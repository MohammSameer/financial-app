"""Aggregate queries behind the charts.

These take the same TransactionFilters as the table. That is the whole
mechanism behind two-way cross-filtering: narrow the filters and the charts
narrow with the table, because both read the identical WHERE clause.
"""

from __future__ import annotations

from app.db.session import get_cursor
from app.models.filters import TransactionFilters

_FROM = """
    FROM transactions t
    JOIN merchants  m ON m.id = t.merchant_id
    JOIN categories c ON c.id = t.category_id
"""

# What counts as "spend" everywhere in analytics. Kept as one constant so the
# category chart, the trend chart and the totals cannot drift apart.
_IS_SPEND = "t.status = 'SUCCESS' AND t.amount > 0 AND NOT t.is_outlier"


def by_category(filters: TransactionFilters) -> list[dict]:
    """Spend per category, largest first.

    Aggregation happens in Postgres, not the browser. Shipping 10k rows to the
    client just to sum them would make the payload ~2 MB and the chart's cost
    grow with the dataset; this returns 11 rows regardless of how large the
    history gets.
    """
    where, params = filters.build_where()
    sql = f"""
        SELECT
            c.name   AS category,
            c.colour AS colour,
            COALESCE(SUM(t.amount) FILTER (WHERE {_IS_SPEND}), 0) AS total,
            COUNT(*) FILTER (WHERE {_IS_SPEND})                   AS count
        {_FROM}
        WHERE {where}
        GROUP BY c.name, c.colour
        HAVING COUNT(*) FILTER (WHERE {_IS_SPEND}) > 0
        ORDER BY total DESC
    """
    with get_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def by_month(filters: TransactionFilters) -> list[dict]:
    """Monthly spend and refunds.

    Months are IST calendar months (see the occurred_on column). The
    ::timestamp cast matches the expression index built in schema.sql — drop it
    and the planner silently stops using that index.
    """
    where, params = filters.build_where()
    sql = f"""
        SELECT
            to_char(date_trunc('month', t.occurred_on::timestamp), 'YYYY-MM') AS month,
            to_char(date_trunc('month', t.occurred_on::timestamp), 'Mon YYYY') AS label,
            COALESCE(SUM(t.amount) FILTER (WHERE {_IS_SPEND}), 0)             AS total,
            COALESCE(ABS(SUM(t.amount) FILTER (WHERE t.amount < 0)), 0)       AS refunded,
            COUNT(*) FILTER (WHERE {_IS_SPEND})                               AS count
        {_FROM}
        WHERE {where}
        GROUP BY date_trunc('month', t.occurred_on::timestamp)
        ORDER BY date_trunc('month', t.occurred_on::timestamp)
    """
    with get_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()
