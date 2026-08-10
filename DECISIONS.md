# Technical decisions

The choices that mattered, and why. Product calls are in
[ASSUMPTIONS.md](ASSUMPTIONS.md).

---

## Pagination, not virtualisation

**Server-side pagination via `LIMIT`/`OFFSET`, 25 rows a page.**

Virtualisation solves a rendering problem — too many DOM nodes — but leaves the
transport problem alone: you still ship all 10,000 rows to the browser. That is
about 2 MB of JSON on every filter change, parsed and held in memory, and it only
gets worse as a real account accumulates history.

Paginating on the server means:

- the response is ~25 rows regardless of dataset size, so cost is flat as the
  data grows
- the database does the filtering and sorting, using indexes built for exactly
  that, instead of the main thread doing it after a download
- sorting is correct across the **whole** result set, not just what's loaded — a
  virtualised client-side sort can only order the rows it has

The trade-off is a network round trip per page instead of an instant scroll. It's
mitigated by keeping the previous page on screen, dimmed, while the next loads,
so the layout never collapses.

`LIMIT`/`OFFSET` over keyset pagination specifically because the UI offers
jump-to-page and a total count, neither of which keyset can express. Deep offsets
are Postgres's known weak spot for this pattern, but 400 pages over 10k indexed
rows is nowhere near where that bites.

Every `ORDER BY` carries an `id` tiebreak. Without one, rows with an equal sort
key can come back in a different order on different pages — a row appears twice
while another never shows at all.

## The URL is the state container

No Redux, no Zustand, no client cache library. Filters, sort, page and page size
all live in the query string, parsed on render.

- a filtered view is shareable and survives a reload
- Back steps through filter changes
- the table and the charts **cannot** disagree, because there is only one copy of
  "the current filters" and it's in the address bar

React state is used only where it genuinely is local: which drawer is open, the
search input's draft text, the redeem dialog's step.

The search box is the one exception — it holds its own draft and only writes the
debounced value to the URL. Writing every keystroke would flood history and make
Back useless.

Filter changes use `router.replace`, not `push`, so tweaking a filter five times
doesn't need five Back presses to escape.

## Cross-filtering is two-way for free

`/api/transactions` and `/api/analytics/summary` take **the same query
parameters** and build their `WHERE` clause from the same `TransactionFilters`
object (`backend/app/models/filters.py`).

That single shared definition is the whole mechanism:

- click a donut slice → a category joins the filters → table narrows **and** the
  trend chart re-aggregates
- click a month bar → the same, in reverse
- type in the search box → both reshape

Had each endpoint built its own clause, they would eventually drift and the
charts would describe a different set of rows than the table directly below them.

## The coin balance is derived, never stored

```
balance = SUM(transactions.coins_earned) − SUM(completed redemptions)
```

There is no `users.coin_balance` column. A stored counter has to be updated in
lockstep with the ledger, and any partial failure leaves the two disagreeing with
no way to tell which is right.

Deriving it makes that class of bug impossible: a failed redeem rolls back, the
inputs to the sum are unchanged, and the balance is automatically correct. It's
also what makes the optimistic UI safe — "put the old number back" is always the
right recovery, because a rejected redeem genuinely wrote nothing.

The cost is a two-subquery aggregate per read, which on 10k indexed rows is
sub-millisecond. If this became hot, the fix is a materialised view, not a
mutable counter.

## Redeem: locks, then reads

```sql
SELECT ... FROM users WHERE id = ? FOR UPDATE   -- serialise concurrent redeems
-- check idempotency key
SELECT ... FROM rewards WHERE id = ? FOR UPDATE -- prevent overselling stock
-- re-derive balance, check affordability
INSERT INTO redemptions ...
```

All inside one transaction. Order matters: the lock is taken **before** anything
is read that will be acted on. Reading the balance first and locking afterwards
reintroduces exactly the race the lock exists to close — two requests both read
100 coins, both approve a 90-coin reward, and 180 coins get spent.

`request_id` is a client-supplied UUID with a **unique index**. A client that
retries after a timeout gets its original redemption back with
`idempotent_replay: true` and HTTP 200 rather than 201, instead of being charged
twice. Enforcing it at the index rather than only in application code means two
genuinely concurrent retries can't both slip through.

Status codes: **404** for a reward that doesn't exist, **409** for one that's too
expensive or unavailable, **422** for a malformed body. 409 rather than 400 on
affordability because the request is perfectly well-formed — it conflicts with
current state, and the same request succeeds once the balance is high enough.

## Schema: lookup tables, and a deliberately non-unique id

`merchants` and `categories` are separate tables. 10,000 transactions reference
49 merchants and 11 categories; joining beats storing those strings 10,000 times,
and it gives the filter dropdowns an authoritative source with counts.

`transactions.external_id` is **not unique**, and that is the single most
consequential schema decision here. The obvious move — make the provided `id` the
primary key — fails on this data, because 40 ids are shared by two genuinely
different transactions. A unique constraint would force dropping 40 real
payments. See ASSUMPTIONS.md.

