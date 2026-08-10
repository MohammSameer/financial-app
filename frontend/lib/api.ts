/**
 * Typed fetch client.
 *
 * Small on purpose. The app needs typed calls, a real error object and request
 * cancellation; it does not need a data-fetching library's cache invalidation
 * story for five endpoints. See DECISIONS.md.
 */

import type {
  Analytics,
  ApiErrorBody,
  Balance,
  Meta,
  RedeemResponse,
  Redemption,
  Reward,
  TransactionDetail,
  TransactionPage,
} from "./types";

const BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

/**
 * An HTTP failure with the backend's machine-readable code attached.
 *
 * The UI branches on `code` ("insufficient_balance"), never on `message` —
 * messages are user-facing copy and will be reworded.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, body: Partial<ApiErrorBody>, fallback: string) {
    super(body.message ?? fallback);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code ?? "unknown_error";
    this.details = body.details ?? {};
  }

  /** True when retrying the identical request could plausibly succeed. */
  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 0;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { signal?: AbortSignal },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (err) {
    // An AbortError is a deliberate cancellation, not a failure. It must
    // propagate untouched so callers can ignore it rather than rendering an
    // error banner every time the user types another character.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, {}, "Can't reach the server. Check your connection.");
  }

  if (!res.ok) {
    let body: Partial<ApiErrorBody> = {};
    try {
      body = await res.json();
    } catch {
      // A proxy or gateway error may return HTML; fall back to the status text.
    }
    throw new ApiError(res.status, body, res.statusText || "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Build a query string from the filter state.
 *
 * Multi-value facets are repeated (`?category=A&category=B`) rather than
 * comma-joined, so a value containing a comma can't be mis-split. Empty
 * strings, nulls and empty arrays are dropped so the URL stays readable and
 * two equivalent filter states produce the identical string — which is what
 * makes the response cache key reliable.
 */
export function toQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const v of value) if (v !== "" && v != null) qs.append(key, String(v));
    } else if (typeof value === "boolean") {
      qs.set(key, value ? "true" : "false");
    } else {
      qs.set(key, String(value));
    }
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const api = {
  transactions: (query: string, signal?: AbortSignal) =>
    request<TransactionPage>(`/api/transactions${query}`, { signal }),

  transaction: (id: number, signal?: AbortSignal) =>
    request<TransactionDetail>(`/api/transactions/${id}`, { signal }),

  analytics: (query: string, signal?: AbortSignal) =>
    request<Analytics>(`/api/analytics/summary${query}`, { signal }),

  meta: (signal?: AbortSignal) => request<Meta>("/api/meta", { signal }),

  balance: (signal?: AbortSignal) =>
    request<Balance>("/api/rewards/balance", { signal }),

  rewards: (signal?: AbortSignal) => request<Reward[]>("/api/rewards", { signal }),

  redemptionHistory: (signal?: AbortSignal) =>
    request<Redemption[]>("/api/rewards/history", { signal }),

  redeem: (rewardId: number, requestId: string) =>
    request<RedeemResponse>("/api/rewards/redeem", {
      method: "POST",
      body: JSON.stringify({ reward_id: rewardId, request_id: requestId }),
    }),
};
