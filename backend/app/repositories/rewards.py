"""Data access for rewards, balances and redemptions.

Unlike the read-only repositories, these functions take a cursor rather than
opening their own. Redeeming has to read the balance, check the reward, insert
the ledger row and decrement stock as a single atomic unit — if each step
opened its own connection, a crash midway could leave stock decremented with
no redemption to show for it.
"""

from __future__ import annotations

from uuid import UUID

from psycopg import Cursor


def lock_user(cur: Cursor, user_id: int) -> dict | None:
    """Take a row lock on the user, serialising concurrent redeems.

    Without this, two requests can both read a balance of 100, both decide a
    90-coin reward is affordable, and both insert — spending 180 coins the user
    never had. The lock makes the second request wait for the first to commit,
    so it reads the already-reduced balance. Every redeem takes this lock
    first, before reading anything it intends to act on.
    """
    cur.execute(
        "SELECT id, email, display_name FROM users WHERE id = %s FOR UPDATE",
        [user_id],
    )
    return cur.fetchone()


def balance(cur: Cursor, user_id: int) -> dict:
    """Derive the balance from history rather than reading a counter.

    earned - redeemed, computed fresh. There is no stored balance column to
    fall out of sync with the ledger, so a failed redeem cannot leave a wrong
    number behind: if the transaction rolls back, the inputs to this sum are
    simply unchanged.
    """
    cur.execute(
        """
        SELECT
            (SELECT COALESCE(SUM(coins_earned), 0)
               FROM transactions WHERE user_id = %(uid)s) AS earned,
            (SELECT COALESCE(SUM(coins_spent), 0)
               FROM redemptions
              WHERE user_id = %(uid)s AND status = 'COMPLETED') AS redeemed
        """,
        {"uid": user_id},
    )
    row = cur.fetchone()
    earned = int(row["earned"])
    redeemed = int(row["redeemed"])
    return {"earned": earned, "redeemed": redeemed, "balance": earned - redeemed}


def catalogue(cur: Cursor, user_id: int) -> list[dict]:
    """The catalogue, with affordability resolved server-side.

    The client is never asked to compare cost against balance itself: one
    authority for "can I afford this" means the disabled state on the button
    and the answer from the redeem endpoint cannot disagree.
    """
    bal = balance(cur, user_id)["balance"]
    cur.execute(
        """
        SELECT id, slug, title, description, brand, coin_cost, inr_value,
               stock, is_active,
               (%s >= coin_cost) AS affordable
        FROM rewards
        ORDER BY sort_order, id
        """,
        [bal],
    )
    return cur.fetchall()


def get_reward(cur: Cursor, reward_id: int) -> dict | None:
    """Lock the reward row too, so concurrent redeems can't oversell stock."""
    cur.execute(
        """
        SELECT id, slug, title, description, brand, coin_cost, inr_value,
               stock, is_active
        FROM rewards WHERE id = %s FOR UPDATE
        """,
        [reward_id],
    )
    return cur.fetchone()


def find_by_request_id(cur: Cursor, user_id: int, request_id: UUID) -> dict | None:
    """Look for an existing redemption with this idempotency key."""
    cur.execute(
        """
        SELECT r.id, r.reward_id, w.title AS reward_title, r.coins_spent,
               r.status::text AS status, r.redeemed_at
        FROM redemptions r
        JOIN rewards w ON w.id = r.reward_id
        WHERE r.user_id = %s AND r.request_id = %s
        """,
        [user_id, request_id],
    )
    return cur.fetchone()


def insert_redemption(
    cur: Cursor, user_id: int, reward_id: int, coins_spent: int, request_id: UUID
) -> dict:
    cur.execute(
        """
        INSERT INTO redemptions (user_id, reward_id, coins_spent, request_id)
        VALUES (%s, %s, %s, %s)
        RETURNING id, reward_id, coins_spent, status::text AS status, redeemed_at
        """,
        [user_id, reward_id, coins_spent, request_id],
    )
    return cur.fetchone()


def decrement_stock(cur: Cursor, reward_id: int) -> None:
    """Decrement finite stock.

    The WHERE guard means the UPDATE is a no-op for unlimited rewards
    (stock IS NULL) and can never drive a finite stock negative, even if the
    affordability check above were somehow bypassed.
    """
    cur.execute(
        "UPDATE rewards SET stock = stock - 1 WHERE id = %s AND stock IS NOT NULL AND stock > 0",
        [reward_id],
    )


def history(cur: Cursor, user_id: int, limit: int = 20) -> list[dict]:
    cur.execute(
        """
        SELECT r.id, r.reward_id, w.title AS reward_title, r.coins_spent,
               r.status::text AS status, r.redeemed_at
        FROM redemptions r
        JOIN rewards w ON w.id = r.reward_id
        WHERE r.user_id = %s
        ORDER BY r.redeemed_at DESC
        LIMIT %s
        """,
        [user_id, limit],
    )
    return cur.fetchall()
