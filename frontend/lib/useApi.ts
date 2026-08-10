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
 * Fetches a resource and keeps it in sync with `key`.
 *
 * `key` is a string that must encode everything the fetcher closes over — the
 * query string, an id, a version counter. That single invariant is what lets
 * the effect depend on one primitive instead of an array of unstable
 * references, and it is why the fetcher itself is not in the dependency list.
 *
 * Two problems this exists to solve, both of which appear the moment you type
 * into a search box over 10k rows:
 *
 *   1. Out-of-order responses. Typing "zom" fires three requests. If the reply
 *      for "zo" lands after the one for "zom", the table ends up showing results
 *      for a query the input no longer contains. Every request carries a
 *      sequence number and a late reply is discarded.
 *
 *   2. Wasted work. Superseded requests are aborted rather than left to finish
 *      and be thrown away.
 *
 * `loading` and `refreshing` are *derived*, not stored. Setting them
 * synchronously inside the effect would schedule an extra render pass on every
 * key change; comparing the key that last settled against the current one says
 * the same thing for free.
 *
 * Previous data is deliberately kept during a refetch. Blanking the table on
 * every keystroke makes the page flash and the layout jump; dimming it in place
 * reads as far quicker than replacing it.
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  key: string,
  options: { enabled?: boolean } = {},
): ApiState<T> {
  const { enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // The key whose response is currently on screen. Written only from async
  // callbacks, never during render or synchronously in an effect.
  const [settledKey, setSettledKey] = useState<string | null>(null);

  // Bumped by refetch() to force a re-run without the key changing.
  const [nonce, setNonce] = useState(0);

  // Monotonic request counter; only the newest response may write to state.
  const latest = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    const requestId = ++latest.current;

    fetcher(controller.signal)
      .then((result) => {
        // A newer request has already started; this answer is stale.
        if (requestId !== latest.current) return;
        setData(result);
        setError(null);
        setSettledKey(key);
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
        setSettledKey(key);
      });

    return () => controller.abort();
    // `fetcher` is intentionally absent: callers pass a new closure on every
    // render, and `key` already changes whenever anything that closure captures
    // changes. Including it would re-fetch on every render instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const hasData = data !== null;

  return {
    data,
    // Nothing to show yet and nothing has settled.
    loading: enabled && !hasData && error === null,
    // Something is on screen, but it belongs to a different key.
    refreshing: hasData && settledKey !== key,
    error,
    refetch,
  };
}
