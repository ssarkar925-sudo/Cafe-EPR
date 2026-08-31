import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function FinanceAccountsRedirectPage() {
  // Payment Accounts authoritative location is /settings?tab=accounts
  // This canonical URL provides direct access from Finance Hub navigation
  redirect("/settings?tab=accounts");
}
