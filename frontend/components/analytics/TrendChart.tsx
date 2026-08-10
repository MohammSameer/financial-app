"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatINR, formatINRCompact, formatMonth } from "@/lib/format";
import { useTheme } from "@/lib/useTheme";
import type { MonthPoint } from "@/lib/types";
import styles from "./Charts.module.css";

interface Props {
  data: MonthPoint[] | undefined;
  loading: boolean;
  /** The month currently filtered on, as 'YYYY-MM'. */
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
}

/**
 * Monthly spend.
 *
 * Bars rather than a line: the months are discrete buckets, and a line implies
 * a continuous reading between them that does not exist — there is no
 * meaningful "value" halfway between March and April.
 *
 * Refunds are deliberately not drawn as a second series on a second axis. A
 * dual-axis chart invites the reader to compare two scales that have no
 * relationship; refunds appear in the tooltip instead, where they can be read
 * against the spend figure directly.
 */
export function TrendChart({
  data,
  loading,
  selectedMonth,
  onSelectMonth,
}: Props) {
  const theme = useTheme();

  const bars = useMemo(
    () =>
      (data ?? []).map((p, i, all) => {
        const [year] = p.month.split("-");
        const previousYear = i > 0 ? all[i - 1].month.split("-")[0] : null;
        const monthName = formatMonth(p.month).split(" ")[0];

        return {
          month: p.month,
          label: formatMonth(p.month),
          // Axis label: the month name alone, except where the year changes.
          //
          // This range spans 14 months, so a bare month name puts two bars
          // labelled "Jul" at either end of the axis with nothing to tell them
          // apart. Stamping the year on the first bar and on each January
          // disambiguates without repeating "2026" thirteen times, which would
          // not fit across the axis anyway.
          short:
            i === 0 || year !== previousYear
              ? `${monthName} ’${year.slice(2)}`
              : monthName,
          total: Number(p.total),
          refunded: Number(p.refunded),
          count: p.count,
        };
      }),
    [data],
  );

  const accent = theme === "dark" ? "#3987e5" : "#2a78d6";
  const muted = theme === "dark" ? "#33415a" : "#cbd5e1";

  return (
    <Card className={styles.chartCard}>
      <CardHeader
        title="Monthly trend"
        subtitle="Successful payments per month. Click a bar to filter to it."
        actions={
          selectedMonth ? (
            <button
              type="button"
              className={styles.filterNote}
              onClick={() => onSelectMonth("")}
            >
              Showing {formatMonth(selectedMonth)} — clear
            </button>
          ) : undefined
        }
      />

      {loading && !data ? (
        <div className={styles.chartSkeleton}>
          <Skeleton width="88%" height={170} />
        </div>
      ) : bars.length === 0 ? (
        <div className={styles.chartEmpty}>
          <span>No spending matches these filters.</span>
        </div>
      ) : (
        <div className={styles.chartBody}>
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bars}
                margin={{ top: 8, right: 8, bottom: 0, left: 4 }}
                onClick={(state: { activePayload?: { payload: { month: string } }[] }) => {
                  const month = state?.activePayload?.[0]?.payload?.month;
                  if (!month) return;
                  // Clicking the selected month again clears it, so the chart
                  // is a toggle rather than a one-way trap.
                  onSelectMonth(month === selectedMonth ? "" : month);
                }}
              >
                {/* Horizontal only. Vertical gridlines on a categorical axis
                    add ink without adding a reference the eye uses. */}
                <CartesianGrid
                  strokeDasharray="2 4"
                  vertical={false}
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="short"
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
                  tickFormatter={(v: number) => formatINRCompact(v)}
                  width={54}
                />
                <Tooltip
                  content={<TrendTooltip />}
                  // A faint band rather than the default grey block, which
                  // otherwise covers the bar the user is trying to read.
                  cursor={{ fill: "var(--surface-hover)" }}
                />
                <Bar
                  dataKey="total"
                  // 4px rounded top, square base — the bar stays anchored to
                  // the baseline it is measured from.
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                  isAnimationActive={false}
                  cursor="pointer"
                >
                  {bars.map((bar) => (
                    <Cell
                      key={bar.month}
                      // Selecting a month mutes the rest instead of hiding
                      // them, so the chosen month keeps its context.
                      fill={
                        !selectedMonth || selectedMonth === bar.month ? accent : muted
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: {
    payload: {
      label: string;
      total: number;
      refunded: number;
      count: number;
    };
  }[];
}

function TrendTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{d.label}</div>
      <div className={styles.tooltipRow}>
        <span>Spend</span>
        <span className={styles.tooltipValue}>{formatINR(d.total)}</span>
      </div>
      <div className={styles.tooltipRow}>
        <span>Payments</span>
        <span className={styles.tooltipValue}>
          {d.count.toLocaleString("en-IN")}
        </span>
      </div>
      {d.refunded > 0 && (
        <div className={styles.tooltipRow}>
          <span>Refunded</span>
          <span className={styles.tooltipValue}>{formatINR(d.refunded)}</span>
        </div>
      )}
      <div className={styles.tooltipHint}>Click to filter to this month</div>
    </div>
  );
}
