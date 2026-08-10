"use client";

import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api } from "@/lib/api";
import { useBalance } from "@/lib/BalanceContext";
import { formatCoins, formatDateTime, formatINR } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { Reward } from "@/lib/types";
import styles from "./Rewards.module.css";

type FlowState = "idle" | "confirming" | "working" | "done";

export function RewardsView() {
  const { balance, loading: balanceLoading, redeem } = useBalance();
  const { push } = useToast();

  const [selected, setSelected] = useState<Reward | null>(null);
  const [flow, setFlow] = useState<FlowState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Bumped after a successful redeem to re-pull the catalogue (stock changes)
  // and the history list.
  const [version, setVersion] = useState(0);

  const rewards = useApi((signal) => api.rewards(signal), [version, balance?.balance]);
  const history = useApi(
    (signal) =>
      fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"}/api/rewards/history`,
        { signal },
      ).then((r) => r.json()),
    [version],
  );

  const open = useCallback((reward: Reward) => {
    setSelected(reward);
    setError(null);
    setFlow("confirming");
  }, []);

  const close = useCallback(() => {
    // Never dismiss mid-flight: the request will still land, and closing here
    // would leave the user with no idea whether it worked.
    if (flow === "working") return;
    setFlow("idle");
    setSelected(null);
    setError(null);
  }, [flow]);

  /**
   * Confirm step.
   *
   * The balance in the header drops the instant this runs (see
   * BalanceContext), and is restored exactly if the call fails. The dialog
   * stays open on failure showing why, rather than closing and leaving a
   * toast as the only trace.
   */
  const confirm = useCallback(async () => {
    if (!selected) return;
    setFlow("working");
    setError(null);

    try {
      const result = await redeem(selected.id, selected.coin_cost);
      setFlow("done");
      setVersion((v) => v + 1);

      push({
        tone: "success",
        title: `${selected.title} redeemed`,
        body: `${formatCoins(selected.coin_cost)} coins spent. ${formatCoins(result.balance.balance)} left.`,
      });
    } catch (err) {
      setFlow("confirming");

      if (err instanceof ApiError) {
        setError(err.message);
        // Branching on the stable code, never on the message text.
        push({
          tone: "error",
          title:
            err.code === "insufficient_balance"
              ? "Not enough coins"
              : err.code === "reward_unavailable"
                ? "Reward unavailable"
                : "Redemption failed",
          body: err.message,
        });
      } else {
        setError("Something went wrong. Your coins have not been spent.");
        push({
          tone: "error",
          title: "Redemption failed",
          body: "Your balance is unchanged.",
        });
      }
    }
  }, [selected, redeem, push]);

  const current = balance?.balance ?? 0;

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.heroLabel}>Coin balance</span>
          <div className={styles.heroBalance}>
            <span className={styles.heroNumber}>
              {balanceLoading && !balance ? "—" : formatCoins(current)}
            </span>
            <span className={styles.heroUnit}>coins</span>
          </div>
          <p className={styles.heroMeta}>
            Earned at 1 coin per ₹100 on successful payments, up to 50 coins each.
          </p>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <span className={styles.heroStatLabel}>Earned</span>
            <span className={styles.heroStatValue}>
              {formatCoins(balance?.earned ?? 0)}
            </span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatLabel}>Redeemed</span>
            <span className={styles.heroStatValue}>
              {formatCoins(balance?.redeemed ?? 0)}
            </span>
          </div>
        </div>
      </section>

      <h2 style={{ marginBottom: "var(--space-4)", fontSize: "var(--text-lg)" }}>
        Redeem your coins
      </h2>

      <div className={styles.grid}>
        {rewards.loading && !rewards.data
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.card}>
                <Skeleton width={38} height={38} radius="8px" />
                <Skeleton width="80%" height={16} />
                <Skeleton width="100%" height={30} />
                <Skeleton width="100%" height={36} />
              </div>
            ))
          : (rewards.data ?? []).map((reward) => {
              const affordable = current >= reward.coin_cost;
              const soldOut = reward.stock !== null && reward.stock <= 0;
              const disabled = !affordable || soldOut || !reward.is_active;
              const progress = Math.min(100, (current / reward.coin_cost) * 100);

              return (
                <div
                  key={reward.id}
                  className={`${styles.card} ${disabled ? styles.cardLocked : ""}`}
                >
                  <div className={styles.cardTop}>
                    <span className={styles.brand} aria-hidden="true">
                      {reward.brand.charAt(0)}
                    </span>
                    <span className={styles.value}>
                      worth {formatINR(reward.inr_value)}
                    </span>
                  </div>

                  <h3 className={styles.title}>{reward.title}</h3>
                  <p className={styles.description}>{reward.description}</p>

                  <div className={styles.cost}>
                    {formatCoins(reward.coin_cost)} coins
                    {reward.stock !== null && (
                      <span className={styles.stock}>
                        {soldOut ? "· sold out" : `· ${reward.stock} left`}
                      </span>
                    )}
                  </div>

                  {!affordable && !soldOut && (
                    <>
                      <div
                        className={styles.progressTrack}
                        role="progressbar"
                        aria-valuenow={Math.round(progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Progress towards ${reward.title}`}
                      >
                        <div
                          className={styles.progressFill}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className={styles.shortfall}>
                        {formatCoins(reward.coin_cost - current)} more coins needed
                      </span>
                    </>
                  )}

                  <Button
                    variant={disabled ? "secondary" : "coin"}
                    fullWidth
                    disabled={disabled}
                    onClick={() => open(reward)}
                  >
                    {soldOut
                      ? "Sold out"
                      : !reward.is_active
                        ? "Unavailable"
                        : affordable
                          ? "Redeem"
                          : "Not enough coins"}
                  </Button>
                </div>
              );
            })}
      </div>

      <Card style={{ marginTop: "var(--space-6)" }}>
        <CardHeader title="Redemption history" as="h2" />
        <CardBody>
          {Array.isArray(history.data) && history.data.length > 0 ? (
            <div className={styles.historyList}>
              {history.data.map(
                (item: {
                  id: number;
                  reward_title: string;
                  coins_spent: number;
                  redeemed_at: string;
                }) => (
                  <div key={item.id} className={styles.historyItem}>
                    <div>
                      <div className={styles.historyTitle}>{item.reward_title}</div>
                      <div className={styles.historyDate}>
                        {formatDateTime(item.redeemed_at)}
                      </div>
                    </div>
                    <span className={styles.historyCost}>
                      −{formatCoins(item.coins_spent)}
                    </span>
                  </div>
                ),
              )}
            </div>
          ) : (
            <p className={styles.empty}>
              Nothing redeemed yet. Your coins are waiting.
            </p>
          )}
        </CardBody>
      </Card>

      {/* ---- select → confirm → done ---------------------------------- */}
      <Modal
        open={flow !== "idle" && selected !== null}
        onClose={close}
        busy={flow === "working"}
        title={flow === "done" ? "All done" : "Confirm redemption"}
        description={
          flow === "done"
            ? undefined
            : "Coins are deducted as soon as you confirm."
        }
        footer={
          flow === "done" ? (
            <Button variant="primary" onClick={close} data-autofocus>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close} disabled={flow === "working"}>
                Cancel
              </Button>
              <Button
                variant="coin"
                onClick={confirm}
                loading={flow === "working"}
                data-autofocus
              >
                {flow === "working" ? "Redeeming" : "Confirm"}
              </Button>
            </>
          )
        }
      >
        {selected && flow !== "done" && (
          <>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>Reward</span>
              <span className={styles.confirmValue}>{selected.title}</span>
            </div>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>Cost</span>
              <span className={styles.confirmValue}>
                {formatCoins(selected.coin_cost)} coins
              </span>
            </div>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>Balance after</span>
              <span className={`${styles.confirmValue} ${styles.confirmAfter}`}>
                {formatCoins(current - selected.coin_cost)} coins
              </span>
            </div>

            {error && (
              <div className={styles.errorBox} role="alert">
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" fill="none" />
                  <path d="M8 4.8v4M8 11.2h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                <span>
                  {error}
                  <br />
                  <strong>Your coins have not been spent.</strong>
                </span>
              </div>
            )}
          </>
        )}

        {selected && flow === "done" && (
          <div className={styles.done}>
            <span className={styles.doneIcon}>
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={styles.doneTitle}>{selected.title}</span>
            <p className={styles.doneBody}>
              {formatCoins(selected.coin_cost)} coins spent. We&rsquo;ll email your
              reward within 24 hours.
            </p>
            <Badge tone="coin">
              {formatCoins(current)} coins remaining
            </Badge>
          </div>
        )}
      </Modal>
    </>
  );
}
