"use client";

import type { ReactNode } from "react";
import styles from "./Table.module.css";

export type SortDirection = "asc" | "desc";

export interface Column<T> {
  /** Stable key, also used as the React key for the cell. */
  key: string;
  header: ReactNode;
  /** Fixed column width, applied via <col>. */
  width?: string;
  align?: "left" | "right";
  /** Sort key sent to the API. Omit to make the column unsortable. */
  sortKey?: string;
  render: (row: T) => ReactNode;
  /** Column name repeated on each cell for the stacked mobile layout. */
  label?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  caption: string;

  loading?: boolean;
  /** A refetch with rows already on screen — dims instead of clearing. */
  refreshing?: boolean;
  error?: Error | null;
  onRetry?: () => void;

  sortKey?: string;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;

  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyBody?: ReactNode;
  /** Skeleton row count while loading. Match the page size to avoid a jump. */
  skeletonRows?: number;
  maxHeight?: string;
}

/**
 * The transactions table, built from scratch.
 *
 * Semantic <table> markup rather than divs with ARIA roles: real table
 * semantics give screen readers row/column navigation and announce headers
 * with each cell for free, and no amount of role="grid" fully replicates that.
 *
 * Four states, all handled: loading (skeleton rows, layout preserved),
 * refreshing (previous rows dimmed), error (with retry), and empty (with a
 * hint about what to do next).
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  caption,
  loading = false,
  refreshing = false,
  error = null,
  onRetry,
  sortKey,
  sortDirection = "desc",
  onSort,
  onRowClick,
  emptyTitle = "Nothing to show",
  emptyBody,
  skeletonRows = 10,
  maxHeight,
}: TableProps<T>) {
  const showSkeleton = loading && rows.length === 0;
  const showEmpty = !loading && !error && rows.length === 0;

  return (
    <div
      className={styles.wrap}
      style={maxHeight ? ({ "--table-max-height": maxHeight } as React.CSSProperties) : undefined}
      // A scrollable region must be keyboard reachable, or someone without a
      // mouse cannot scroll the table at all.
      tabIndex={0}
      role="region"
      aria-label={caption}
      aria-busy={loading || refreshing}
    >
      {refreshing && (
        <div className={styles.progress} aria-hidden="true">
          <div className={styles.progressBar} />
        </div>
      )}

      <table
        className={`${styles.table} ${refreshing ? styles.refreshing : ""}`}
      >
        {/* Visually hidden, but it is what a screen reader announces when
            entering the table. */}
        <caption className="srOnly">{caption}</caption>

        {/* Widths live here, which is what makes table-layout: fixed stable
            across pages. */}
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} style={col.width ? { width: col.width } : undefined} />
          ))}
        </colgroup>

        <thead className={styles.thead}>
          <tr>
            {columns.map((col) => {
              const isSorted = Boolean(col.sortKey && sortKey === col.sortKey);
              const sortable = Boolean(col.sortKey && onSort);

              return (
                <th
                  key={col.key}
                  scope="col"
                  className={[
                    col.align === "right" && styles.alignRight,
                    sortable && styles.sortable,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  // Announces the current sort to assistive tech, and is what
                  // a testing tool reads to verify sorting works.
                  aria-sort={
                    isSorted
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : sortable
                        ? "none"
                        : undefined
                  }
                >
                  {sortable ? (
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => onSort!(col.sortKey!)}
                      title={`Sort by ${col.label ?? col.key}`}
                    >
                      {col.header}
                      <svg
                        className={`${styles.sortIcon} ${isSorted ? styles.sortIconActive : ""}`}
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        aria-hidden="true"
                      >
                        {isSorted && sortDirection === "asc" ? (
                          <path
                            d="M6 9V3M3.5 5.5L6 3l2.5 2.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : (
                          <path
                            d="M6 3v6M3.5 6.5L6 9l2.5-2.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      </svg>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {error && (
            <tr>
              <td colSpan={columns.length} className={styles.stateCell}>
                <div className={styles.state}>
                  <div className={`${styles.stateIcon} ${styles.stateIconError}`}>
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                      <path
                        d="M10 6v5M10 14h.01"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <circle
                        cx="10"
                        cy="10"
                        r="7.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                      />
                    </svg>
                  </div>
                  <div className={styles.stateTitle}>Couldn&rsquo;t load transactions</div>
                  <p className={styles.stateBody}>{error.message}</p>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      style={{
                        color: "var(--accent-text)",
                        fontWeight: 500,
                        textDecoration: "underline",
                        textUnderlineOffset: 3,
                      }}
                    >
                      Try again
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )}

          {showSkeleton &&
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={`skeleton-${i}`} className={styles.row}>
                {columns.map((col) => (
                  <td key={col.key}>
                    <span
                      className={styles.skeletonBar}
                      style={{
                        display: "block",
                        height: "0.85em",
                        borderRadius: "999px",
                        background: "var(--surface-sunken)",
                        // Varying widths look like text rather than a grid of
                        // identical grey bars.
                        width: `${55 + ((i * 7 + col.key.length * 11) % 40)}%`,
                        marginLeft: col.align === "right" ? "auto" : undefined,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}

          {showEmpty && (
            <tr>
              <td colSpan={columns.length} className={styles.stateCell}>
                <div className={styles.state}>
                  <div className={styles.stateIcon}>
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                      <circle
                        cx="9"
                        cy="9"
                        r="6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                      />
                      <path
                        d="M13.5 13.5L17 17"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <div className={styles.stateTitle}>{emptyTitle}</div>
                  {emptyBody && <p className={styles.stateBody}>{emptyBody}</p>}
                </div>
              </td>
            </tr>
          )}

          {rows.map((row, i) => (
            <tr
              key={rowKey(row)}
              className={[
                styles.row,
                onRowClick && styles.clickable,
                i === rows.length - 1 && styles.lastRow,
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              // A clickable row must also be operable from the keyboard.
              // tabIndex makes it reachable; Enter and Space match what a
              // button would do.
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "button" : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        // Space would otherwise scroll the region.
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  // Read by the ::before in the stacked mobile layout.
                  data-label={col.label ?? col.key}
                  className={col.align === "right" ? styles.alignRight : undefined}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Cell helpers, exported so the dashboard composes cells from the table's own
   vocabulary rather than redefining these styles. */
export const cellStyles = styles;
