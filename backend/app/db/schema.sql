-- =============================================================================
-- CoinStack — schema
-- PostgreSQL 18 (16+ compatible)
--
-- Design notes (the "why" lives in DECISIONS.md, the short version is here):
--
--  * Merchants and categories are lookup tables, not text columns on the fact
--    table. 10k transactions reference 49 merchants and 11 categories; joining
--    is cheaper than storing the strings 10k times, and it gives the filter
--    dropdowns a cheap, authoritative source.
--
--  * transactions.external_id is NOT unique. The source file contains 40 pairs
--    of rows sharing an id, and no pair is a duplicate row — each pair holds a
--    different merchant, amount and date. They are two real transactions with a
--    collided identifier, so deduplicating would silently destroy data. We keep
--    both, key on our own surrogate id, and flag the collision.
--
--  * The coin balance is DERIVED, never stored as a mutable counter:
--        balance = SUM(transactions.coins_earned) - SUM(completed redemptions)
--    A stored counter can drift away from its own history after a partial
--    failure. A derived balance cannot. See app/services/rewards.py.
-- =============================================================================

DROP TABLE IF EXISTS redemptions       CASCADE;
DROP TABLE IF EXISTS rewards           CASCADE;
DROP TABLE IF EXISTS transactions      CASCADE;
DROP TABLE IF EXISTS merchants         CASCADE;
DROP TABLE IF EXISTS categories        CASCADE;
DROP TABLE IF EXISTS users             CASCADE;
DROP TABLE IF EXISTS ingest_runs       CASCADE;

DROP TYPE IF EXISTS transaction_status CASCADE;
DROP TYPE IF EXISTS payment_method     CASCADE;
DROP TYPE IF EXISTS redemption_status  CASCADE;

-- -----------------------------------------------------------------------------
-- Enums
--
-- The source data spells status four ways (SUCCESS / success / FAILED /
-- PENDING). Enums push that normalisation into the seed where it belongs,
-- and make an unhandled variant a loud failure rather than a silent new
-- category in a GROUP BY.
-- -----------------------------------------------------------------------------
CREATE TYPE transaction_status AS ENUM ('SUCCESS', 'PENDING', 'FAILED');
CREATE TYPE payment_method     AS ENUM ('Credit Card', 'Debit Card', 'UPI', 'Netbanking');
CREATE TYPE redemption_status  AS ENUM ('COMPLETED', 'REVERSED');

