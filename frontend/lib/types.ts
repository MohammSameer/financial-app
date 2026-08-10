/**
 * API contract types.
 *
 * These mirror the Pydantic models in `backend/app/models/schemas.py`. Kept
 * hand-written rather than generated from the OpenAPI schema: at this size a
 * generator is more moving parts than it saves, and a hand-written type is
 * where the "why" comments below can live.
 *
 * Money arrives as a string, not a number. Postgres NUMERIC serialises to a
 * decimal string, and parsing it into a JS number would silently lose
 * precision on large amounts. It is converted at the point of display only.
 */

export type TransactionStatus = "SUCCESS" | "PENDING" | "FAILED";
export type PaymentMethod = "Credit Card" | "Debit Card" | "UPI" | "Netbanking";

export interface Transaction {
  id: number;
  /** The id from the source file. NOT unique — 40 ids are shared by two rows. */
  external_id: string;
  occurred_at: string;
  /** IST calendar date. What filters and the trend chart group by. */
  occurred_on: string;
  merchant: string;
  category: string;
  category_colour: string;
  category_colour_dark: string;
  amount: string;
  currency: string;
  status: TransactionStatus;
  payment_method: PaymentMethod;
  coins_earned: number;

  /** Ingest flags, surfaced as badges rather than hidden. */
  is_refund: boolean;
  is_outlier: boolean;
  is_id_collision: boolean;
  raw_timestamp: string;
  ingest_notes: string[];
}

export interface PageMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/** Totals across the whole filtered set, not the visible page. */
export interface TransactionTotals {
  total_spend: string;
  total_refunded: string;
  transaction_count: number;
  successful_count: number;
  average_spend: string;
  coins_earned: number;
}

export interface TransactionPage {
  items: Transaction[];
  meta: PageMeta;
  totals: TransactionTotals;
}

export interface TransactionDetail {
  transaction: Transaction;
  /** Other rows sharing this external_id, so the collision badge explains itself. */
  id_collision_siblings: Transaction[];
}

export interface CategorySlice {
  category: string;
  colour: string;
  colour_dark: string;
  total: string;
  count: number;
  share: number;
}

export interface MonthPoint {
  /** 'YYYY-MM' — the click target for month cross-filtering. */
  month: string;
  label: string;
  total: string;
  refunded: string;
  count: number;
}

export interface Analytics {
  by_category: CategorySlice[];
  by_month: MonthPoint[];
  totals: TransactionTotals;
}

export interface Reward {
  id: number;
  slug: string;
  title: string;
  description: string;
  brand: string;
  coin_cost: number;
  inr_value: string;
  stock: number | null;
  is_active: boolean;
  /** Decided server-side so the button state can't disagree with the endpoint. */
  affordable: boolean;
}

export interface Balance {
  earned: number;
  redeemed: number;
  balance: number;
}

export interface Redemption {
  id: number;
  reward_id: number;
  reward_title: string;
  coins_spent: number;
  status: string;
  redeemed_at: string;
}

export interface RedeemResponse {
  redemption: Redemption;
  balance: Balance;
  idempotent_replay: boolean;
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
  colour: string | null;
}

export interface DataQuality {
  rows_in_file: number;
  rows_loaded: number;
  rows_rejected: number;
  report: Record<string, number>;
  ran_at: string;
}

export interface Meta {
  categories: FilterOption[];
  merchants: FilterOption[];
  statuses: FilterOption[];
  payment_methods: FilterOption[];
  min_date: string | null;
  max_date: string | null;
  min_amount: string | null;
  max_amount: string | null;
  data_quality: DataQuality | null;
}

/** Error body shape from the backend's DomainError handler. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
