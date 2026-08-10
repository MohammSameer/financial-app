"""Response models.

These are the API contract. The frontend's TypeScript types mirror them, so a
field renamed here is meant to be a visible, deliberate break rather than a
silently-undefined value in a table cell.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Transaction(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    external_id: str
    occurred_at: datetime
    occurred_on: date
    merchant: str
    category: str
    category_colour: str
    category_colour_dark: str
    amount: Decimal
    currency: str
    status: str
    payment_method: str
    coins_earned: int

    # Ingest flags. The table shows these as badges and the drawer explains
    # them, which is how the messiness in the source data stays visible to the
    # user instead of being quietly laundered.
    is_refund: bool
    is_outlier: bool
    is_id_collision: bool
    raw_timestamp: str
    ingest_notes: list[str]


class PageMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int
    has_next: bool
    has_prev: bool


class TransactionTotals(BaseModel):
    """Totals across the whole filtered set, not just the current page.

    Computed server-side in the same query as the count. The browser only ever
    holds one page, so it cannot add these up itself.
    """

    # Positive successful payments only. Refunds, failures, pending and
    # outliers are excluded, because "you spent this much" should mean money
    # that actually left the account.
    total_spend: Decimal
    # Absolute value of negative amounts.
    total_refunded: Decimal
    transaction_count: int
    # Payments counted in total_spend.
    successful_count: int
    average_spend: Decimal
    coins_earned: int


class TransactionPage(BaseModel):
    items: list[Transaction]
    meta: PageMeta
    totals: TransactionTotals


class CategorySlice(BaseModel):
    category: str
    colour: str
    colour_dark: str
    total: Decimal
    count: int
    # Share of the filtered total, 0-100, so the legend doesn't recompute it.
    share: float


class MonthPoint(BaseModel):
    # 'YYYY-MM'. The click target for month cross-filtering.
    month: str
    label: str
    total: Decimal
    refunded: Decimal
    count: int


class Analytics(BaseModel):
    by_category: list[CategorySlice]
    by_month: list[MonthPoint]
    totals: TransactionTotals


class Reward(BaseModel):
    id: int
    slug: str
    title: str
    description: str
    brand: str
    coin_cost: int
    inr_value: Decimal
    stock: int | None
    is_active: bool
    # Server-computed rather than left to the client, so "can I afford this"
    # has exactly one answer and the button state cannot disagree with what
    # the redeem endpoint will do.
    affordable: bool


class Balance(BaseModel):
    """Always the derived value: earned minus completed redemptions."""

    earned: int
    redeemed: int
    balance: int


class Redemption(BaseModel):
    id: int
    reward_id: int
    reward_title: str
    coins_spent: int
    status: str
    redeemed_at: datetime


class RedeemRequest(BaseModel):
    reward_id: int = Field(gt=0)
    # Client-generated idempotency key. A retry after a timeout returns the
    # original redemption instead of charging twice.
    request_id: UUID


class RedeemResponse(BaseModel):
    redemption: Redemption
    balance: Balance
    # True when this request matched an existing redemption by request_id.
    idempotent_replay: bool = False


class FilterOption(BaseModel):
    value: str
    label: str
    count: int
    colour: str | None = None
    colour_dark: str | None = None


class DataQuality(BaseModel):
    """What the seed normalised, surfaced so the UI can show its working."""

    rows_in_file: int
    rows_loaded: int
    rows_rejected: int
    report: dict[str, int]
    ran_at: datetime


class Meta(BaseModel):
    """Everything the filter controls need, in one request."""

    categories: list[FilterOption]
    merchants: list[FilterOption]
    statuses: list[FilterOption]
    payment_methods: list[FilterOption]
    min_date: date | None
    max_date: date | None
    min_amount: Decimal | None
    max_amount: Decimal | None
    data_quality: DataQuality | None



