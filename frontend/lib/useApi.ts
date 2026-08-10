"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export interface ApiState<T> {
  data: T | null;
  /** True only on the very first load, when there is nothing to show yet. */
  loading: boolean;
  /** True on a refetch while previous data is still on screen. */
  refreshing: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetches a resource and keeps it in sync with its dependency key.
 *
 * Two problems this exists to solve, both of which show up immediately with a
 * type-ahead search over 10k rows:
 *
 *   1. Out-of-order responses. Typing "zom" fires three requests; if the
 *      response for "zo" arrives after the one for "zom", the table ends up
 *      showing results for a query the input no longer contains. Every request
 *      gets a sequence number and a late response is discarded.
 *
 *   2. Wasted work. Superseded requests are aborted rather than left to
 *      complete and be thrown away.
 *
 * Previous data is deliberately kept while refetching. Blanking the table on
 * every keystroke makes the UI flash and the layout jump; dimming it in place
 * reads as far faster than replacing it does.
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: { enabled?: boolean } = {},
): ApiState<T> {
  const { enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);

  // Bumped to force a refetch from the retry button.
  const [nonce, setNonce] = useState(0);

  // Monotonic request counter. Only the newest response is allowed to write
  // to state.
  const latest = useRef(0);

  // Held in a ref so the effect doesn't re-run when the caller passes a new
  // inline closure on every render — which is every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const hasData = data !== null;

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    const requestId = ++latest.current;

    if (hasData) setRefreshing(true);
    else setLoading(true);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        // A newer request has already started; this answer is stale.
        if (requestId !== latest.current) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (requestId !== latest.current) return;
        // A deliberate cancellation is not a failure and must not paint an
        // error banner over perfectly good data.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof ApiError || err instanceof Error
            ? err
            : new Error("Something went wrong"),
        );
      })
      .finally(() => {
        if (requestId !== latest.current) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, refreshing, error, refetch };
}
