"""One-command schema + seed.

    python -m scripts.seed

Reads ``backend/data/transactions.json``, applies the schema in
``app/db/schema.sql``, normalises the data, and loads it.

The source file is deliberately messy. Every cleaning rule below is a decision,
so each one is stated, counted, and the counts are written to ``ingest_runs``
where the API (and the UI's data-quality panel) can read them. Nothing is
silently dropped.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_FILE = BACKEND_DIR / "data" / "transactions.json"
SCHEMA_FILE = BACKEND_DIR / "app" / "db" / "schema.sql"

# The dataset is entirely Indian: INR, Indian merchants, and the day-first date
# strings are an Indian convention. Timestamps that arrive without a zone are
# therefore read as IST rather than UTC — reading them as UTC would shift 1,556
# transactions back by 5.5 hours and quietly move some across a month boundary,
# which the monthly-trend chart would then get wrong.
IST = timezone(timedelta(hours=5, minutes=30), name="IST")

FALLBACK_CATEGORY = "Uncategorised"

# Matches a bare calendar date with no time component, e.g. "2025-07-03".
_DATE_ONLY_RE = re.compile(r"\d{4}-\d{2}-\d{2}")

# Stable chart colours, assigned in the database so a category is the same
# colour in every chart without the frontend hashing names.
CATEGORY_COLOURS = {
    "Travel": "#6366f1",
    "Shopping": "#ec4899",
    "Utilities": "#0ea5e9",
    "Food & Dining": "#f97316",
    "Health": "#10b981",
    "Education": "#8b5cf6",
    "Entertainment": "#f43f5e",
    "Groceries": "#84cc16",
    "Fuel": "#eab308",
    "Insurance": "#14b8a6",
    FALLBACK_CATEGORY: "#94a3b8",
}


# =============================================================================
# Normalisation
# =============================================================================


def parse_timestamp(raw: object) -> tuple[datetime | None, str | None]:
    """Return (timestamp, note) for the five shapes present in the file.

    The source mixes, in descending order of frequency:
      1. ``2025-10-03T21:03:27Z``          — 5,476 rows, ISO/UTC
      2. ``2026-04-16T18:15:56+05:30``     — 1,961 rows, ISO with an offset
      3. ``1768265109000``                 — 1,007 rows, epoch milliseconds
      4. ``12/10/2025 16:24:49``           —   841 rows, DAY-first
      5. ``2025-07-03``                    —   715 rows, date only

    Form 4 is the trap. ``12/10/2025`` is a valid date under both conventions,
    so the format cannot be settled from one row. Across all 841 values the
    first component reaches 31 and the second never exceeds 12, which is only
    possible if the order is day/month. Read as month-first, 841 rows would
    either fail or land in the wrong month.
    """
    if raw is None:
        return None, "timestamp missing"

    # Epoch milliseconds — arrives as a JSON number, so the type is the tell.
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        try:
            return datetime.fromtimestamp(raw / 1000, tz=UTC), "epoch milliseconds converted to UTC"
        except (OverflowError, OSError, ValueError):
            return None, "timestamp out of range"

    if not isinstance(raw, str):
        return None, "timestamp of unexpected type"

    text = raw.strip()
    if not text:
        return None, "timestamp empty"

    # Form 5 — date only. Checked FIRST, ahead of the general ISO branch,
    # because datetime.fromisoformat happily accepts a bare "2025-07-03" and
    # silently returns midnight. That is the right value but the wrong story:
    # these 715 rows have no time of day in the source at all, and the detail
    # drawer should say so rather than implying the payment landed at 00:00.
    if _DATE_ONLY_RE.fullmatch(text):
        try:
            parsed = datetime.strptime(text, "%Y-%m-%d")
            return parsed.replace(tzinfo=IST), "date only in source, time assumed 00:00 IST"
        except ValueError:
            return None, "timestamp unparseable"

    # Forms 1 and 2 — fromisoformat handles the trailing Z from Python 3.11.
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=IST), "no timezone in source, read as IST"
        return parsed, None
    except ValueError:
        pass

    # Form 4 — day-first, no zone.
    try:
        parsed = datetime.strptime(text, "%d/%m/%Y %H:%M:%S")
        return parsed.replace(tzinfo=IST), "DD/MM/YYYY format, read as IST"
    except ValueError:
        pass

    return None, "timestamp unparseable"


def parse_amount(raw: object) -> tuple[Decimal | None, str | None]:
    """Coerce the amount to Decimal.

    20 of 10,000 rows carry the amount as a JSON string (``"5065.00"``). Every
    one of them is a well-formed number, so they are coerced rather than
    rejected. Decimal, not float, all the way to the NUMERIC column.
    """
    if raw is None:
        return None, "amount missing"

    if isinstance(raw, bool):
        return None, "amount of unexpected type"

    if isinstance(raw, (int, float)):
        return Decimal(str(raw)), None

    if isinstance(raw, str):
        text = raw.strip().replace(",", "").replace("₹", "")
        if not text:
            return None, "amount empty"
        try:
            return Decimal(text), "amount arrived as a string, coerced to a number"
        except InvalidOperation:
            return None, "amount unparseable"

    return None, "amount of unexpected type"


def normalise_status(raw: object) -> tuple[str | None, str | None]:
    """Fold the casing. 25 rows say ``success``; 8,775 say ``SUCCESS``."""
    if not isinstance(raw, str) or not raw.strip():
        return None, "status missing"
    text = raw.strip()
    upper = text.upper()
    if upper not in {"SUCCESS", "PENDING", "FAILED"}:
        return None, f"unrecognised status {text!r}"
    note = "status case normalised" if text != upper else None
    return upper, note


def normalise_category(raw: object, present: bool) -> tuple[str, str | None]:
    """Map absent categories onto a single explicit bucket.

    200 rows have no usable category, in three distinct ways: 150 hold a JSON
    null, 50 omit the key entirely, and some hold an empty string. Collapsing
    them into one visible ``Uncategorised`` bucket keeps category_id NOT NULL,
    keeps GROUP BY honest, and gives the user something to filter on — where a
    NULL would just vanish from the breakdown without explanation.
    """
    if not present:
        return FALLBACK_CATEGORY, "category field absent, bucketed as Uncategorised"
    if raw is None:
        return FALLBACK_CATEGORY, "category was null, bucketed as Uncategorised"
    if isinstance(raw, str) and not raw.strip():
        return FALLBACK_CATEGORY, "category was empty, bucketed as Uncategorised"
    if not isinstance(raw, str):
        return FALLBACK_CATEGORY, "category of unexpected type, bucketed as Uncategorised"
    return raw.strip(), None


def coins_for(
    amount: Decimal, status: str, is_outlier: bool, rupees_per_coin: int, cap: int
) -> int:
    """One coin per ₹100 of a successful payment, capped per transaction.

    Excluded from earning: failed and pending payments (the money never moved),
    refunds (a negative amount is money coming back), and outliers (a ₹100
    crore grocery bill is a data error, and paying coins on it — even capped —
    would be rewarding corrupt data).
    """
    if status != "SUCCESS" or amount <= 0 or is_outlier:
        return 0
    return min(cap, int(amount // rupees_per_coin))


# =============================================================================
# Seed
# =============================================================================


def main() -> int:
    settings = get_settings()

    if not DATA_FILE.exists():
        print(f"ERROR: dataset not found at {DATA_FILE}", file=sys.stderr)
        print("Copy the provided transactions.json to backend/data/", file=sys.stderr)
        return 1

    print(f"Reading  {DATA_FILE.relative_to(BACKEND_DIR.parent)}")
    raw_rows = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    print(f"         {len(raw_rows):,} records in file")

    report: Counter[str] = Counter()
    rejected: list[dict] = []

    # --- Pass 1: find external_ids used by more than one row ------------------
    # 40 ids appear twice, and no pair holds identical rows — each pair is two
    # different transactions that collided on an identifier. Both are kept.
    id_counts: Counter[str] = Counter(
        r["id"] for r in raw_rows if isinstance(r.get("id"), str)
    )
    collided = {external_id for external_id, n in id_counts.items() if n > 1}
    report["duplicate_external_ids"] = len(collided)
    report["rows_with_duplicate_external_id"] = sum(id_counts[i] for i in collided)

    # --- Pass 2: normalise ----------------------------------------------------
    print("Cleaning ...")
    cleaned: list[dict] = []
    merchants: set[str] = set()
    categories: set[str] = set()

    for raw in raw_rows:
        notes: list[str] = []

        external_id = raw.get("id")
        if not isinstance(external_id, str) or not external_id.strip():
            rejected.append({"row": raw, "reason": "missing id"})
            report["rejected_missing_id"] += 1
            continue
        external_id = external_id.strip()

        occurred_at, ts_note = parse_timestamp(raw.get("timestamp"))
        if occurred_at is None:
            rejected.append({"row": raw, "reason": ts_note})
            report["rejected_bad_timestamp"] += 1
            continue
        if ts_note:
            notes.append(ts_note)
            if "epoch" in ts_note:
                report["epoch_millisecond_timestamps"] += 1
            elif "DD/MM" in ts_note:
                report["day_first_timestamps"] += 1
            elif "date only" in ts_note:
                report["date_only_timestamps"] += 1
            elif "no timezone" in ts_note:
                report["naive_timestamps"] += 1

        amount, amt_note = parse_amount(raw.get("amount"))
        if amount is None:
            rejected.append({"row": raw, "reason": amt_note})
            report["rejected_bad_amount"] += 1
            continue
        if amt_note:
            notes.append(amt_note)
            report["string_amounts_coerced"] += 1

        status, status_note = normalise_status(raw.get("status"))
        if status is None:
            rejected.append({"row": raw, "reason": status_note})
            report["rejected_bad_status"] += 1
            continue
        if status_note:
            notes.append(status_note)
            report["status_case_normalised"] += 1

        category, cat_note = normalise_category(
            raw.get("category"), "category" in raw
        )
        if cat_note:
            notes.append(cat_note)
            report["uncategorised_rows"] += 1

        merchant = raw.get("merchant")
        if not isinstance(merchant, str) or not merchant.strip():
            rejected.append({"row": raw, "reason": "missing merchant"})
            report["rejected_missing_merchant"] += 1
            continue
        merchant = merchant.strip()

        payment_method = raw.get("payment_method")
        if payment_method not in {"Credit Card", "Debit Card", "UPI", "Netbanking"}:
            rejected.append({"row": raw, "reason": f"unknown payment method {payment_method!r}"})
            report["rejected_bad_payment_method"] += 1
            continue

        currency = raw.get("currency") or "INR"

        is_refund = amount < 0
        if is_refund:
            notes.append("negative amount, treated as a refund")
            report["refunds"] += 1

        is_outlier = abs(amount) >= settings.outlier_amount_threshold
        if is_outlier:
            notes.append(
                f"amount above the ₹{settings.outlier_amount_threshold:,} review "
                "threshold, excluded from analytics"
            )
            report["outlier_amounts"] += 1

        is_id_collision = external_id in collided
        if is_id_collision:
            notes.append("this transaction id is shared with another transaction")

        coins = coins_for(
            amount,
            status,
            is_outlier,
            settings.coin_rupees_per_coin,
            settings.coin_cap_per_txn,
        )

        merchants.add(merchant)
        categories.add(category)

        cleaned.append(
            {
                "external_id": external_id,
                "merchant": merchant,
                "category": category,
                "occurred_at": occurred_at,
                # The IST calendar date of this instant. Everything the user
                # filters and groups by is their local date, not the UTC one.
                "occurred_on": occurred_at.astimezone(IST).date(),
                "amount": amount,
                "currency": currency,
                "status": status,
                "payment_method": payment_method,
                "coins_earned": coins,
                "is_refund": is_refund,
                "is_outlier": is_outlier,
                "is_id_collision": is_id_collision,
                "raw_timestamp": str(raw.get("timestamp")),
                "ingest_notes": notes,
            }
        )

    report["rows_loaded"] = len(cleaned)
    report["rows_rejected"] = len(rejected)
    report["rows_in_file"] = len(raw_rows)

    categories.add(FALLBACK_CATEGORY)

    # --- Pass 3: write --------------------------------------------------------
    print(f"Connecting to {settings.database_url.split('@')[-1]}")
    with psycopg.connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            print("Applying schema ...")
            cur.execute(SCHEMA_FILE.read_text(encoding="utf-8"))

            cur.execute(
                """
                INSERT INTO users (email, display_name)
                VALUES (%s, %s)
                RETURNING id
                """,
                (settings.demo_user_email, "Sameer"),
            )
            user_id = cur.fetchone()[0]

            print(f"Inserting {len(categories)} categories, {len(merchants)} merchants ...")
            category_ids: dict[str, int] = {}
            for name in sorted(categories):
                cur.execute(
                    """
                    INSERT INTO categories (name, colour, is_fallback)
                    VALUES (%s, %s, %s)
                    RETURNING id
                    """,
                    (
                        name,
                        CATEGORY_COLOURS.get(name, "#94a3b8"),
                        name == FALLBACK_CATEGORY,
                    ),
                )
                category_ids[name] = cur.fetchone()[0]

            merchant_ids: dict[str, int] = {}
            for name in sorted(merchants):
                cur.execute(
                    "INSERT INTO merchants (name) VALUES (%s) RETURNING id", (name,)
                )
                merchant_ids[name] = cur.fetchone()[0]

            print(f"Copying {len(cleaned):,} transactions ...")
            copy_sql = """
                COPY transactions (
                    external_id, user_id, merchant_id, category_id,
                    occurred_at, occurred_on,
                    amount, currency, status, payment_method, coins_earned,
                    is_refund, is_outlier, is_id_collision, raw_timestamp, ingest_notes
                ) FROM STDIN
            """
            with cur.copy(copy_sql) as copy:
                for row in cleaned:
                    copy.write_row(
                        (
                            row["external_id"],
                            user_id,
                            merchant_ids[row["merchant"]],
                            category_ids[row["category"]],
                            row["occurred_at"],
                            row["occurred_on"],
                            row["amount"],
                            row["currency"],
                            row["status"],
                            row["payment_method"],
                            row["coins_earned"],
                            row["is_refund"],
                            row["is_outlier"],
                            row["is_id_collision"],
                            row["raw_timestamp"],
                            row["ingest_notes"],
                        )
                    )

            print("Inserting rewards catalogue ...")
            for reward in REWARDS:
                cur.execute(
                    """
                    INSERT INTO rewards
                        (slug, title, description, brand, coin_cost, inr_value, stock, sort_order)
                    VALUES (%(slug)s, %(title)s, %(description)s, %(brand)s,
                            %(coin_cost)s, %(inr_value)s, %(stock)s, %(sort_order)s)
                    """,
                    reward,
                )

            cur.execute(
                """
                INSERT INTO ingest_runs (source_file, rows_in_file, rows_loaded, report)
                VALUES (%s, %s, %s, %s)
                """,
                (DATA_FILE.name, len(raw_rows), len(cleaned), json.dumps(dict(report))),
            )

            cur.execute("ANALYZE transactions")

            cur.execute(
                "SELECT COALESCE(SUM(coins_earned), 0) FROM transactions WHERE user_id = %s",
                (user_id,),
            )
            total_coins = cur.fetchone()[0]

        conn.commit()

    # --- Report ---------------------------------------------------------------
    print()
    print("=" * 62)
    print("  SEED COMPLETE")
    print("=" * 62)
    print(f"  rows in file                  {report['rows_in_file']:>10,}")
    print(f"  rows loaded                   {report['rows_loaded']:>10,}")
    print(f"  rows rejected                 {report['rows_rejected']:>10,}")
    print("  " + "-" * 58)
    print("  normalised on the way in:")
    print(f"    epoch-millisecond timestamps{report['epoch_millisecond_timestamps']:>10,}")
    print(f"    DD/MM/YYYY timestamps       {report['day_first_timestamps']:>10,}")
    print(f"    date-only timestamps        {report['date_only_timestamps']:>10,}")
    print(f"    amounts arriving as strings {report['string_amounts_coerced']:>10,}")
    print(f"    status casing folded        {report['status_case_normalised']:>10,}")
    print(f"    rows without a category     {report['uncategorised_rows']:>10,}")
    print("  " + "-" * 58)
    print("  flagged and kept:")
    print(f"    refunds (negative amount)   {report['refunds']:>10,}")
    print(f"    outlier amounts             {report['outlier_amounts']:>10,}")
    print(f"    colliding transaction ids   {report['rows_with_duplicate_external_id']:>10,}"
          f"  ({report['duplicate_external_ids']} ids)")
    print("  " + "-" * 58)
    print(f"  coins earned (opening balance){total_coins:>10,}")
    print("=" * 62)

    if rejected:
        out = BACKEND_DIR / "data" / "rejected-rows.json"
        out.write_text(json.dumps(rejected, indent=2, default=str), encoding="utf-8")
        print(f"\n  {len(rejected)} rejected rows written to {out.name} for inspection")

    return 0


# =============================================================================
# Rewards catalogue
#
# Six rewards, priced against the ~256,000 coins the seeded history earns.
# The annual-fee waiver is deliberately priced above that opening balance so
# the "not enough coins" rejection is reachable in a demo without first
# spending the balance down.
# =============================================================================

REWARDS = [
    {
        "slug": "amazon-500",
        "title": "₹500 Amazon voucher",
        "description": "A ₹500 Amazon gift card, delivered to your email within 24 hours.",
        "brand": "Amazon",
        "coin_cost": 5_000,
        "inr_value": Decimal("500.00"),
        "stock": None,
        "sort_order": 1,
    },
    {
        "slug": "swiggy-250",
        "title": "₹250 off on Swiggy",
        "description": "Flat ₹250 off your next two Swiggy orders above ₹399.",
        "brand": "Swiggy",
        "coin_cost": 3_000,
        "inr_value": Decimal("250.00"),
        "stock": None,
        "sort_order": 2,
    },
    {
        "slug": "statement-cashback-1000",
        "title": "₹1,000 statement cashback",
        "description": "Credited against your next credit-card bill, no minimum spend.",
        "brand": "CoinStack",
        "coin_cost": 12_000,
        "inr_value": Decimal("1000.00"),
        "stock": None,
        "sort_order": 3,
    },
    {
        "slug": "bookmyshow-pair",
        "title": "Two movie tickets",
        "description": "A pair of BookMyShow tickets, any show, any screen, worth ₹600.",
        "brand": "BookMyShow",
        "coin_cost": 7_000,
        "inr_value": Decimal("600.00"),
        "stock": 25,
        "sort_order": 4,
    },
    {
        "slug": "myntra-750",
        "title": "₹750 Myntra credit",
        "description": "₹750 off any Myntra order above ₹1,999. Valid for 60 days.",
        "brand": "Myntra",
        "coin_cost": 8_000,
        "inr_value": Decimal("750.00"),
        "stock": None,
        "sort_order": 5,
    },
    {
        "slug": "annual-fee-waiver",
        "title": "Annual fee waiver",
        "description": "We waive next year's ₹2,999 card fee. The big one.",
        "brand": "CoinStack",
        "coin_cost": 300_000,
        "inr_value": Decimal("2999.00"),
        "stock": 1,
        "sort_order": 6,
    },
]


if __name__ == "__main__":
    raise SystemExit(main())
