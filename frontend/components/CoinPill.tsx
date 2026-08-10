"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useBalance } from "@/lib/BalanceContext";
import { formatCoins } from "@/lib/format";
import styles from "./CoinPill.module.css";

/** A coin, drawn rather than an emoji so it matches the theme. */
function CoinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" className={styles.icon}>
      <circle cx="10" cy="10" r="8" fill="currentColor" opacity="0.22" />
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path
        d="M12.2 7.4a2.9 2.9 0 100 5.2"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The always-visible coin balance in the header.
 *
 * Pulses when the number goes down, so a redeem is felt in the header even
 * though the confirm dialog is elsewhere on the page.
 */
export function CoinPill() {
  const { balance, loading } = useBalance();
  const [pulse, setPulse] = useState(false);
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (balance == null) return;

    if (previous.current !== null && balance.balance < previous.current) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 640);
      previous.current = balance.balance;
      return () => clearTimeout(timer);
    }

    previous.current = balance.balance;
  }, [balance]);

  if (loading && !balance) {
    return <div className={styles.skeleton} aria-hidden="true" />;
  }

  return (
    <Link
      href="/rewards"
      className={`${styles.pill} ${pulse ? styles.spend : ""}`}
      // The visible text is just a number and an icon; this spells it out.
      aria-label={`${formatCoins(balance?.balance ?? 0)} coins available. Go to rewards.`}
      title="Your coin balance"
    >
      <CoinIcon />
      <span>{formatCoins(balance?.balance ?? 0)}</span>
      <span className={styles.label}>coins</span>
    </Link>
  );
}
