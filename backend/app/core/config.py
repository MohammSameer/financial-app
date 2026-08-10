"""Application configuration, read once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# Load .env before anything below reads the environment.
#
# The field defaults in Settings are evaluated when this module is imported, so
# this has to run first — once the class body has executed it is too late.
#
# Two locations are checked, backend/ first and then the repo root, because
# both are places people reasonably put the file. Silently ignoring a .env
# sitting one directory away is a genuinely confusing failure: the app starts
# fine and quietly talks to the wrong database.
#
# override=False on both: a real environment variable always wins. That is what
# production needs — Render injects DATABASE_URL directly, and a stray .env
# must never replace it. It also means backend/.env wins over the repo root,
# since whichever loads first claims the key.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
for _candidate in (_BACKEND_DIR / ".env", _BACKEND_DIR.parent / ".env"):
    if _candidate.is_file():
        load_dotenv(_candidate, override=False)


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
