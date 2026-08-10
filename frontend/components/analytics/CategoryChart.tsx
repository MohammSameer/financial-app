"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatINR, formatINRCompact } from "@/lib/format";
import { useTheme } from "@/lib/useTheme";
import type { CategorySlice } from "@/lib/types";
import styles from "./Charts.module.css";

/**
 * Six named slices plus "Other".
 *
 * The dataset has eleven categories, which is more than any categorical colour
 * scale can keep reliably distinguishable — the smallest three are under 2% of
 * spend each and would be slivers nobody can click anyway. Capping keeps every
 * visible slice separable and readable; the full breakdown is still available
 * in the table below.
 */
const MAX_SLICES = 6;

const OTHER_COLOUR = { light: "#8b93a1", dark: "#6b7689" };

interface Props {
  data: CategorySlice[] | undefined;
  loading: boolean;
  /** Categories currently filtered on, so the legend can show their state. */
  selected: string[];
  onToggleCategory: (category: string) => void;
}

export function CategoryChart({
  data,
  loading,
  selected,
  onToggleCategory,
}: Props) {
  const theme = useTheme();

  const { slices, total } = useMemo(() => {
    if (!data?.length) return { slices: [], total: 0 };

    const sorted = [...data].sort((a, b) => Number(b.total) - Number(a.total));
    const head = sorted.slice(0, MAX_SLICES);
    const tail = sorted.slice(MAX_SLICES);

    const slices = head.map((s) => ({
      name: s.category,
      value: Number(s.total),
      count: s.count,
      share: s.share,
      // The API sends both steps; pick the one for the active theme rather
      // than lightening the light hex, which muddies on a dark surface.
      colour: theme === "dark" ? s.colour_dark : s.colour,
      isOther: false,
    }));

    if (tail.length) {
      slices.push({
        name: "Other",
        value: tail.reduce((sum, s) => sum + Number(s.total), 0),
        count: tail.reduce((sum, s) => sum + s.count, 0),
        share: tail.reduce((sum, s) => sum + s.share, 0),
        colour: theme === "dark" ? OTHER_COLOUR.dark : OTHER_COLOUR.light,
        isOther: true,
      });
    }

    return {
      slices,
      total: sorted.reduce((sum, s) => sum + Number(s.total), 0),
    };
  }, [data, theme]);

  return (
    <Card className={styles.chartCard}>
      <CardHeader
        title="Where the money goes"
        subtitle="Successful payments by category. Click a slice to filter."
      />

      {loading && !data ? (
        <div className={styles.chartSkeleton}>
          <Skeleton width={170} height={170} radius="50%" />
        </div>
      ) : slices.length === 0 ? (
        <div className={styles.chartEmpty}>
          <span>No spending matches these filters.</span>
        </div>
      ) : (
        <>
          <div className={`${styles.chartBody} ${styles.donutWrap}`}>
            <div className={styles.chartArea}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    // A donut, not a pie: the hole holds the total, and
                    // comparing arc lengths on a ring is easier than judging
                    // wedge areas from a point.
                    innerRadius={62}
                    outerRadius={98}
                    // A 2px surface-coloured gap between segments. It keeps
                    // two similar hues from bleeding into one another, which
                    // is the secondary encoding the palette's CVD margin
                    // relies on.
                    paddingAngle={1.5}
                    stroke="var(--surface)"
                    strokeWidth={2}
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive={false}
                    onClick={(entry: { name?: string; isOther?: boolean }) => {
                      // "Other" is an aggregate of several categories, so
                      // there is no single filter it maps to.
                      if (entry?.name && !entry.isOther) onToggleCategory(entry.name);
                    }}
                  >
                    {slices.map((slice) => (
                      <Cell
                        key={slice.name}
                        fill={slice.colour}
                        // Dims slices that aren't in an active selection, so
                        // the filtered ones stand out.
                        fillOpacity={
                          selected.length === 0 || selected.includes(slice.name)
                            ? 1
                            : 0.28
                        }
                        style={{ cursor: slice.isOther ? "default" : "pointer" }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CategoryTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className={styles.donutCentre}>
              <span className={styles.donutCentreLabel}>Total spend</span>
              <span className={styles.donutCentreValue}>
                {formatINRCompact(total)}
              </span>
              <span className={styles.donutCentreSub}>
                {slices.length} of {data?.length ?? 0} categories
              </span>
            </div>
          </div>

          {/*
            The legend is also the filter control. Every entry names its
            category next to the swatch, so a colour-blind user never has to
            match hues to read the chart.
          */}
          <div className={styles.legend} role="group" aria-label="Filter by category">
            {slices.map((slice) => {
              const active = selected.includes(slice.name);
              return (
                <button
                  key={slice.name}
                  type="button"
                  className={`${styles.legendItem} ${active ? styles.legendItemActive : ""}`}
                  onClick={() => !slice.isOther && onToggleCategory(slice.name)}
                  disabled={slice.isOther}
                  aria-pressed={slice.isOther ? undefined : active}
                  title={
                    slice.isOther
                      ? "Smaller categories, grouped"
                      : `${active ? "Remove" : "Add"} ${slice.name} filter`
                  }
                >
                  <span
                    className={styles.legendSwatch}
                    style={{ background: slice.colour }}
                    aria-hidden="true"
                  />
                  {slice.name}
                  <span className={styles.legendValue}>
                    {slice.share.toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: { name: string; value: number; count: number; share: number; colour: string; isOther: boolean } }[];
}

function CategoryTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>
        <span
          className={styles.legendSwatch}
          style={{ background: d.colour }}
          aria-hidden="true"
        />
        {d.name}
      </div>
      <div className={styles.tooltipRow}>
        <span>Spend</span>
        <span className={styles.tooltipValue}>{formatINR(d.value)}</span>
      </div>
      <div className={styles.tooltipRow}>
        <span>Share</span>
        <span className={styles.tooltipValue}>{d.share.toFixed(1)}%</span>
      </div>
      <div className={styles.tooltipRow}>
        <span>Payments</span>
        <span className={styles.tooltipValue}>
          {d.count.toLocaleString("en-IN")}
        </span>
      </div>
      {!d.isOther && (
        <div className={styles.tooltipHint}>Click to filter the table</div>
      )}
    </div>
  );
}
