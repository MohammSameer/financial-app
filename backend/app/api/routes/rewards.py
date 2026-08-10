"""Rewards endpoints: balance, catalogue, redeem, history."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import current_user_id
from app.models.schemas import (
    Balance,
    RedeemRequest,
    RedeemResponse,
    Redemption,
    Reward,
)
from app.services import rewards as service

router = APIRouter(prefix="/rewards", tags=["rewards"])


@router.get("/balance", response_model=Balance)
def get_balance(user_id: int = Depends(current_user_id)) -> dict:
    """Current coin balance, always derived from earnings minus redemptions."""
    return service.get_balance(user_id)


@router.get("", response_model=list[Reward])
def get_catalogue(user_id: int = Depends(current_user_id)) -> list[dict]:
    """The redeemable catalogue, each entry marked affordable or not."""
    return service.get_catalogue(user_id)


@router.get("/history", response_model=list[Redemption])
def get_history(user_id: int = Depends(current_user_id)) -> list[dict]:
    return service.get_history(user_id)


@router.post(
    "/redeem",
    response_model=RedeemResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"description": "The reward does not exist"},
        409: {"description": "Not enough coins, or the reward is unavailable"},
        422: {"description": "Malformed request body"},
    },
)
def redeem(
    payload: RedeemRequest,
    response: Response,
    user_id: int = Depends(current_user_id),
) -> dict:
    """Redeem coins against a reward.

    Rejects, with distinct status codes:
      * 404 — no such reward
      * 409 — balance too low, reward withdrawn, or out of stock
      * 422 — malformed body, handled by Pydantic before this runs

    Carries a client-supplied ``request_id``. Retrying a request that already
    succeeded returns the original redemption with ``idempotent_replay: true``
    rather than charging the user a second time.
    """
    result = service.redeem(user_id, payload.reward_id, payload.request_id)

    # A replay created nothing, so 201 would be a lie. 200 says "here is the
    # redemption you already have" — which is exactly what a retrying client
    # needs to hear.
    if result["idempotent_replay"]:
        response.status_code = status.HTTP_200_OK

    return result
