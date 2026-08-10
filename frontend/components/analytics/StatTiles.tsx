"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { formatCoins, formatINR, formatNumber } from "@/lib/format";
import type { TransactionTotals } from "@/lib/types";
import styles from "./StatTiles.module.css";

interface Props {
  totals: TransactionTotals | undefined;
  loading: boolean;
  /** True when filters are narrowing the set, so the tiles can say so. */
  filtered: boolean;
}

/**
 * Headline figures for the current filter set.
 *
 * These are plain numbers rather than charts on purpose: a single value has no
 * shape to compare, so a chart would add ink without adding meaning.
 *
 * The figures come from the server and cover the entire filtered set, not the
 * 25 rows on screen. Summing the visible page would quietly report "total
 * spend" for one page of a 10,000-row result.
 */
export function StatTiles({ totals, loading, filtered }: Props) {
  if (loading && !totals) {
    return (
      <div className={styles.grid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.tile}>
            <Skeleton width={90} height={10} />
            <Skeleton width={130} height={26} />
            <Skeleton width={70} height={10} />
          </div>
        ))}
      </div>
    );
  }

  if (!totals) return null;

  const scope = filtered ? "matching filters" : "all time";

  return (
    <div className={styles.grid}>
      <div className={styles.tile}>
        <span className={styles.label}>Total spend</span>
        <span className={styles.value} title={formatINR(totals.total_spend)}>
          {formatINR(totals.total_spend)}
        </span>
        <span className={styles.meta}>
          {formatNumber(totals.successful_count)} successful payments
        </span>
      </div>

      <div className={styles.tile}>
        <span className={styles.label}>Transactions</span>
        <span className={styles.value}>
          {formatNumber(totals.transaction_count)}
        </span>
        <span className={`${styles.meta} ${filtered ? styles.metaAccent : ""}`}>
          {scope}
        </span>
      </div>

      <div className={styles.tile}>
        <span className={styles.label}>Average payment</span>
        <span className={styles.value}>{formatINR(totals.average_spend)}</span>
        <span className={styles.meta}>
          {Number(totals.total_refunded) > 0
            ? `${formatINR(totals.total_refunded)} refunded`
            : "no refunds in range"}
        </span>
      </div>

      <div className={styles.tile}>
        <span className={styles.label}>Coins earned</span>
        <span className={`${styles.value} ${styles.valueCoin}`}>
          {formatCoins(totals.coins_earned)}
        </span>
        <span className={styles.meta}>1 coin per ₹100, capped at 50</span>
      </div>
    </div>
  );
}
