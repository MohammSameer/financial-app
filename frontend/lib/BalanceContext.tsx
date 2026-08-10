"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, api } from "./api";
import { uuid } from "./format";
import type { Balance, RedeemResponse } from "./types";

interface BalanceContextValue {
  balance: Balance | null;
  loading: boolean;
  error: Error | null;
  /** Redeems, updating the visible balance immediately and rolling back on failure. */
  redeem: (rewardId: number, coinCost: number) => Promise<RedeemResponse>;
  /** Re-reads the balance from the server. */
  refresh: () => void;
}

const BalanceContext = createContext<BalanceContextValue | null>(null);

/**
 * Owns the coin balance for the whole app.
 *
 * It lives in context rather than on the rewards page because the balance sits
 * in the header on every route — the brief asks for it to always be visible.
 * Redeeming on /rewards has to move the header number instantly, and lifting
 * the state here makes that one state change rather than two components trying
 * to stay in step.
 */
export function BalanceProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // Bumped to trigger a re-read.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    // The promise chain, not an awaited async function. Every setState below
    // happens in a callback after the request settles — nothing runs
    // synchronously while the effect body executes, so this can't cascade a
    // second render pass on mount.
    api
      .balance(controller.signal)
      .then((next) => {
        setBalance(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err : new Error("Couldn't load balance"));
      });

    // Aborting also covers unmount, so no stale response can write to a
    // component that is gone.
    return () => controller.abort();
  }, [version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  /**
   * Optimistic redeem with rollback.
   *
   * The balance drops the moment the user confirms, so the reward feels
   * immediate. On failure the previous balance is restored exactly — captured
   * before the optimistic write rather than recomputed by adding the cost back,
   * because addition would be wrong if the true balance had moved for any other
   * reason in between.
   *
   * This is only safe because the backend is genuinely atomic: a rejected
   * redeem writes nothing at all, so "put it back" is always the correct
   * recovery. The success path then overwrites with the server's own figure
   * rather than trusting the local arithmetic.
   */
  const redeem = useCallback(
    async (rewardId: number, coinCost: number): Promise<RedeemResponse> => {
      const snapshot = balance;

      if (snapshot) {
        setBalance({
          ...snapshot,
          redeemed: snapshot.redeemed + coinCost,
          balance: snapshot.balance - coinCost,
        });
      }

      try {
        const result = await api.redeem(rewardId, uuid());
        // The server's balance wins. Local arithmetic was a prediction; this
        // is the fact.
        setBalance(result.balance);
        return result;
      } catch (err) {
        // Roll back to the exact pre-request value.
        if (snapshot) setBalance(snapshot);

        // A 409 carries the server's real balance, which is more current than
        // our snapshot — prefer it when present.
        if (
          err instanceof ApiError &&
          typeof err.details.available === "number" &&
          snapshot
        ) {
          setBalance({ ...snapshot, balance: err.details.available as number });
        }
        throw err;
      }
    },
    [balance],
  );

  const value = useMemo(
    () => ({
      balance,
      // Derived: nothing has arrived and nothing has failed yet.
      loading: balance === null && error === null,
      error,
      redeem,
      refresh,
    }),
    [balance, error, redeem, refresh],
  );

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>;
}

export function useBalance(): BalanceContextValue {
  const ctx = useContext(BalanceContext);
  if (!ctx) {
    // A clear failure at the point of the mistake beats a null dereference
    // three components deeper.
    throw new Error("useBalance must be used inside a BalanceProvider");
  }
  return ctx;
}
