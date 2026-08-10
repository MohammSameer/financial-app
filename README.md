# CoinStack

A credit-card bill-pay app: browse your transactions, see where the money goes,
and turn spending into coins you can redeem.

Built for the Digital Alpha Technologies take-home. Frontend through database.

**Live:** _frontend URL_ · _backend URL_ · _(see [Deployment](#deployment))_

---

## What it does

**Transactions** — all 10,000 rows, with combinable filters (category, status,
payment method, date range, amount range), as-you-type merchant search, and
sorting by date, amount, merchant or category. Filtering, sorting and paging all
happen in Postgres; the browser only ever holds one page. Clicking a row opens a
detail drawer.

**Analytics** — spend by category and a monthly trend. Cross-filtering is
**two-way**: click a donut slice or a month bar and the table narrows; filter the
table and both charts re-aggregate. Both read the same filter object, so they
cannot disagree.

**Rewards** — coins earned at 1 per ₹100 of a successful payment (capped at 50
per transaction), balance always visible in the header, and a select → confirm →
done redeem flow. The balance updates optimistically and rolls back cleanly if
the call fails; the backend rejects unaffordable, unknown, sold-out and
withdrawn rewards with distinct status codes.

**The data is deliberately messy, and the app says so.** A banner reports what
the seed normalised, and each affected row explains itself in the drawer. All
10,000 rows load — nothing is dropped. Details in
[ASSUMPTIONS.md](ASSUMPTIONS.md).

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, CSS Modules |
| Charts | Recharts |
| Backend | Python, FastAPI, psycopg 3 |
| Database | PostgreSQL 18 |
| Tests | pytest against a real Postgres |

No component library anywhere — the table, modal, drawer, multi-select, toasts
and the whole token system are hand-built.

---

## Local setup

**Prerequisites:** Docker, Python 3.11+, Node 18+.

### 1. Database + seed — one command each

```bash
docker compose up -d          # PostgreSQL 18 on localhost:5544

cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt

python -m scripts.seed        # creates the schema AND loads the data
```

`scripts.seed` is the one documented command: it applies
[`app/db/schema.sql`](backend/app/db/schema.sql), normalises the source file, and
loads it. It is safe to re-run — it rebuilds from scratch each time.

Expected output:

```
  rows in file                      10,000
  rows loaded                       10,000
  rows rejected                          0
  ----------------------------------------------------------
  normalised on the way in:
    epoch-millisecond timestamps     1,007
    DD/MM/YYYY timestamps              841
    date-only timestamps               715
    amounts arriving as strings         20
    status casing folded                25
    rows without a category            200
  ----------------------------------------------------------
  flagged and kept:
    refunds (negative amount)          148
    outlier amounts                      3
    colliding transaction ids           80  (40 ids)
  ----------------------------------------------------------
  coins earned (opening balance)   257,238
```

> The dataset ships in the repo at `backend/data/transactions.json`, so there is
> nothing to copy in.

### 2. Backend

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

API at <http://localhost:8000>, interactive docs at
<http://localhost:8000/docs>.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local     # defaults already point at localhost:8000
npm run dev
```

App at **<http://localhost:3000>**.

> Use `localhost`, not `127.0.0.1`. Next 16 blocks dev-server assets from hosts
> outside `allowedDevOrigins`; both are listed in `next.config.ts`, but
> `localhost` is the path of least resistance.

### 4. Tests

```bash
cd backend
.venv/Scripts/python -m pytest -v
```

Nine tests covering the redeem endpoint — the happy path, insufficient balance,
unknown reward, idempotent replay, out-of-stock, inactive reward, malformed
bodies, stock decrementing, and the derived-balance identity. They run against
the real database and clean up after themselves.

---

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/transactions` | Paged, filtered, sorted list + totals for the whole filtered set |
| `GET` | `/api/transactions/{id}` | One transaction, plus any id-collision siblings |
| `GET` | `/api/analytics/summary` | Category breakdown, monthly trend, totals |
| `GET` | `/api/rewards/balance` | Coin balance (derived) |
| `GET` | `/api/rewards` | Catalogue, with affordability resolved server-side |
| `GET` | `/api/rewards/history` | Past redemptions |
| `POST` | `/api/rewards/redeem` | Redeem — validated, atomic, idempotent |
| `GET` | `/api/meta` | Filter facets, data bounds, data-quality report |
| `GET` | `/health` | Liveness + a real database round trip |

`/api/transactions` and `/api/analytics/summary` accept **identical** filter
parameters. That is what makes cross-filtering two-way.

**Redeem status codes:** `201` created · `200` idempotent replay · `404` no such
reward · `409` insufficient balance / unavailable · `422` malformed body.

---

## Deployment

Frontend on Vercel, backend on Render, Postgres on Neon.

The backend needs `DATABASE_URL` and `CORS_ORIGINS` (the deployed frontend
origin). The frontend needs `NEXT_PUBLIC_API_URL`. Seed the hosted database by
pointing `DATABASE_URL` at it and running `python -m scripts.seed` once.

---

## Done / not done

### Done

- [x] Hand-built table, no component library — sticky header, sort, hover, focus,
      loading, empty and error states, holds to 360px
- [x] All 10,000 rows: filter, search, sort — **server-side**, not in the browser
- [x] Both charts, with **two-way** cross-filtering
- [x] Rewards: visible balance, select → confirm → done, optimistic update with
      rollback
- [x] Backend rejects invalid, unaffordable, sold-out and withdrawn redeems with
      distinct codes
- [x] PostgreSQL 18, real normalised schema, one-command seed
- [x] Server-side pagination, filtering and sorting
- [x] Hand-built modal with focus trap, Escape, scroll lock, focus restoration
- [x] Idempotent redeem, enforced by a unique index
- [x] Nine backend tests
- [x] Dark mode, with its own validated chart palette
- [x] Accessibility: semantic table markup, keyboard-operable rows, skip link,
      live regions, `aria-sort`, focus-visible rings, reduced-motion support
- [x] Data-quality reporting surfaced in the UI

### Not done

- [ ] **No authentication.** Single seeded demo user; every query is already
      scoped by `user_id`, so adding sessions is a change to one dependency.
- [ ] **No frontend tests.** The backend has nine; with the time available I put
      testing effort where a bug would cost real money — the redeem endpoint.
- [ ] **Amount filters are numeric inputs, not a dual-range slider.** A slider
      is nicer; typing exact bounds is more precise. Inputs won on time.
- [ ] **No CSV export, no date presets** ("last 30 days" etc.).
- [ ] **Merchant filter is API-only.** The endpoint accepts `merchant`, but the
      UI exposes merchant through search rather than a dropdown of 49 options.

### Known issues

- **Deep pagination uses `OFFSET`.** Fine at 10k rows; at millions, page 40,000
  would need keyset pagination. Deliberate — see [DECISIONS.md](DECISIONS.md).
- **The donut caps at six categories plus "Other."** There are eleven; beyond
  about eight no categorical palette keeps every slice reliably distinguishable.
  The full breakdown is always in the table.
- **Filter facet counts are unfiltered**, so a dropdown can offer a combination
  that yields zero rows. The alternative — counts that shrink as you filter —
  makes it impossible to widen a selection once narrowed.
- **Render's free tier cold-starts.** The first request after idle can take
  ~30 seconds.
- **`ANALYZE` runs at seed time only.** A long-lived deployment would want
  autovacuum tuning; not relevant for a fixed dataset.

---

## Repo map

```
backend/
  app/
    api/routes/     HTTP layer — no SQL, no business rules
    services/       business rules — no HTTP, no SQL
    repositories/   all SQL lives here
    models/         Pydantic schemas + the shared filter → WHERE builder
    db/             schema.sql, connection pool
  scripts/seed.py   schema + normalise + load, one command
  tests/            redeem endpoint
frontend/
  app/              routes
  components/ui/    the design system: Button, Card, Table, Modal, Drawer, …
  components/       feature components by domain
  lib/              api client, types, formatting, hooks, filter↔URL mapping
  styles/tokens.css design tokens
```

Further reading: [ASSUMPTIONS.md](ASSUMPTIONS.md) ·
[DECISIONS.md](DECISIONS.md) · [AI-USAGE.md](AI-USAGE.md)
