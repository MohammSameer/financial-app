"""Application configuration, read once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _csv(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # Matches docker-compose.yml, which publishes on 5544 to avoid clashing
    # with an existing local Postgres.
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://coinstack:coinstack@localhost:5544/coinstack",
    )

    # Connection pool. The dashboard fires a handful of parallel reads per page
    # load, so a small pool beats opening a connection per request.
    pool_min_size: int = int(os.getenv("POOL_MIN_SIZE", "1"))
    pool_max_size: int = int(os.getenv("POOL_MAX_SIZE", "10"))

    cors_origins: list[str] = field(
        default_factory=lambda: _csv(
            os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
        )
    )

    # ---- Rewards rules -------------------------------------------------------
    # One coin per ₹100 of a successful payment...
    coin_rupees_per_coin: int = int(os.getenv("COIN_RUPEES_PER_COIN", "100"))
    # ...capped per transaction. The brief says "capped per transaction" without
    # naming a number, so this is our product call: 50 coins, i.e. coins accrue
    # on the first ₹5,000 of any single payment. Rationale in ASSUMPTIONS.md.
    coin_cap_per_txn: int = int(os.getenv("COIN_CAP_PER_TXN", "50"))

    # Amounts at or above this are treated as data errors rather than spending:
    # kept and flagged in the table, excluded from analytics. The source file's
    # 99.9th percentile is ~₹54,750, so ₹1,00,000 is comfortably clear of real
    # transactions while catching the ₹99,99,99,999 row.
    outlier_amount_threshold: int = int(os.getenv("OUTLIER_AMOUNT_THRESHOLD", "100000"))

    # Single-user app: every request is scoped to this seeded demo user.
    demo_user_email: str = os.getenv("DEMO_USER_EMAIL", "demo@coinstack.app")

    max_page_size: int = int(os.getenv("MAX_PAGE_SIZE", "100"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
