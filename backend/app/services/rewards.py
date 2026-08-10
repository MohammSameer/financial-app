"""Rewards business logic, including the redeem transaction."""

from __future__ import annotations

from uuid import UUID

from app.db.session import get_cursor
from app.repositories import rewards as repo
from app.services.errors import InsufficientBalance, NotFound, RewardUnavailable


def get_balance(user_id: int) -> dict:
    with get_cursor() as cur:
        return repo.balance(cur, user_id)


def get_catalogue(user_id: int) -> list[dict]:
    with get_cursor() as cur:
        return repo.catalogue(cur, user_id)


def get_history(user_id: int, limit: int = 20) -> list[dict]:
    with get_cursor() as cur:
        return repo.history(cur, user_id, limit)


def redeem(user_id: int, reward_id: int, request_id: UUID) -> dict:
    """Spend coins on a reward. Atomic, idempotent, and validated server-side.

    The whole body runs inside one transaction (``commit=True``). Any exception
    rolls the lot back, which is what lets the frontend update the balance
    optimistically: a failure genuinely leaves the database untouched, so
    rolling the UI back to the previous number is always correct.

    Order matters. Locks are taken before anything is read that will be acted
    on, and the balance is re-derived *after* the lock — reading it first would
    reintroduce exactly the race the lock exists to prevent.
    """
    with get_cursor(commit=True) as cur:
        user = repo.lock_user(cur, user_id)
        if user is None:
            raise NotFound("No such user.", user_id=user_id)

        # Idempotency, checked inside the lock. A client that retries after a
        # timeout must not be charged twice, and it cannot tell from its side
        # whether the original request committed.
        existing = repo.find_by_request_id(cur, user_id, request_id)
        if existing is not None:
            return {
                "redemption": existing,
                "balance": repo.balance(cur, user_id),
                "idempotent_replay": True,
            }

        reward = repo.get_reward(cur, reward_id)
        if reward is None:
            raise NotFound("That reward doesn't exist.", reward_id=reward_id)

        if not reward["is_active"]:
            raise RewardUnavailable(
                f"{reward['title']} is no longer available.", reward_id=reward_id
            )

        if reward["stock"] is not None and reward["stock"] <= 0:
            raise RewardUnavailable(
                f"{reward['title']} is out of stock.", reward_id=reward_id
            )

        current = repo.balance(cur, user_id)
        cost = int(reward["coin_cost"])

        if current["balance"] < cost:
            raise InsufficientBalance(
                f"You need {cost - current['balance']:,} more coins for this reward.",
                required=cost,
                available=current["balance"],
                shortfall=cost - current["balance"],
            )

        redemption = repo.insert_redemption(cur, user_id, reward_id, cost, request_id)
        repo.decrement_stock(cur, reward_id)

        redemption["reward_title"] = reward["title"]

        return {
            "redemption": redemption,
            # Re-derived after the insert, so the client gets the real new
            # balance rather than the client's own arithmetic.
            "balance": repo.balance(cur, user_id),
            "idempotent_replay": False,
        }
