"use client";

import { useEffect, useState } from "react";
import { Field, Input, useFieldId } from "@/components/ui/Field";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { formatMonth, formatNumber } from "@/lib/format";
import type { FilterState } from "@/lib/filters";
import { activeFilterCount } from "@/lib/filters";
import type { Meta } from "@/lib/types";
import styles from "./FilterBar.module.css";

interface Props {
  filters: FilterState;
  meta: Meta | undefined;
  resultCount: number | undefined;
  /** Immediate search text, before debounce, so the input stays responsive. */
  searchDraft: string;
  onSearchDraft: (value: string) => void;
  searching: boolean;
  onChange: (patch: Partial<FilterState>) => void;
  onClear: () => void;
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function FilterBar({
  filters,
  meta,
  resultCount,
  searchDraft,
  onSearchDraft,
  searching,
  onChange,
  onClear,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const searchId = useFieldId("search");
  const fromId = useFieldId("from");
  const toId = useFieldId("to");
  const minId = useFieldId("min");
  const maxId = useFieldId("max");

  const active = activeFilterCount(filters);

  // Open the advanced panel automatically if a date or amount filter is
  // already set — from a shared URL, say. Leaving it collapsed would hide the
  // reason the table looks unexpectedly narrow.
  useEffect(() => {
    if (filters.dateFrom || filters.dateTo || filters.amountMin || filters.amountMax) {
      setShowAdvanced(true);
    }
  }, [filters.dateFrom, filters.dateTo, filters.amountMin, filters.amountMax]);

  const chips: { key: string; label: string; onRemove: () => void }[] = [];

  if (filters.search) {
    chips.push({
      key: "search",
      label: `“${filters.search}”`,
      onRemove: () => {
        onSearchDraft("");
        onChange({ search: "" });
      },
    });
  }
  for (const c of filters.categories) {
    chips.push({
      key: `cat-${c}`,
      label: c,
      onRemove: () =>
        onChange({ categories: filters.categories.filter((v) => v !== c) }),
    });
  }
  for (const s of filters.statuses) {
    chips.push({
      key: `st-${s}`,
      label: s.charAt(0) + s.slice(1).toLowerCase(),
      onRemove: () => onChange({ statuses: filters.statuses.filter((v) => v !== s) }),
    });
  }
  for (const m of filters.paymentMethods) {
    chips.push({
      key: `pm-${m}`,
      label: m,
      onRemove: () =>
        onChange({ paymentMethods: filters.paymentMethods.filter((v) => v !== m) }),
    });
  }
  if (filters.month) {
    chips.push({
      key: "month",
      label: formatMonth(filters.month),
      onRemove: () => onChange({ month: "" }),
    });
  }
  if (filters.dateFrom || filters.dateTo) {
    chips.push({
      key: "dates",
      label: `${filters.dateFrom || "start"} → ${filters.dateTo || "today"}`,
      onRemove: () => onChange({ dateFrom: "", dateTo: "" }),
    });
  }
  if (filters.amountMin || filters.amountMax) {
    chips.push({
      key: "amounts",
      label: `₹${filters.amountMin || "0"} – ₹${filters.amountMax || "∞"}`,
      onRemove: () => onChange({ amountMin: "", amountMax: "" }),
    });
  }

  return (
    <section className={styles.bar} aria-label="Filters">
      <div className={styles.row}>
        <div className={styles.searchField}>
          <Field label="Search merchant" htmlFor={searchId}>
            <Input
              id={searchId}
              // type="search" gives mobile keyboards a search key and lets the
              // browser offer previous searches.
              type="search"
              placeholder="Zomato, Amazon, IRCTC…"
              value={searchDraft}
              onChange={(e) => onSearchDraft(e.target.value)}
              onClear={() => {
                onSearchDraft("");
                onChange({ search: "" });
              }}
              busy={searching}
              leadingIcon={<SearchIcon />}
              autoComplete="off"
            />
          </Field>
        </div>

        <Field label="Category">
          <MultiSelect
            label="Category"
            options={(meta?.categories ?? []).map((c) => ({
              value: c.value,
              label: c.label,
              count: c.count,
              colour: c.colour,
            }))}
            selected={filters.categories}
            onChange={(categories) => onChange({ categories })}
            placeholder="All categories"
          />
        </Field>

        <Field label="Status">
          <MultiSelect
            label="Status"
            options={(meta?.statuses ?? []).map((s) => ({
              value: s.value,
              label: s.label,
              count: s.count,
            }))}
            selected={filters.statuses}
            onChange={(statuses) => onChange({ statuses })}
            placeholder="Any status"
          />
        </Field>

        <Field label="Payment method">
          <MultiSelect
            label="Payment method"
            options={(meta?.payment_methods ?? []).map((p) => ({
              value: p.value,
              label: p.label,
              count: p.count,
            }))}
            selected={filters.paymentMethods}
            onChange={(paymentMethods) => onChange({ paymentMethods })}
            placeholder="Any method"
          />
        </Field>

        <button
          type="button"
          className={styles.moreButton}
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          Date &amp; amount
          <svg
            className={`${styles.chevron} ${showAdvanced ? styles.chevronOpen : ""}`}
            width="11"
            height="11"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {showAdvanced && (
        <div className={styles.advanced}>
          <Field label="From date" htmlFor={fromId}>
            <Input
              id={fromId}
              type="date"
              value={filters.dateFrom}
              min={meta?.min_date ?? undefined}
              max={meta?.max_date ?? undefined}
              onChange={(e) => onChange({ dateFrom: e.target.value })}
            />
          </Field>

          <Field label="To date" htmlFor={toId}>
            <Input
              id={toId}
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom || (meta?.min_date ?? undefined)}
              max={meta?.max_date ?? undefined}
              onChange={(e) => onChange({ dateTo: e.target.value })}
            />
          </Field>

          <Field
            label="Min amount (₹)"
            htmlFor={minId}
            hint={meta?.min_amount ? `lowest ₹${Number(meta.min_amount).toFixed(0)}` : undefined}
          >
            <Input
              id={minId}
              type="number"
              numeric
              inputMode="decimal"
              placeholder="0"
              value={filters.amountMin}
              onChange={(e) => onChange({ amountMin: e.target.value })}
            />
          </Field>

          <Field
            label="Max amount (₹)"
            htmlFor={maxId}
            hint={meta?.max_amount ? `highest ₹${Number(meta.max_amount).toFixed(0)}` : undefined}
          >
            <Input
              id={maxId}
              type="number"
              numeric
              inputMode="decimal"
              placeholder="Any"
              value={filters.amountMax}
              onChange={(e) => onChange({ amountMax: e.target.value })}
            />
          </Field>
        </div>
      )}

      <div className={styles.toggleRow}>
        <div className={styles.chips}>
          {chips.length === 0 ? (
            <span className={styles.resultCount}>
              Showing all {resultCount != null ? formatNumber(resultCount) : "—"}{" "}
              transactions
            </span>
          ) : (
            chips.map((chip) => (
              <span key={chip.key} className={styles.chip}>
                <span className={styles.chipLabel}>{chip.label}</span>
                <button
                  type="button"
                  className={styles.chipRemove}
                  onClick={chip.onRemove}
                  aria-label={`Remove filter ${chip.label}`}
                >
                  <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
                    <path
                      d="M3 3l6 6M9 3l-6 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </span>
            ))
          )}
        </div>

        <div className={styles.right}>
          {chips.length > 0 && (
            <span className={styles.resultCount} aria-live="polite">
              {resultCount != null ? formatNumber(resultCount) : "—"} matching
            </span>
          )}
          {active > 0 && (
            <button type="button" className={styles.clearAll} onClick={onClear}>
              Clear all
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