`amount` is `NUMERIC(14,2)`, never a float. Money in binary floating point is a
bug waiting for a reconciliation report to find it.

`occurred_on DATE` is stored alongside `occurred_at TIMESTAMPTZ`. Two reasons:

1. **Correctness.** A user filtering "March" means March in IST. A payment at
   `2026-03-01T02:00+05:30` is 28 February in UTC — grouping on the timestamptz
   files it in the wrong month.
2. **Indexability.** `date_trunc(text, timestamptz)` is only `STABLE`, because its
   answer depends on the session timezone, so Postgres refuses to index it.
   `date_trunc(text, timestamp)` is `IMMUTABLE`. Storing the date makes the
   monthly aggregate an index read rather than a per-row recomputation. The
   `::timestamp` cast in both the index and the query is load-bearing — a bare
   `DATE` argument resolves to the `timestamptz` overload and the index build
   fails outright.

## CSS Modules and hand-written tokens, no Tailwind

The brief asks for design tokens and says the table is "the main place we look at
your CSS". Utility classes would have hidden that behind a framework's
abstractions.

`styles/tokens.css` has two layers: raw primitives (`--slate-500`, `--space-4`)
and semantic roles (`--surface`, `--text-muted`, `--border-strong`). Components
only ever use the semantic layer. That indirection is what makes the dark theme a
~40-line override instead of a second stylesheet — a component asking for "the
raised surface colour" keeps working when that resolves to near-black; one asking
for "grey 50" does not.

CSS Modules over CSS-in-JS: styles are static, so they ship as a real stylesheet
with no runtime cost and no flash of unstyled content.

## The table is hand-built

No library, as required. What that meant in practice:

- `table-layout: fixed` with `<col>` widths. With `auto`, column widths come from
  content, so they shift as you page and the table visibly twitches.
- The sticky header uses `box-shadow: inset 0 -1px 0` rather than
  `border-bottom`. With `border-collapse: separate`, a border on a sticky cell
  scrolls away with it; a box-shadow is painted on the element and stays.
- Below 720px each row becomes a stacked card, with column names injected from a
  `data-label` attribute. A horizontally scrolling 8-column table at 360px is
  technically readable and practically useless — you can't see the merchant and
  the amount at once, which is the only comparison that matters.
- The header is hidden on mobile with a clip rect, **not** `display: none`, which
  would also remove it from the accessibility tree.
- Rows are `tabIndex=0` with Enter/Space handlers, so the drawer is reachable
  without a mouse.

## Fetching: a ~90-line hook, not a library

`lib/useApi.ts`. Five endpoints didn't justify TanStack Query's cache
invalidation model, but two problems did need solving properly:

**Out-of-order responses.** Typing "zom" fires three requests. If the response
for "zo" lands after "zom", the table shows results for a query the input no
longer contains. Every request carries a sequence number and a late response is
discarded.

**Wasted work.** Superseded requests are aborted rather than left to complete.

Previous data is deliberately kept during a refetch. Blanking the table on every
keystroke makes the page flash and jump; dimming it in place reads as much faster
than replacing it.

## Client Components, not Server Components

The dashboard pages are client-rendered. Given filters live in the URL and the
data comes from a separate FastAPI service at runtime, server-rendering the table
would add an SSR round trip on every filter change for no benefit — and the
charts are interactive anyway.

Next.js still earns its place: App Router, the `useSearchParams`/`useRouter` APIs
that make URL-as-state ergonomic, `next/font` (self-hosted, preloaded, no layout
shift from a late webfont), and the Vercel build. If this app grew a marketing
page or needed SEO, that's where Server Components would start paying.

## Chart colours were validated, not chosen by eye

The first palette I picked looked fine to me and **failed** a colour-blindness
check: teal against grey measured ΔE 2.2 under deuteranopia — indistinguishable
for roughly 1 in 12 men.

The palette now in the database was run through a validator until every adjacent
pair cleared separation, lightness-band, chroma and contrast gates on **both** the
light and the dark chart surface. Dark mode gets its own steps for each hue, not
an automatic lightening, because a colour tuned for white either glares or
muddies on near-black.

Colour is bound to the **category name**, in the database. Two consequences: a
category is the same colour in every chart, legend, table swatch and filter chip;
and filtering never repaints the survivors, which would happen instantly if
colour followed "biggest slice first".

Identity is never carried by colour alone — every legend entry, badge and tooltip
names its category next to the swatch.

## Bars for the trend, and no second axis

Months are discrete buckets, so bars rather than a line: a line implies a
meaningful reading halfway between March and April, and there isn't one.

Refunds are **not** drawn as a second series on a second y-axis. A dual-axis chart
invites comparing two scales that have no relationship. Refunds appear in the
tooltip instead, where they can be read directly against the spend figure.

## Testing: real Postgres, not mocks

`backend/tests/test_redeem.py` runs against the actual database. The parts of
redeem most likely to break — the row lock, the atomicity of check-then-insert,
the unique index on `request_id` — are database behaviour. A mocked repository
would assert that the mock works.

Every rejection test also asserts the balance is **unchanged**, because that is
precisely the guarantee the frontend's optimistic rollback depends on.
