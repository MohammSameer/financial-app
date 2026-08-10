import { Suspense } from "react";
import { TransactionsView } from "@/components/transactions/TransactionsView";

/**
 * Dashboard route.
 *
 * The Suspense boundary is required, not decorative: useSearchParams opts a
 * component out of static prerendering, and Next fails the build without a
 * boundary around it. Wrapping here keeps the requirement at the route level
 * rather than scattered through the view.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <TransactionsView />
    </Suspense>
  );
}
