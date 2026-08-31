import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function GooglePlayRedirectPage() {
  redirect("/business/bill-payment?tab=google_play");
}
