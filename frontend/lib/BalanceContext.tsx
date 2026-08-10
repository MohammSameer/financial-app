"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  refresh: () => Promise<void>;
}

const BalanceContext = createContext<BalanceContextValue | null>(null);

/**
 * Owns the coin balance for the whole app.
 *
 * It lives in context rather than in the rewards page because the balance is
 * shown in the header on every route — the brief asks for it to always be
 * visible. Redeeming on /rewards has to update the header instantly, and
 * lifting the state to a shared provider is what makes that one state change
 * rather than two components trying to stay in step.
 */
export function BalanceProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Guards against a response landing after the component unmounts.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await api.balance();
      if (mounted.current) {
        setBalance(next);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err : new Error("Couldn't load balance"));
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Optimistic redeem with rollback.
   *
   * The balance drops the moment the user confirms, so the reward feels
   * immediate. If the call fails, the previous balance is restored exactly —
   * captured before the optimistic write rather than recomputed by adding the
   * cost back, because addition would be wrong if the true balance had moved
   * for some other reason in the meantime.
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
        // The server's balance wins. Local arithmetic is a prediction; this
        // is the fact.
        if (mounted.current) setBalance(result.balance);
        return result;
      } catch (err) {
        // Roll back to the exact pre-request value.
        if (mounted.current && snapshot) setBalance(snapshot);

        // A 409 sometimes carries the real balance, which is more current
        // than our snapshot — adopt it when it does.
        if (err instanceof ApiError && typeof err.details.available === "number") {
          if (mounted.current && snapshot) {
            setBalance({
              ...snapshot,
              balance: err.details.available as number,
            });
          }
        }
        throw err;
      }
    },
    [balance],
  );

  const value = useMemo(
    () => ({ balance, loading, error, redeem, refresh }),
    [balance, loading, error, redeem, refresh],
  );

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>;
}

export function useBalance(): BalanceContextValue {
  const ctx = useContext(BalanceContext);
  if (!ctx) {
    // A clear failure at the point of the mistake beats a null-pointer three
    // components deeper.
    throw new Error("useBalance must be used inside a BalanceProvider");
  }
  return ctx;
}
