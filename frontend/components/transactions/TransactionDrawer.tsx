"use client";

import { useCallback } from "react";
import { Badge, CategoryBadge, StatusBadge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { formatCoins, formatDateTime, formatINR } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useTheme } from "@/lib/useTheme";
import type { Transaction } from "@/lib/types";
import styles from "./TransactionDrawer.module.css";

interface Props {
  transactionId: number | null;
  onClose: () => void;
}

/**
 * Full detail for one transaction.
 *
 * Fetched on open rather than passed down from the row, so the drawer can show
 * fields the table doesn't carry — the raw source timestamp, the full ingest
 * note list, and any transaction that collided on the same id.
 */
export function TransactionDrawer({ transactionId, onClose }: Props) {
  const theme = useTheme();

  const fetcher = useCallback(
    (signal: AbortSignal) => api.transaction(transactionId!, signal),
    [transactionId],
  );

  const { data, loading, error } = useApi(fetcher, `txn:${transactionId}`, {
    enabled: transactionId !== null,
  });

  const txn = data?.transaction;
  const siblings = data?.id_collision_siblings ?? [];
  const isRefund = txn ? Number(txn.amount) < 0 : false;

  return (
    <Drawer
      open={transactionId !== null}
      onClose={onClose}
      eyebrow={txn ? txn.external_id : "Transaction"}
      title={txn ? txn.merchant : "Loading…"}
    >
      {loading && !txn && (
        <div className={styles.loading}>
          <Skeleton width="60%" height={34} />
          <Skeleton width="40%" height={16} />
          <Skeleton width="100%" height={120} />
          <Skeleton width="100%" height={90} />
        </div>
      )}

      {error && (
        <p style={{ color: "var(--danger-text)" }}>
          Couldn&rsquo;t load this transaction. {error.message}
        </p>
      )}

      {txn && (
        <>
          <div className={styles.hero}>
            <span
              className={`${styles.amount} ${isRefund ? styles.amountRefund : ""}`}
            >
              {isRefund ? "+" : ""}
              {formatINR(Math.abs(Number(txn.amount)))}
            </span>
            <div className={styles.heroMeta}>
              <StatusBadge status={txn.status} />
              <CategoryBadge
                category={txn.category}
                colour={
                  theme === "dark" ? txn.category_colour_dark : txn.category_colour
                }
              />
              {txn.is_refund && <Badge tone="success">Refund</Badge>}
              {txn.is_outlier && <Badge tone="danger">Flagged amount</Badge>}
            </div>

            {txn.coins_earned > 0 ? (
              <span className={styles.coinLine}>
                Earned {formatCoins(txn.coins_earned)} coins
              </span>
            ) : (
              <span className={styles.coinLine}>
                No coins —{" "}
                {txn.status !== "SUCCESS"
                  ? "payment wasn't successful"
                  : txn.is_refund
                    ? "refunds don't earn coins"
                    : txn.is_outlier
                      ? "amount is flagged as a data error"
                      : "below the ₹100 minimum"}
              </span>
            )}
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Details</h3>
            <dl className={styles.dl}>
              <dt className={styles.dt}>Transaction</dt>
              <dd className={`${styles.dd} ${styles.mono}`}>{txn.external_id}</dd>

              <dt className={styles.dt}>Merchant</dt>
              <dd className={styles.dd}>{txn.merchant}</dd>

              <dt className={styles.dt}>Date</dt>
              <dd className={styles.dd}>{formatDateTime(txn.occurred_at)} IST</dd>

              <dt className={styles.dt}>Method</dt>
              <dd className={styles.dd}>{txn.payment_method}</dd>

              <dt className={styles.dt}>Currency</dt>
              <dd className={styles.dd}>{txn.currency}</dd>
            </dl>
          </div>

          {txn.ingest_notes.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>How this row was cleaned</h3>
              <p className={styles.explain}>
                The source file was inconsistent. Everything changed on import is
                listed here rather than applied silently.
              </p>
              <div className={styles.notes}>
                {txn.ingest_notes.map((note) => (
                  <div key={note} className={styles.note}>
                    <svg
                      className={styles.noteIcon}
                      width="13"
                      height="13"
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <path
                        d="M8 5.5v3.2M8 11h.01"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                      />
                      <circle
                        cx="8"
                        cy="8"
                        r="6.2"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        fill="none"
                      />
                    </svg>
                    {note}
                  </div>
                ))}
              </div>
              <code className={styles.rawValue}>
                timestamp in source: {txn.raw_timestamp}
              </code>
            </div>
          )}

          {siblings.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>
                Shares this id with {siblings.length} other
                {siblings.length > 1 ? "s" : ""}
              </h3>
              <p className={styles.explain}>
                The source file reused this identifier. These are genuinely
                different payments, so both were kept rather than one being
                discarded as a duplicate.
              </p>
              <div className={styles.notes}>
                {siblings.map((sib: Transaction) => (
                  <div key={sib.id} className={styles.sibling}>
                    <div className={styles.siblingHead}>
                      <span className={styles.siblingMerchant}>{sib.merchant}</span>
                      <span className={styles.siblingAmount}>
                        {formatINR(sib.amount)}
                      </span>
                    </div>
                    <span className={styles.siblingMeta}>
                      {sib.category} · {formatDateTime(sib.occurred_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
