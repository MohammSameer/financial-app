import type { ReactNode } from "react";
import type { TransactionStatus } from "@/lib/types";
import styles from "./Badge.module.css";

type Tone = "neutral" | "success" | "warning" | "danger" | "accent" | "coin";

export interface BadgeProps {
  tone?: Tone;
  /** Adds a leading status dot. */
  dot?: boolean;
  children: ReactNode;
  title?: string;
}

export function Badge({ tone = "neutral", dot, children, title }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`} title={title}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<TransactionStatus, Tone> = {
  SUCCESS: "success",
  PENDING: "warning",
  FAILED: "danger",
};

const STATUS_LABEL: Record<TransactionStatus, string> = {
  SUCCESS: "Success",
  PENDING: "Pending",
  FAILED: "Failed",
};

/**
 * Payment status.
 *
 * Always renders the word, never the colour alone: roughly 1 in 12 men has
 * some form of colour vision deficiency, and red/green is the exact pair that
 * fails. The dot reinforces, the text carries the meaning.
 */
export function StatusBadge({ status }: { status: TransactionStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** Category chip using the colour assigned in the database. */
export function CategoryBadge({
  category,
  colour,
}: {
  category: string;
  colour: string;
}) {
  return (
    <span className={`${styles.badge} ${styles.category}`}>
      <span
        className={styles.swatch}
        style={{ background: colour }}
        aria-hidden="true"
      />
      {category}
    </span>
  );
}
