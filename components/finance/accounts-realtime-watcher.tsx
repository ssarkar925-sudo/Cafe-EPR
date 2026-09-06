"use client";

import { useRealtime } from "@/lib/supabase/realtime";

export default function AccountsRealtimeWatcher() {
  useRealtime([
    "payment_instruments",
    "cash_entries",
    "settlements",
    "transactions",
    "expenses",
    "purchases",
    "opening_balances",
  ]);

  return null;
}
