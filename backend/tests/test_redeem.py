"""Tests for the redeem endpoint.

Runs against a real Postgres, not a mock. The parts of redeem most likely to
break — the row lock, the atomicity of the balance check and insert, the unique
index on request_id — are database behaviour, and a mocked repository would
assert that the mock works rather than that redeeming does.

Each test rolls its own writes back in a fixture, so the suite can run against
the seeded development database without leaving redemptions behind.

    cd backend && .venv/Scripts/python -m pytest -v
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.db.session import get_cursor
from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def user_id() -> int:
    from app.api.deps import current_user_id

    return current_user_id()


@pytest.fixture(autouse=True)
def clean_redemptions(user_id: int):
    """Remove anything a test redeemed, so tests don't affect each other or
    permanently drain the seeded balance."""
    yield
    with get_cursor(commit=True) as cur:
        cur.execute("DELETE FROM redemptions WHERE user_id = %s", [user_id])
        # Restore stock the tests consumed.
        cur.execute("UPDATE rewards SET stock = 25 WHERE slug = 'bookmyshow-pair'")
        cur.execute("UPDATE rewards SET stock = 1 WHERE slug = 'annual-fee-waiver'")
        cur.execute("UPDATE rewards SET is_active = TRUE")


def _balance(client: TestClient) -> int:
    return client.get("/api/rewards/balance").json()["balance"]


def _reward(client: TestClient, slug: str) -> dict:
    rewards = client.get("/api/rewards").json()
    return next(r for r in rewards if r["slug"] == slug)


def test_successful_redeem_debits_exactly_the_cost(client: TestClient):
    before = _balance(client)
    reward = _reward(client, "amazon-500")

    res = client.post(
        "/api/rewards/redeem",
        json={"reward_id": reward["id"], "request_id": str(uuid.uuid4())},
    )

    assert res.status_code == 201
    body = res.json()
    assert body["redemption"]["coins_spent"] == reward["coin_cost"]
    assert body["balance"]["balance"] == before - reward["coin_cost"]
    assert body["idempotent_replay"] is False

    # The response is not taken on trust: re-read the balance to confirm it
    # was actually committed, not just reported.
    assert _balance(client) == before - reward["coin_cost"]


def test_unaffordable_redeem_is_409_and_changes_nothing(client: TestClient):
    before = _balance(client)
    reward = _reward(client, "annual-fee-waiver")
    assert reward["coin_cost"] > before, "fixture assumption: this must be unaffordable"

    res = client.post(
        "/api/rewards/redeem",
        json={"reward_id": reward["id"], "request_id": str(uuid.uuid4())},
    )

    assert res.status_code == 409
    body = res.json()
    assert body["code"] == "insufficient_balance"
    assert body["details"]["shortfall"] == reward["coin_cost"] - before

    # The important half of the assertion: a rejected redeem must leave the
    # balance untouched. This is what the frontend's optimistic rollback
    # depends on being true.
    assert _balance(client) == before


def test_unknown_reward_is_404(client: TestClient):
    before = _balance(client)

    res = client.post(
        "/api/rewards/redeem",
        json={"reward_id": 999_999, "request_id": str(uuid.uuid4())},
    )

    assert res.status_code == 404
    assert res.json()["code"] == "not_found"
    assert _balance(client) == before


def test_replaying_a_request_id_does_not_charge_twice(client: TestClient):
    before = _balance(client)
    reward = _reward(client, "swiggy-250")
    request_id = str(uuid.uuid4())
    payload = {"reward_id": reward["id"], "request_id": request_id}

    first = client.post("/api/rewards/redeem", json=payload)
    second = client.post("/api/rewards/redeem", json=payload)

    assert first.status_code == 201
    # Nothing was created the second time, so 200 rather than 201.
    assert second.status_code == 200
    assert second.json()["idempotent_replay"] is True

    # Same redemption row, not a second one.
    assert first.json()["redemption"]["id"] == second.json()["redemption"]["id"]
    assert _balance(client) == before - reward["coin_cost"]


def test_out_of_stock_reward_is_rejected(client: TestClient):
    reward = _reward(client, "bookmyshow-pair")
    with get_cursor(commit=True) as cur:
        cur.execute("UPDATE rewards SET stock = 0 WHERE id = %s", [reward["id"]])

    before = _balance(client)
    res = client.post(
        "/api/rewards/redeem",
        json={"reward_id": reward["id"], "request_id": str(uuid.uuid4())},
    )

    assert res.status_code == 409
    assert res.json()["code"] == "reward_unavailable"
    assert _balance(client) == before


def test_inactive_reward_is_rejected(client: TestClient):
    reward = _reward(client, "myntra-750")
    with get_cursor(commit=True) as cur:
        cur.execute("UPDATE rewards SET is_active = FALSE WHERE id = %s", [reward["id"]])

    res = client.post(
        "/api/rewards/redeem",
        json={"reward_id": reward["id"], "request_id": str(uuid.uuid4())},
    )

    assert res.status_code == 409
    assert res.json()["code"] == "reward_unavailable"


def test_malformed_body_is_422(client: TestClient):
    assert (
        client.post(
            "/api/rewards/redeem",
            json={"reward_id": 1, "request_id": "not-a-uuid"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/rewards/redeem",
            json={"reward_id": -1, "request_id": str(uuid.uuid4())},
        ).status_code
        == 422
    )


def test_stock_decrements_only_for_finite_stock(client: TestClient):
    finite = _reward(client, "bookmyshow-pair")
    unlimited = _reward(client, "amazon-500")
    assert unlimited["stock"] is None

    client.post(
        "/api/rewards/redeem",
        json={"reward_id": finite["id"], "request_id": str(uuid.uuid4())},
    )
    client.post(
        "/api/rewards/redeem",
        json={"reward_id": unlimited["id"], "request_id": str(uuid.uuid4())},
    )

    assert _reward(client, "bookmyshow-pair")["stock"] == finite["stock"] - 1
    # An unlimited reward must stay unlimited rather than becoming -1.
    assert _reward(client, "amazon-500")["stock"] is None


def test_balance_equals_earned_minus_redeemed(client: TestClient):
    """The balance is derived, so this identity must hold after any redeem."""
    reward = _reward(client, "amazon-500")
    client.post(
        "/api/rewards/redeem",
        json={"reward_id": reward["id"], "request_id": str(uuid.uuid4())},
    )

    body = client.get("/api/rewards/balance").json()
    assert body["balance"] == body["earned"] - body["redeemed"]
    assert body["redeemed"] == reward["coin_cost"]
