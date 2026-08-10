"""Connection pooling and the single place a cursor is handed out.

Everything above this module (repositories, services, routes) asks for a cursor
and never touches psycopg directly, so swapping the driver or adding read
replicas is a change to one file.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.core.config import get_settings

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    """Lazily open the pool.

    Opening at import time makes the module impossible to import without a
    database, which breaks tooling and tests that only want to read constants.
    """
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = ConnectionPool(
            conninfo=settings.database_url,
            min_size=settings.pool_min_size,
            max_size=settings.pool_max_size,
            # Managed Postgres (Neon) drops idle connections; recycling well
            # before that avoids handing out a dead one.
            max_idle=120,
            open=True,
        )
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def get_cursor(*, commit: bool = False) -> Iterator:
    """Yield a dict-returning cursor.

    Reads take the default (``commit=False``) and roll back, which costs nothing
    and guarantees a read path can never leave a transaction half-open. Writes
    pass ``commit=True`` and get all-or-nothing semantics across the whole block
    — that is what makes the redeem flow atomic.
    """
    pool = get_pool()
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            try:
                yield cur
            except Exception:
                conn.rollback()
                raise
            if commit:
                conn.commit()
            else:
                conn.rollback()