-- -----------------------------------------------------------------------------
-- users
--
-- The brief describes a single-user consumer app ("looking at your own
-- spending"), so there is no auth. We still model a user row: the coin balance
-- and every redemption hang off it, and it is the lock target that serialises
-- concurrent redeems. Adding real auth later means adding columns here, not
-- reshaping the schema.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email        TEXT       NOT NULL UNIQUE,
    display_name TEXT       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- categories / merchants
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
    id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    -- Stable colour for the charts. Assigning it in the database keeps a
    -- category the same colour in every chart and every legend, without the
    -- frontend hashing names into a palette.
    colour     TEXT NOT NULL,
    -- True for the synthetic bucket that absorbs the 200 rows arriving with a
    -- null, missing or empty category. Lets the UI style it as "unknown"
    -- rather than presenting it as a real spending category.
    is_fallback BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE merchants (
    id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

-- Merchant search is "as they type" over 49 names. A trigram index makes
-- ILIKE '%foo%' an index scan instead of a sequential one; on 49 rows it
-- hardly matters, but the transactions join below inherits the benefit and
-- the pattern is the one that survives a real merchant table.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX merchants_name_trgm_idx ON merchants USING gin (name gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- transactions
-- -----------------------------------------------------------------------------
CREATE TABLE transactions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- The id as it appeared in the source file. Deliberately not unique.
    external_id     TEXT        NOT NULL,

    user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_id     INT         NOT NULL REFERENCES merchants(id),
    category_id     INT         NOT NULL REFERENCES categories(id),

    -- The absolute instant. Source of truth, and what "sort by date" orders on.
    occurred_at     TIMESTAMPTZ NOT NULL,

    -- The IST calendar date of that instant, denormalised at ingest.
    --
    -- Two reasons, one correctness and one performance:
    --   * A user in Delhi filtering "1 March to 31 March" means March in IST,
    --     not March in UTC. A payment at 2026-03-01T02:00+05:30 is 28 February
    --     in UTC — grouping on the timestamptz would file it under the wrong
    --     month in the trend chart and hide it from a March filter.
    --   * date_trunc(text, timestamptz) is only STABLE, because its answer
    --     depends on the session TimeZone, so Postgres refuses to build an
    --     index on it. date_trunc(text, date) is IMMUTABLE. Storing the date
    --     makes the monthly aggregate indexable instead of a per-row
    --     recomputation over 10k rows on every chart load.
    occurred_on     DATE        NOT NULL,

    -- NUMERIC, not float. Money in a binary float is a bug waiting for a
    -- reconciliation report to find it.
    amount          NUMERIC(14, 2) NOT NULL,
    currency        CHAR(3)     NOT NULL DEFAULT 'INR',

    status          transaction_status NOT NULL,
    payment_method  payment_method     NOT NULL,

    -- Coins are computed once, at ingest, and stored. Recomputing the earn rule
    -- on every read would mean the balance silently changes if the rule ever
    -- changes — existing coins should not evaporate because marketing altered
    -- the cap. See ASSUMPTIONS.md.
    coins_earned    INT         NOT NULL DEFAULT 0 CHECK (coins_earned >= 0),

    -- ---- Data-quality flags, all set by the seed -----------------------------
    -- Negative amount: a refund/reversal, not a payment. Earns no coins and is
    -- excluded from "spend" aggregates.
    is_refund       BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Implausible magnitude (see seed for the threshold). Kept and shown in the
    -- table, excluded from analytics so one bad row cannot flatten every chart.
    is_outlier      BOOLEAN     NOT NULL DEFAULT FALSE,
    -- This row's external_id is shared with another row.
    is_id_collision BOOLEAN     NOT NULL DEFAULT FALSE,

    -- The timestamp exactly as it arrived, for audit. The source mixes five
    -- representations; keeping the original means a parsing decision can be
    -- re-litigated later without re-reading the file.
    raw_timestamp   TEXT        NOT NULL,
    -- Human-readable list of what the seed normalised on this row, surfaced in
    -- the detail drawer.
    ingest_notes    TEXT[]      NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Indexes -----------------------------------------------------------------
-- The dashboard's default view is "newest first", and every filtered query is
-- still scoped to one user, so user_id + occurred_at DESC is the workhorse.
CREATE INDEX transactions_user_occurred_idx  ON transactions (user_id, occurred_at DESC);
-- Sorting by amount is the other offered sort.
CREATE INDEX transactions_user_amount_idx    ON transactions (user_id, amount DESC);
-- Category filter and the category-breakdown aggregate.
CREATE INDEX transactions_category_idx       ON transactions (category_id);
-- Merchant filter and the join behind merchant search.
CREATE INDEX transactions_merchant_idx       ON transactions (merchant_id);
-- Status filter; also narrows the coin-earning aggregate.
CREATE INDEX transactions_status_idx         ON transactions (status);
-- Looking a transaction up by the id the user actually sees.
CREATE INDEX transactions_external_id_idx    ON transactions (external_id);
-- Date-range filtering, which the UI expresses in IST calendar dates.
CREATE INDEX transactions_occurred_on_idx    ON transactions (user_id, occurred_on);
-- The monthly-trend aggregate.
--
-- The ::timestamp cast is load-bearing, not decoration. Postgres has four
-- date_trunc overloads and a bare DATE argument resolves to
-- date_trunc(text, timestamptz), which is only STABLE — so the index build
-- fails with "functions in index expression must be marked IMMUTABLE".
-- Casting explicitly selects date_trunc(text, timestamp), which is IMMUTABLE.
-- The analytics query must use the identical expression for the index to be
-- used; see app/repositories/analytics.py.
CREATE INDEX transactions_month_idx
    ON transactions (user_id, (date_trunc('month', occurred_on::timestamp)));

-- -----------------------------------------------------------------------------
-- rewards — the redeemable catalogue
-- -----------------------------------------------------------------------------
CREATE TABLE rewards (
    id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug         TEXT    NOT NULL UNIQUE,
    title        TEXT    NOT NULL,
    description  TEXT    NOT NULL,
    -- The partner/brand the voucher is for, used for the card artwork.
    brand        TEXT    NOT NULL,
    -- Cost in coins. Positive by constraint: a free reward would let the
    -- balance check pass trivially.
    coin_cost    INT     NOT NULL CHECK (coin_cost > 0),
    -- Rupee value the coins convert to, for "worth ₹500" copy.
    inr_value    NUMERIC(10, 2) NOT NULL CHECK (inr_value >= 0),
    -- Soft delete / seasonal availability. The redeem endpoint rejects
    -- inactive rewards with 409 rather than pretending they do not exist.
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    -- NULL means unlimited. A finite stock is what makes a sold-out reward a
    -- distinct, testable failure from an unaffordable one.
    stock        INT     CHECK (stock IS NULL OR stock >= 0),
    sort_order   INT     NOT NULL DEFAULT 0
);

-- -----------------------------------------------------------------------------
-- redemptions — an append-only ledger, one row per redeem attempt that
-- succeeded. Nothing is ever UPDATEd to change history; a reversal flips
-- status to REVERSED, which removes it from the balance sum while leaving the
-- record intact.
-- -----------------------------------------------------------------------------
CREATE TABLE redemptions (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_id    INT     NOT NULL REFERENCES rewards(id),

    -- Cost is copied, not looked up through the FK. If the catalogue price
    -- changes tomorrow, a redemption from today must still show what it
    -- actually cost.
    coins_spent  INT     NOT NULL CHECK (coins_spent > 0),

    status       redemption_status NOT NULL DEFAULT 'COMPLETED',

    -- Idempotency key supplied by the client. A retry after a timeout returns
    -- the original redemption instead of charging the user twice.
    request_id   UUID    NOT NULL,

    redeemed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforces idempotency at the database, not just in application logic: two
-- concurrent requests carrying the same key cannot both insert.
CREATE UNIQUE INDEX redemptions_request_id_idx ON redemptions (request_id);
CREATE INDEX redemptions_user_idx ON redemptions (user_id, redeemed_at DESC);

-- -----------------------------------------------------------------------------
-- ingest_runs — what the seed cleaned, kept as data.
--
-- The dataset is deliberately messy and the cleaning decisions are a real part
-- of this submission, so the counts are recorded rather than printed and
-- forgotten. The frontend reads this to show a "data quality" panel.
-- -----------------------------------------------------------------------------
CREATE TABLE ingest_runs (
    id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_file    TEXT        NOT NULL,
    rows_in_file   INT         NOT NULL,
    rows_loaded    INT         NOT NULL,
    -- {"negative_amounts": 148, "string_amounts": 20, ...}
    report         JSONB       NOT NULL,
    ran_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
