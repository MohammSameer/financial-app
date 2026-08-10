# Assumptions

Where the brief left something open, this is the call I made and why. Anything
here is a product decision, not a technical one — those live in
[DECISIONS.md](DECISIONS.md).

---

## Rewards

### The per-transaction coin cap is 50 coins

The brief says "one coin per ₹100 spent, capped per transaction" without naming
the cap. Uncapped, this dataset mints **10,614,633 coins** — the ₹99,99,99,999
row alone would be worth 10 million of them, which makes the whole currency
meaningless.

I set the cap at **50 coins**, so coins accrue on the first ₹5,000 of any single
payment. That yields an opening balance of **257,238 coins** and keeps a large
payment worth more than a small one without letting one transaction dominate.
The value is configurable via `COIN_CAP_PER_TXN`.

### Refunds, failures and flagged amounts earn nothing

- **Failed and pending payments** — the money never moved.
- **Refunds** (negative amounts) — money coming back, not spending. I did *not*
  claw back coins for refunds; there is no matching original transaction in the
  data to reverse against, and clawing back would need a pairing rule the data
  cannot support.
- **Flagged outliers** — a ₹99,99,99,999 grocery bill is a data error. Even
  capped at 50 coins, paying out on corrupt data is the wrong behaviour.

### All four payment methods earn coins

The app is framed as credit-card bill payment, but the dataset has UPI,
Netbanking and Debit Card too. Restricting earning to Credit Card would zero out
75% of the history for no stated reason, so every successful payment earns.

### The catalogue is six rewards I invented

The brief says define four to six. The annual fee waiver is deliberately priced
at **300,000 coins — above the opening balance of 257,238** — so the "not enough
coins" rejection is reachable in a demo without first spending down. Two rewards
carry finite stock so "sold out" is a distinct, testable failure from
"unaffordable".

### A redeem is final

No cancellation or expiry. The `redemptions` table has a `REVERSED` status and
the balance query already ignores reversed rows, so a refund flow is additive
rather than a redesign — but nothing in the UI triggers it.

---

## The dataset

The provided file is deliberately messy. Every rule below is applied by
`backend/scripts/seed.py`, counted, and stored in the `ingest_runs` table — the
dashboard surfaces the counts in a banner, and each affected row explains itself
in the detail drawer. **All 10,000 rows load; nothing is dropped.**

### Timestamps without a zone are read as IST, not UTC

Five distinct representations appear:

| Form | Rows | Handling |
|---|---:|---|
| `2025-10-03T21:03:27Z` | 5,476 | as-is, UTC |
| `2026-04-16T18:15:56+05:30` | 1,961 | as-is, offset respected |
| `1768265109000` (epoch ms) | 1,007 | ÷1000 → UTC |
| `12/10/2025 16:24:49` | 841 | **day-first** |
| `2025-07-03` (date only) | 715 | midnight IST assumed |

Two judgement calls here:

**`DD/MM/YYYY`, not `MM/DD/YYYY`.** A single row like `12/10/2025` is valid under
both readings. Across all 841 values the first component reaches **31** and the
second never exceeds **12**, which is only possible if the order is day/month.
Read as month-first, those rows would either fail to parse or land in the wrong
month and quietly corrupt the trend chart.

**Naive timestamps are IST.** The data is entirely Indian — INR, Indian
merchants, day-first dates. Reading the 1,556 zone-less values as UTC would shift
them back 5.5 hours and push some across a month boundary. Since the trend chart
groups by month, that would be a visible wrong answer.

The **original string is kept** on every row (`raw_timestamp`) so any of this can
be revisited without re-reading the file.

### Duplicate transaction ids are kept, both of them

40 ids appear twice. **Not one of those 40 pairs is a duplicate row** — each pair
holds a different merchant, amount and date. Example, `TXN2025004175`:

- BPCL, Fuel, ₹1,580.52, 13 Jul 2026
- Flipkart, Shopping, ₹12,685.00, 20 Feb 2026

These are two real transactions that collided on an identifier. Deduplicating
would destroy 40 genuine payments and ₹-value with them. Both rows are kept, the
table keys on an internal surrogate id, and `external_id` is deliberately **not
unique**. Affected rows are badged, and opening one shows the transaction it
collided with.

### Rows with no category become "Uncategorised"

200 rows, in three different shapes: 150 hold a JSON `null`, 50 omit the key
entirely, and some hold an empty string. All three collapse into one visible
`Uncategorised` bucket rather than a NULL, so the rows stay filterable and the
category breakdown still adds up. It is styled as a neutral grey and sorts last —
it is missing data, not a kind of spending.

### Negative amounts are refunds

148 rows, all marked `SUCCESS`. Treated as refunds: excluded from "spend", shown
in green with a `+`, reported separately in the tooltip, and earning no coins.

### Amounts at or above ₹1,00,000 are flagged, not deleted

Three rows qualify, including one of **₹99,99,99,999** at JioMart. The dataset's
99.9th percentile is ₹54,750, so ₹1,00,000 is comfortably clear of real spending.

Flagged rows are **kept and visible in the table** with a warning badge, but
**excluded from analytics**. Left in, that single row is 94% of all spending and
flattens every other category to an invisible sliver. Deleting it would be
dishonest; letting it wreck every chart would be worse.

### 20 string amounts and 25 lowercase statuses are coerced

`"5065.00"` → `5065.00`, and `success` → `SUCCESS`. Every one is well-formed, so
coercing is safe. Both are recorded per-row.

---

## Product scope

### One user, no authentication

The brief describes a personal app ("looking at your own spending") and says
nothing about accounts. There is no login. Every query is still scoped by
`user_id` against a seeded demo user, so adding real sessions means changing one
dependency function rather than every query.

### "Spend" means successful, positive, non-outlier

The figure quoted in the stat tiles, the donut and the trend chart. Failed
payments never moved money, pending ones haven't yet, refunds are money
returning, and outliers are data errors. Refunds are reported separately rather
than netted off, so a month with a large refund doesn't silently look cheap.

### Filter dropdown counts are unfiltered

Each option shows its total across the whole dataset, not within the current
filter. A facet list that shrinks as you filter makes it impossible to widen a
selection — the option you want has already disappeared from the list.

### Dates are shown in IST for everyone

Regardless of the viewer's timezone. The data is Indian and the backend groups by
IST calendar date; rendering in the browser's zone would show a reviewer in New
Jersey dates that disagree with the month buckets in the chart above them.

### The donut shows six categories plus "Other"

There are eleven. Beyond about eight, a categorical colour scale can no longer
keep every slice reliably distinguishable — and the smallest three are each under
2% of spend, so they'd be unclickable slivers. The full breakdown is always
available in the table.
