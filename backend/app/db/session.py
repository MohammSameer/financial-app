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
            # Connections are autocommit by default; see get_cursor below.
            kwargs={"autocommit": True},
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

    Connections are autocommit, so a plain read issues exactly one round trip:
    the query. Previously every read opened a transaction and rolled it back,
    which is free against a container on localhost but costs a second full
    round trip against managed Postgres in another region — and the read paths
    fire several queries per request, so it compounded.

    Writes pass ``commit=True`` and run inside ``conn.transaction()``: a real
    BEGIN, committed on a clean exit and rolled back on any exception. The
    redeem flow's atomicity is unchanged — it is still all-or-nothing across
    the whole block, which is what the optimistic UI rollback depends on.
    """
    pool = get_pool()
    with pool.connection() as conn:
        if commit:
            with conn.transaction():
                with conn.cursor(row_factory=dict_row) as cur:
                    yield cur
        else:
            with conn.cursor(row_factory=dict_row) as cur:
                yield cur
