"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CategoryChart } from "@/components/analytics/CategoryChart";
import { StatTiles } from "@/components/analytics/StatTiles";
import { TrendChart } from "@/components/analytics/TrendChart";
import { Badge, CategoryBadge, StatusBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Table, type Column } from "@/components/ui/Table";
import { api, toQuery } from "@/lib/api";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  parseFilters,
  serialiseFilters,
  toAnalyticsParams,
  toApiParams,
  type FilterState,
  type SortKey,
} from "@/lib/filters";
import { formatCoins, formatDate, formatINR } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useDebounce } from "@/lib/useDebounce";
import { useTheme } from "@/lib/useTheme";
import type { Transaction } from "@/lib/types";
import { FilterBar } from "./FilterBar";
import { Pagination } from "./Pagination";
import { TransactionDrawer } from "./TransactionDrawer";
import pageStyles from "@/app/page.module.css";
import tableStyles from "@/components/ui/Table.module.css";

export function TransactionsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = useTheme();

  const [openId, setOpenId] = useState<number | null>(null);
  const [dqDismissed, setDqDismissed] = useState(false);

  // Filters live in the URL. Parsing on every render is cheap and guarantees
  // the UI matches the address bar even after a Back navigation.
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  // The search input is uncontrolled by the URL while typing: writing every
  // keystroke to the URL would spam history and make Back useless. The draft
  // holds what's typed, and only the debounced value reaches the URL.
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebounce(searchDraft, 250);

  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );

  const updateFilters = useCallback(
    (patch: Partial<FilterState>) => {
      const next: FilterState = { ...filters, ...patch };

      // Any change to what's being filtered resets to page 1. Staying on page
      // 12 after narrowing to 40 results shows an empty table.
      if (!("page" in patch)) next.page = 1;

      const qs = serialiseFilters(next);
      // replace, not push: a filter tweak shouldn't need eleven Back presses
      // to escape. Chart clicks and explicit navigation still feel natural
      // because the whole state is one URL.
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [filters, router],
  );

  const clearAll = useCallback(() => {
    setSearchDraft("");
    router.replace("/", { scroll: false });
  }, [router]);

  // ---- Data ---------------------------------------------------------------
  const txQuery = toQuery(toApiParams(effectiveFilters));
  const analyticsQuery = toQuery(toAnalyticsParams(effectiveFilters));

  const transactions = useApi(
    (signal) => api.transactions(txQuery, signal),
    txQuery,
  );

  // Same filters, different endpoint. This is what makes cross-filtering
  // two-way: the charts re-aggregate from the same narrowed set the table
  // shows, so filtering by any means reshapes both.
  const analytics = useApi(
    (signal) => api.analytics(analyticsQuery, signal),
    analyticsQuery,
  );

  const meta = useApi((signal) => api.meta(signal), "meta");

  // ---- Interactions -------------------------------------------------------
  const toggleCategory = useCallback(
    (category: string) => {
      updateFilters({
        categories: filters.categories.includes(category)
          ? filters.categories.filter((c) => c !== category)
          : [...filters.categories, category],
      });
    },
    [filters.categories, updateFilters],
  );

  const handleSort = useCallback(
    (key: string) => {
      const sortKey = key as SortKey;
      updateFilters(
        filters.sort === sortKey
          ? // Same column: flip direction.
            { order: filters.order === "asc" ? "desc" : "asc" }
          : // New column: start descending, which is what people want first
            // for both dates (newest) and amounts (largest).
            { sort: sortKey, order: "desc" },
      );
    },
    [filters.sort, filters.order, updateFilters],
  );

  // ---- Columns ------------------------------------------------------------
  const columns: Column<Transaction>[] = useMemo(
    () => [
      {
        key: "merchant",
        header: "Merchant",
        label: "Merchant",
        width: "24%",
        sortKey: "merchant",
        render: (t) => (
          <span className={tableStyles.merchantCell}>
            <span className={tableStyles.merchantName}>{t.merchant}</span>
            {(t.is_id_collision || t.is_outlier) && (
              <span className={tableStyles.flags}>
                {t.is_outlier && (
                  <Badge tone="danger" title="Amount is implausible; excluded from analytics">
                    !
                  </Badge>
                )}
                {t.is_id_collision && (
                  <Badge tone="warning" title="This transaction id is shared with another row">
                    id
                  </Badge>
                )}
              </span>
            )}
          </span>
        ),
      },
      {
        key: "category",
        header: "Category",
        label: "Category",
        width: "16%",
        sortKey: "category",
        render: (t) => (
          <CategoryBadge
            category={t.category}
            colour={theme === "dark" ? t.category_colour_dark : t.category_colour}
          />
        ),
      },
      {
        key: "date",
        header: "Date",
        label: "Date",
        width: "14%",
        sortKey: "date",
        render: (t) => (
          <span className={tableStyles.dateCell}>{formatDate(t.occurred_at)}</span>
        ),
      },
      {
        key: "method",
        header: "Method",
        label: "Method",
        width: "13%",
        render: (t) => <span style={{ color: "var(--text-muted)" }}>{t.payment_method}</span>,
      },
      {
        key: "status",
        header: "Status",
        label: "Status",
        width: "12%",
        render: (t) => <StatusBadge status={t.status} />,
      },
      {
        key: "coins",
        header: "Coins",
        label: "Coins",
        width: "9%",
        align: "right",
        render: (t) => (
          <span
            className={`${tableStyles.coinCell} ${t.coins_earned === 0 ? tableStyles.coinZero : ""}`}
          >
            {t.coins_earned > 0 ? `+${formatCoins(t.coins_earned)}` : "—"}
          </span>
        ),
      },
      {
        key: "amount",
        header: "Amount",
        label: "Amount",
        width: "14%",
        align: "right",
        sortKey: "amount",
        render: (t) => {
          const isRefund = Number(t.amount) < 0;
          return (
            <span
              className={`${tableStyles.amount} ${isRefund ? tableStyles.amountRefund : ""}`}
            >
              {isRefund ? "+" : ""}
              {formatINR(Math.abs(Number(t.amount)))}
            </span>
          );
        },
      },
    ],
    [theme],
  );

  const filtered = activeFilterCount(effectiveFilters) > 0;
  const dq = meta.data?.data_quality;

  return (
    <>
      <div className={pageStyles.pageHead}>
        <div>
          <h1 className={pageStyles.title}>Your spending</h1>
          <p className={pageStyles.subtitle}>
            {DEFAULT_FILTERS.pageSize && meta.data?.min_date
              ? `${meta.data.min_date} to ${meta.data.max_date}`
              : "Every payment, filtered how you like."}
          </p>
        </div>
      </div>

      {dq && !dqDismissed && dq.rows_in_file > 0 && (
        <div className={pageStyles.dqBanner}>
          <svg
            className={pageStyles.dqIcon}
            width="15"
            height="15"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <path d="M8 7.2v4M8 4.8h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <div className={pageStyles.dqBody}>
            <div className={pageStyles.dqTitle}>
              All {dq.rows_loaded.toLocaleString("en-IN")} source rows loaded — after cleaning
            </div>
            <div className={pageStyles.dqList}>
              <span className={pageStyles.dqStat}>
                <span className={pageStyles.dqNumber}>
                  {(
                    (dq.report.epoch_millisecond_timestamps ?? 0) +
                    (dq.report.day_first_timestamps ?? 0) +
                    (dq.report.date_only_timestamps ?? 0)
                  ).toLocaleString("en-IN")}
                </span>{" "}
                timestamps reformatted
              </span>
              <span className={pageStyles.dqStat}>
                <span className={pageStyles.dqNumber}>{dq.report.uncategorised_rows ?? 0}</span>{" "}
                without a category
              </span>
              <span className={pageStyles.dqStat}>
                <span className={pageStyles.dqNumber}>{dq.report.refunds ?? 0}</span> refunds
              </span>
              <span className={pageStyles.dqStat}>
                <span className={pageStyles.dqNumber}>
                  {dq.report.rows_with_duplicate_external_id ?? 0}
                </span>{" "}
                rows with a reused id
              </span>
              <span className={pageStyles.dqStat}>
                <span className={pageStyles.dqNumber}>{dq.report.outlier_amounts ?? 0}</span>{" "}
                implausible amounts
              </span>
            </div>
          </div>
          <button
            type="button"
            className={pageStyles.dqDismiss}
            onClick={() => setDqDismissed(true)}
            aria-label="Dismiss data quality summary"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      <StatTiles
        totals={analytics.data?.totals ?? transactions.data?.totals}
        loading={analytics.loading}
        filtered={filtered}
      />

      <div className={pageStyles.charts}>
        <CategoryChart
          data={analytics.data?.by_category}
          loading={analytics.loading}
          selected={filters.categories}
          onToggleCategory={toggleCategory}
        />
        <TrendChart
          data={analytics.data?.by_month}
          loading={analytics.loading}
          selectedMonth={filters.month}
          onSelectMonth={(month) => updateFilters({ month })}
        />
      </div>

      <FilterBar
        filters={effectiveFilters}
        meta={meta.data ?? undefined}
        resultCount={transactions.data?.meta.total}
        searchDraft={searchDraft}
        onSearchDraft={setSearchDraft}
        searching={searchDraft !== debouncedSearch || transactions.refreshing}
        onChange={updateFilters}
        onClear={clearAll}
      />

      <Card className={pageStyles.tableCard}>
        <Table
          columns={columns}
          rows={transactions.data?.items ?? []}
          rowKey={(t) => t.id}
          caption={`Transactions, ${transactions.data?.meta.total ?? 0} matching the current filters`}
          loading={transactions.loading}
          refreshing={transactions.refreshing}
          error={transactions.error}
          onRetry={transactions.refetch}
          sortKey={filters.sort}
          sortDirection={filters.order}
          onSort={handleSort}
          onRowClick={(t) => setOpenId(t.id)}
          skeletonRows={Math.min(filters.pageSize, 12)}
          emptyTitle="No transactions match"
          emptyBody={
            filtered
              ? "Try widening a filter, or clear them all to start again."
              : "There's nothing in this account yet."
          }
        />

        {transactions.data && transactions.data.meta.total > 0 && (
          <Pagination
            meta={transactions.data.meta}
            onPage={(page) => updateFilters({ page })}
            onPageSize={(pageSize) => updateFilters({ pageSize, page: 1 })}
          />
        )}
      </Card>

      <TransactionDrawer transactionId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

