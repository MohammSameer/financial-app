import type { Metadata } from "next";
import { RewardsView } from "@/components/rewards/RewardsView";

export const metadata: Metadata = {
  title: "Rewards — CoinStack",
  description: "Spend your coins on vouchers, cashback and fee waivers.",
};

export default function RewardsPage() {
  return <RewardsView />;
}
