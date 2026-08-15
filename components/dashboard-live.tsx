"use client";

import { useRealtime } from "@/lib/supabase/realtime";

export default function DashboardLive({
  children,
}: {
  children: React.ReactNode;
}) {
  useRealtime([
    "invoices",
    "invoice_items",
    "payments",
    "products",
    "customers",
    "services",
    "cash_entries",
    "expenses",
  ]);
  return <>{children}</>;
}
