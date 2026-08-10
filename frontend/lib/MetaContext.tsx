"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { api } from "./api";
import { useApi } from "./useApi";
import type { CoinRules, Meta } from "./types";

interface MetaContextValue {
  meta: Meta | null;
  loading: boolean;
  /**
   * The earn rule, with a fallback for the window before /api/meta lands.
   *
   * The fallback matches the backend defaults so the first paint is not wrong;
   * once the response arrives the served values take over. Never used to make a
   * decision — only to render copy — so a brief default is harmless where a
   * blank would look broken.
   */
  coinRules: CoinRules;
}

const FALLBACK_COIN_RULES: CoinRules = { rupees_per_coin: 100, cap_per_txn: 50 };

const MetaContext = createContext<MetaContextValue | null>(null);

/**
 * Fetches /api/meta once for the whole app.
 *
 * It was previously fetched inside the dashboard, which meant the rewards page
 * had no access to it and duplicated the coin rules as hardcoded copy. Lifting
 * it here gives every route the same facets, bounds, data-quality report and
 * earn rule from a single request.
 *
 * The data is effectively static for a session — the facet list and the earn
 * rule do not change while someone is looking at the page — so one fetch with
 * no revalidation is the right shape.
 */
export function MetaProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useApi((signal) => api.meta(signal), "meta");

  const value = useMemo(
    () => ({
      meta: data,
      loading,
      coinRules: data?.coin_rules ?? FALLBACK_COIN_RULES,
    }),
    [data, loading],
  );

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta(): MetaContextValue {
  const ctx = useContext(MetaContext);
  if (!ctx) throw new Error("useMeta must be used inside a MetaProvider");
  return ctx;
}

/** Human-readable earn rule, built from the served values. */
export function describeCoinRule(rules: CoinRules): string {
  return `1 coin per ₹${rules.rupees_per_coin.toLocaleString("en-IN")}, capped at ${rules.cap_per_txn.toLocaleString("en-IN")}`;
}
