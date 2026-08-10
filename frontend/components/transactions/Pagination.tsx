"use client";

import { Select } from "@/components/ui/Field";
import { formatNumber } from "@/lib/format";
import type { PageMeta } from "@/lib/types";
import styles from "./Pagination.module.css";

interface Props {
  meta: PageMeta;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

/**
 * Build the page-number list with ellipses.
 *
 * 10,000 rows at 25 per page is 400 pages; rendering 400 buttons is absurd, so
 * this shows first, last, current and its neighbours. Returning a stable
 * seven-ish slots keeps the control from changing width as you page, which
 * would otherwise move the button under the user's cursor.
 */
function pageList(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push("gap");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("gap");

  pages.push(total);
  return pages;
}

export function Pagination({ meta, onPage, onPageSize }: Props) {
  const { page, page_size, total, total_pages, has_next, has_prev } = meta;

  const first = total === 0 ? 0 : (page - 1) * page_size + 1;
  const last = Math.min(page * page_size, total);

  return (
    <nav className={styles.bar} aria-label="Pagination">
      <span className={styles.summary}>
        <span className={styles.strong}>
          {formatNumber(first)}–{formatNumber(last)}
        </span>{" "}
        of <span className={styles.strong}>{formatNumber(total)}</span>
      </span>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.pageButton}
          onClick={() => onPage(page - 1)}
          disabled={!has_prev}
          aria-label="Previous page"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M7.5 2.5L4 6l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <span className={styles.numbered} style={{ display: "contents" }}>
          {pageList(page, total_pages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className={styles.ellipsis} aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={`${styles.pageButton} ${p === page ? styles.pageButtonActive : ""}`}
                onClick={() => onPage(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </button>
            ),
          )}
        </span>

        <button
          type="button"
          className={styles.pageButton}
          onClick={() => onPage(page + 1)}
          disabled={!has_next}
          aria-label="Next page"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M4.5 2.5L8 6l-3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <label className={styles.sizeGroup}>
        Rows
        <Select
          className={styles.sizeSelect}
          value={String(page_size)}
          onChange={(e) => onPageSize(Number(e.target.value))}
          options={[
            { value: "10", label: "10" },
            { value: "25", label: "25" },
            { value: "50", label: "50" },
            { value: "100", label: "100" },
          ]}
        />
      </label>
    </nav>
  );
}
