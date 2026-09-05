"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/realtime";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { DEFAULT_WA_TEMPLATES, getWhatsAppConfig, renderWhatsAppTemplate, sendWhatsAppMessage } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";
import A4Actions from "@/components/pdf/a4-actions";

type CloseRow = {
  pool: string;
  seed_date: string | null;
  opening: number;
  movements: number;
  computed: number;
  adjustment: number;
  final: number;
  remarks?: string | null;
};

export type OpenClose = {
  id: string;
  closing_number: string;
  close_date: string;
  status: string;
  opened_at: string;
  rows: CloseRow[];
} | null;

export type ClosingRecord = {
  id: string;
  closing_number: string;
  close_date: string;
  status: string;
  net_profit: number;
  owner_deposits: number;
  owner_withdrawals: number;
  balance_check: number;
  opened_at: string;
  closed_at: string | null;
  remarks: string | null;
  balances: (CloseRow & { id: string })[];
};

const POOL_LABEL: Record<string, string> = {
  cash: "Cash in Hand",
  bank: "Bank Balance",
  wallet: "Wallet Balance",
  dmt: "DMT Float",
  aeps: "AEPS Float",
  upi_qr: "UPI QR",
  credit_card: "Credit Card Limit",
};

const POOL_COLOR: Record<string, string> = {
  cash: "text-indigo-600 dark:text-indigo-400",
  bank: "text-blue-600 dark:text-blue-400",
  wallet: "text-emerald-600 dark:text-emerald-400",
  dmt: "text-violet-600 dark:text-violet-400",
  aeps: "text-amber-600 dark:text-amber-400",
  upi_qr: "text-rose-600 dark:text-rose-400",
  credit_card: "text-cyan-600 dark:text-cyan-400",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200";

function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function normalizeOpenClose(oc: OpenClose): OpenClose {
  if (!oc) return null;
  if (typeof oc !== "object") return null;
  return oc;
}

// Credit-card limit is a financing facility, not operational liquidity.
// Keep it visible as a separate figure, but exclude it from actual-funds totals.
const LIQUID_POOLS = new Set(["cash", "bank", "wallet", "dmt", "aeps", "upi_qr"]);

// ... rest of the component remains unchanged ...
