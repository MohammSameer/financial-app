"""FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import analytics, meta, rewards, transactions
from app.core.config import get_settings
from app.db.session import close_pool, get_cursor, get_pool
from app.services.errors import DomainError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("coinstack")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Open the pool at startup so the first real request doesn't pay for the
    # handshake, and so a bad DATABASE_URL fails loudly on boot rather than as
    # a 500 on someone's first page load.
    get_pool()
    log.info("Connection pool ready")
    yield
    close_pool()


app = FastAPI(
    title="CoinStack API",
    description=(
        "Transactions, spend analytics and coin rewards for a credit-card "
        "bill-pay app. Filtering, sorting, pagination and aggregation all run "
        "in Postgres."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Vercel gives every deployment its own preview subdomain, so an exact
    # origin list would break on each new preview URL.
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    """Turn domain errors into their status codes, in one place.

    Services raise meaning ("not enough coins"); this is the only spot that
    knows it maps to 409. The body always carries a stable ``code`` so the
    frontend can branch on it without matching on copy.
    """
    return JSONResponse(status_code=exc.status_code, content=exc.to_payload())


@app.get("/health", tags=["meta"])
def health() -> dict:
    """Liveness plus a real database round trip.

    Render pings this to decide whether the instance is up. Reporting healthy
    while Postgres is unreachable would keep a broken instance in rotation, so
    the check actually touches the database.
    """
    try:
        with get_cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            cur.fetchone()
        return {"status": "ok", "database": "connected"}
    except Exception as exc:  # noqa: BLE001 — surfaced to the caller as 503
        log.exception("Health check failed")
        return JSONResponse(
            status_code=503, content={"status": "degraded", "database": str(exc)}
        )


api = "/api"
app.include_router(transactions.router, prefix=api)
app.include_router(analytics.router, prefix=api)
app.include_router(rewards.router, prefix=api)
app.include_router(meta.router, prefix=api)
