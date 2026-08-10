# AI usage

## Tools

**Claude (Anthropic), via Claude Code in VS Code** — the main one. Used for
scaffolding, writing first drafts of components and endpoints, and as a
sounding board on schema and state-management decisions.

**GitHub Copilot** — inline completion while editing, mostly for repetitive
things: filling out the remaining fields of a Pydantic model once the first two
were typed, CSS property blocks, test cases following an established pattern.

## Where I used it, and where I didn't

**Heavily:**

- First drafts of the repetitive layers — the repository functions, the Pydantic
  response models, the CSS Module files. Once the pattern for one existed, the
  rest is mechanical.
- The seed script's parsing branches. I identified the five timestamp formats by
  profiling the file myself; generating a parser for each was faster with help.
- Documentation drafts, including the first pass of this file.

**Barely, or not at all:**

- The **schema**. The consequential call — that `external_id` must not be unique
  — came from profiling the data and finding that the 40 duplicate ids hold
  genuinely different transactions. No tool told me that; I only found it because
  I checked whether the duplicate pairs were identical rows, and they weren't.
- The **redeem transaction ordering**. Lock, then read, then write. Suggestions I
  got read the balance first and locked afterwards, which leaves exactly the race
  the lock is there to close.
- The **responsive table strategy**. Turning rows into stacked cards below 720px
  was a judgement call about what a person actually needs to see on a phone.

Everything below is something I threw away or had to fix.

---

## Things I threw away

### 1. A chart palette that failed colour-blindness checks

The first category palette I got was pleasant-looking Tailwind-adjacent hues:
indigo, pink, sky, orange, emerald, violet, rose, lime, yellow, teal, slate.
It looked good to me, so I nearly shipped it.

Running it through a contrast/CVD validator, it failed on four counts:

```
[FAIL] Chroma floor       #94a3b8 reads as grey
[FAIL] CVD separation     #94a3b8 vs #14b8a6  ΔE 2.2 (deuteranopia)
[FAIL] Normal-vision floor #94a3b8 vs #14b8a6 ΔE 11.9 — below the 15 floor
[FAIL] Lightness band     #eab308 outside the band
```

ΔE 2.2 under deuteranopia means teal and grey were effectively the same colour
for roughly 1 in 12 men. Two slices of the donut would have been indistinguishable
— and I'd have had no idea, because they look obviously different to me.

**What I did:** rebuilt the palette against a validated reference set, then
iterated. Cyan sitting next to magenta failed in dark mode (ΔE 2.3), so I
reordered the hues; the cyan step was outside the dark lightness band, so I
darkened it. Final light and dark sets both pass every gate. Both are stored in
the database (`categories.colour`, `categories.colour_dark`).

**What I actually learnt:** dark mode is not a lightening pass. Each hue needs
its own step chosen against the dark surface, or it either glares or muddies.
And "it looks fine to me" is not a colour accessibility check.

### 2. An index Postgres refused to build

The obvious way to index the monthly aggregate:

```sql
CREATE INDEX ON transactions (user_id, (date_trunc('month', occurred_at)));
```

```
psycopg.errors.InvalidObjectDefinition:
  functions in index expression must be marked IMMUTABLE
```

`date_trunc(text, timestamptz)` is only `STABLE` — its answer depends on the
session `TimeZone`, so the same row could land in different buckets for different
sessions, and Postgres won't index that.

My first fix — casting to `DATE` — failed identically. Checking the catalogue
showed why:

```
date_trunc | text, timestamp with time zone | s   <- stable
date_trunc | text, timestamp without time zone | i <- immutable
```

A bare `DATE` argument resolves to the **timestamptz** overload. It needs an
explicit `::timestamp` cast to pick the immutable one.

**What I did:** stored `occurred_on DATE` — the IST calendar date — alongside
`occurred_at TIMESTAMPTZ`, and indexed
`date_trunc('month', occurred_on::timestamp)`.

**Why this turned out to be the right answer anyway:** it's not just an
indexing workaround. A user filtering "March" means March *in IST*. A payment at
`2026-03-01T02:00+05:30` is 28 February in UTC — grouping on the timestamptz
would file it in the wrong month. The error pushed me to a model that is also
more correct.

---

## Things I had to fix

### 3. A Docker config from before PostgreSQL 18

The compose file I started with used the mount path every tutorial shows:

```yaml
volumes:
  - pgdata:/var/lib/postgresql/data
```

The container crash-looped:

> `there appears to be PostgreSQL data in /var/lib/postgresql/data (unused
> mount/volume)`

PostgreSQL 18's images changed this. Data now lives in a major-version
subdirectory so `pg_upgrade --link` works across the mount boundary, so the
volume belongs at `/var/lib/postgresql`. Pre-18 guidance is confidently wrong
here, and there's a lot more of it.

### 4. A cleaning counter that silently read zero

My seed reported `date-only timestamps: 0`. I knew from profiling the file that
there were 715.

`datetime.fromisoformat("2025-07-03")` succeeds in Python 3.11+ and quietly
returns midnight. So those rows were caught by the general ISO branch and got a
generic note instead of "no time of day in the source".

The *value* was right. The *provenance* was wrong — and since the whole point of
the drawer is to say what was assumed about each row, "midnight because the
source had no time" is exactly the thing that must not be silently lost.

**Fix:** test for a bare date explicitly, before the general branch.

### 5. Stacked mobile rows that only filled two-thirds of the width

Below 720px each table row becomes a card. The CSS set `display: block` on the
rows but left the `<table>` and `<tbody>` as table elements. The rows were still
laid out by the table algorithm, so they took their width from the `<colgroup>`
percentages rather than the container — cards at about two-thirds width with a
gap down the right side.

I only caught this by screenshotting the running app at 360px. It type-checked,
it built, and it looked fine at desktop width.

**Fix:** drop the table display on the element, the tbody and the rows together.

---

## The honest summary

AI made me faster at the parts that were already decided — turning a settled
pattern into fifteen more instances of it, and getting a first draft on the page
so I could react to something concrete.

It was least useful exactly where the marks are: the schema decision that came
from actually profiling the data, the lock ordering in the redeem transaction,
and every judgement about what a person needs to see on a 360px screen.

The through-line in every mistake above is that the generated code was
*plausible*. It compiled. It followed a common pattern. It was wrong for reasons
only visible by running the thing and checking — a validator for the palette, the
Postgres catalogue for the index, a screenshot for the layout, and my own profile
of the source file for the counter. Every one of those checks is something I had
to decide to run.
