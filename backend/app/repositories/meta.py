"""Everything the filter controls need to render, in one round trip."""

from __future__ import annotations

from app.db.session import get_cursor


def facets(user_id: int) -> dict:
    """Distinct values with counts, plus the data bounds.

    Counts are unfiltered on purpose. A facet list that shrinks as you filter
    makes it impossible to widen a selection again without clearing everything
    first â€” the option you want to add has already vanished from the dropdown.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT c.name AS value, c.colour, c.colour_dark, COUNT(t.id) AS count
            FROM categories c
            LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = %s
            GROUP BY c.name, c.colour, c.colour_dark, c.is_fallback
            -- Uncategorised sorts last: it is a data artefact, not a category
            -- the user chose to spend in.
            ORDER BY c.is_fallback, COUNT(t.id) DESC
            """,
            [user_id],
        )
        categories = cur.fetchall()

        cur.execute(
            """
            SELECT m.name AS value, COUNT(t.id) AS count
            FROM merchants m
            LEFT JOIN transactions t ON t.merchant_id = m.id AND t.user_id = %s
            GROUP BY m.name
            ORDER BY COUNT(t.id) DESC, m.name
            """,
            [user_id],
        )
        merchants = cur.fetchall()

        cur.execute(
            """
            SELECT t.status::text AS value, COUNT(*) AS count
            FROM transactions t WHERE t.user_id = %s
            GROUP BY t.status ORDER BY COUNT(*) DESC
            """,
            [user_id],
        )
        statuses = cur.fetchall()

        cur.execute(
            """
            SELECT t.payment_method::text AS value, COUNT(*) AS count
            FROM transactions t WHERE t.user_id = %s
            GROUP BY t.payment_method ORDER BY COUNT(*) DESC
            """,
            [user_id],
        )
        payment_methods = cur.fetchall()

        cur.execute(
            """
            SELECT
                MIN(occurred_on) AS min_date,
                MAX(occurred_on) AS max_date,
                MIN(amount)      AS min_amount,
                -- The amount slider's upper bound ignores flagged outliers.
                -- Anchoring it to â‚¹99,99,99,999 would push every real
                -- transaction into the leftmost pixel of the track.
                MAX(amount) FILTER (WHERE NOT is_outlier) AS max_amount
            FROM transactions WHERE user_id = %s
            """,
            [user_id],
        )
        bounds = cur.fetchone()

        cur.execute(
            """
            SELECT rows_in_file, rows_loaded,
                   rows_in_file - rows_loaded AS rows_rejected,
                   report, ran_at
            FROM ingest_runs ORDER BY ran_at DESC LIMIT 1
            """
        )
        data_quality = cur.fetchone()

    return {
        "categories": categories,
        "merchants": merchants,
        "statuses": statuses,
        "payment_methods": payment_methods,
        "bounds": bounds,
        "data_quality": data_quality,
    }


