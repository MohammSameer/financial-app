/**
 * Filter state, and its mapping to and from the URL.
 *
 * The URL is the single source of truth for every filter, the sort and the
 * page. That buys three things a useState would not:
 *   - a filtered view is shareable and bookmarkable
 *   - the browser Back button steps back through filter changes
 *   - a reload keeps you where you were
 *
 * It also removes the class of bug where the table and the charts hold
 * separate copies of "the current filters" and drift out of sync — there is
 * only one copy, and it is in the address bar.
 */

export type SortKey = "date" | "amount" | "merchant" | "category";
export type SortOrder = "asc" | "desc";

export interface FilterState {
  search: string;
  categories: string[];
  statuses: string[];
  paymentMethods: string[];
  merchants: string[];
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  /** 'YYYY-MM', set by clicking a bar on the trend chart. */
  month: string;
  page: number;
  pageSize: number;
  sort: SortKey;
  order: SortOrder;
}

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  categories: [],
  statuses: [],
  paymentMethods: [],
  merchants: [],
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: "",
  month: "",
  page: 1,
  pageSize: 25,
  sort: "date",
  order: "desc",
};

const SORT_KEYS: SortKey[] = ["date", "amount", "merchant", "category"];

export function parseFilters(params: URLSearchParams): FilterState {
  const sort = params.get("sort");
  const order = params.get("order");
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("size"));

  return {
    search: params.get("q") ?? "",
    categories: params.getAll("category"),
    statuses: params.getAll("status"),
    paymentMethods: params.getAll("method"),
    merchants: params.getAll("merchant"),
    dateFrom: params.get("from") ?? "",
    dateTo: params.get("to") ?? "",
    amountMin: params.get("min") ?? "",
    amountMax: params.get("max") ?? "",
    month: params.get("month") ?? "",
    // A hand-edited URL is untrusted input. Anything invalid falls back to the
    // default rather than being passed to the API as NaN.
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: [10, 25, 50, 100].includes(pageSize) ? pageSize : 25,
    sort: SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : "date",
    order: order === "asc" ? "asc" : "desc",
  };
}

/**
 * Serialise to a query string, omitting anything at its default.
 *
 * Keeping defaults out means an unfiltered dashboard has a clean URL, and two
 * equivalent filter states always produce the identical string.
 */
export function serialiseFilters(f: FilterState): string {
  const p = new URLSearchParams();

  if (f.search) p.set("q", f.search);
  for (const c of f.categories) p.append("category", c);
  for (const s of f.statuses) p.append("status", s);
  for (const m of f.paymentMethods) p.append("method", m);
  for (const m of f.merchants) p.append("merchant", m);
  if (f.dateFrom) p.set("from", f.dateFrom);
  if (f.dateTo) p.set("to", f.dateTo);
  if (f.amountMin) p.set("min", f.amountMin);
  if (f.amountMax) p.set("max", f.amountMax);
  if (f.month) p.set("month", f.month);
  if (f.page > 1) p.set("page", String(f.page));
  if (f.pageSize !== 25) p.set("size", String(f.pageSize));
  if (f.sort !== "date") p.set("sort", f.sort);
  if (f.order !== "desc") p.set("order", f.order);

  return p.toString();
}

/**
 * Build the API query for the transactions endpoint.
 *
 * Note the parameter names differ from the URL's: the URL is optimised to be
 * short and human-editable (`q`, `from`), the API to be explicit (`search`,
 * `date_from`). This function is the only place that has to know both.
 */
export function toApiParams(f: FilterState): Record<string, unknown> {
  return {
    search: f.search || undefined,
    category: f.categories,
    status: f.statuses,
    payment_method: f.paymentMethods,
    merchant: f.merchants,
    date_from: f.dateFrom || undefined,
    date_to: f.dateTo || undefined,
    amount_min: f.amountMin || undefined,
    amount_max: f.amountMax || undefined,
    month: f.month || undefined,
    sort: f.sort,
    order: f.order,
    page: f.page,
    page_size: f.pageSize,
  };
}

/**
 * The same filters minus paging and sorting.
 *
 * The charts describe the whole filtered set, so sending page or sort would be
 * meaningless — and would also give the analytics response a different cache
 * key on every page change, refetching identical aggregates.
 */
export function toAnalyticsParams(f: FilterState): Record<string, unknown> {
  const { page, page_size, sort, order, ...rest } = toApiParams(f);
  void page;
  void page_size;
  void sort;
  void order;
  return rest;
}

/** How many filters are actually narrowing the data, for the "Clear" button. */
export function activeFilterCount(f: FilterState): number {
  return (
    (f.search ? 1 : 0) +
    f.categories.length +
    f.statuses.length +
    f.paymentMethods.length +
    f.merchants.length +
    (f.dateFrom ? 1 : 0) +
    (f.dateTo ? 1 : 0) +
    (f.amountMin ? 1 : 0) +
    (f.amountMax ? 1 : 0) +
    (f.month ? 1 : 0)
  );
}
