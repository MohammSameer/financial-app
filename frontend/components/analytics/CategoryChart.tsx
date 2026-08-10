"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatINRCompact } from "@/lib/format";
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

  // Index of the slice under the cursor, or null.
  //
  // This replaces a floating tooltip. A cursor-following box over a donut
  // inevitably lands on the hole — which is exactly where the total sits — so
  // the two overlapped and neither was readable. Feeding the hover into the
  // centre instead makes the collision impossible rather than merely unlikely,
  // uses space the chart already reserves, and drops the per-frame tooltip
  // repositioning entirely.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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

  // Hovering the legend drives the same readout as hovering the ring, so the
  // keyboard path and the pointer path show identical information.
  const active = activeIndex === null ? null : (slices[activeIndex] ?? null);

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
                    onMouseEnter={(_, index: number) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
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
                        // Lifts the hovered slice without moving it, so the
                        // ring geometry stays stable and nothing reflows.
                        stroke={
                          activeIndex === slices.indexOf(slice)
                            ? "var(--text-strong)"
                            : "var(--surface)"
                        }
                        style={{ cursor: slice.isOther ? "default" : "pointer" }}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/*
              The hover readout. aria-live so a screen reader announces the
              category as focus moves through the legend, which is the keyboard
              path to the same information.
            */}
            <div className={styles.donutCentre} aria-live="polite">
              {active ? (
                <>
                  <span className={styles.donutCentreLabel}>
                    <span
                      className={styles.centreSwatch}
                      style={{ background: active.colour }}
                      aria-hidden="true"
                    />
                    {active.name}
                  </span>
                  <span className={styles.donutCentreValue}>
                    {formatINRCompact(active.value)}
                  </span>
                  <span className={styles.donutCentreSub}>
                    {active.share.toFixed(1)}% ·{" "}
                    {active.count.toLocaleString("en-IN")} payments
                  </span>
                </>
              ) : (
                <>
                  <span className={styles.donutCentreLabel}>Total spend</span>
                  <span className={styles.donutCentreValue}>
                    {formatINRCompact(total)}
                  </span>
                  <span className={styles.donutCentreSub}>
                    {slices.length} of {data?.length ?? 0} categories
                  </span>
                </>
              )}
            </div>
          </div>

          {/*
            The legend is also the filter control. Every entry names its
            category next to the swatch, so a colour-blind user never has to
            match hues to read the chart.
          */}
          <div className={styles.legend} role="group" aria-label="Filter by category">
            {slices.map((slice, index) => {
              const isFiltered = selected.includes(slice.name);
              return (
                <button
                  key={slice.name}
                  type="button"
                  className={`${styles.legendItem} ${isFiltered ? styles.legendItemActive : ""}`}
                  onClick={() => !slice.isOther && onToggleCategory(slice.name)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  // Keyboard users get the readout too — focusing a legend
                  // entry shows the same figures hovering the slice would.
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex(null)}
                  disabled={slice.isOther}
                  aria-pressed={slice.isOther ? undefined : isFiltered}
                  title={
                    slice.isOther
                      ? "Smaller categories, grouped"
                      : `${isFiltered ? "Remove" : "Add"} ${slice.name} filter`
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
