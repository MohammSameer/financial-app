/**
 * Display formatting.
 *
 * Formatters are module-level constants, not created per call. Building an
 * Intl.NumberFormat is expensive relative to using one, and a 25-row table
 * formats ~75 values per render — recreating the formatter each time was
 * measurably the slowest part of a row.
 */

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const INR_COMPACT = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

const INT = new Intl.NumberFormat("en-IN");

/**
 * en-IN gives the lakh/crore grouping (12,34,567) rather than the western
 * thousands grouping. For an INR app read by Indian users that is the correct
 * convention, not a stylistic choice.
 */
export function formatINR(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return INR.format(n);
}

/** Compact form for chart axes and stat tiles, where full precision is noise. */
export function formatINRCompact(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return INR_COMPACT.format(n);
}

export function formatNumber(value: number): string {
  return INT.format(value);
}

/** Coins are whole units; a fractional coin would be a bug worth showing. */
export function formatCoins(value: number): string {
  return INT.format(Math.trunc(value));
}

/**
 * Dates are rendered in IST regardless of where the browser is.
 *
 * The data is Indian and the backend groups by IST calendar date. If the
 * browser rendered in its own zone, a reviewer in New Jersey would see dates
 * that disagree with the month buckets in the trend chart directly above.
 */
const IST = "Asia/Kolkata";

const DATE_SHORT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: IST,
});

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: IST,
});

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_SHORT.format(d);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_TIME.format(d);
}

/** 'YYYY-MM' -> 'Mar 2026', for chart axes and the active-filter chips. */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Turns 'total_spend' into 'Total spend' for the data-quality report. */
export function humanise(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A UUID for redeem idempotency.
 *
 * crypto.randomUUID needs a secure context. It is present on localhost and
 * HTTPS, so this fallback is only for an http:// deployment — but returning
 * undefined there would break redeem entirely rather than degrading.
 */
export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
