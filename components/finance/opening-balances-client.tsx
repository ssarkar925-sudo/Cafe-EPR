"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";
import OpeningPositionWorkspace, { type OpeningPositionSnapshot } from "@/components/finance/opening-position-workspace";

export type PoolBalances = {
  cash: { opening: number; movements: number; current: number; seed_date: string | null };
  bank: { opening: number; movements: number; current: number; seed_date: string | null };
  wallet: { opening: number; movements: number; current: number; seed_date: string | null };
  dmt: { opening: number; movements: number; current: number; seed_date: string | null };
  aeps: { opening: number; movements: number; current: number; seed_date: string | null };
  upi_qr: { opening: number; movements: number; current: number; seed_date: string | null };
  credit_card: { opening: number; movements: number; current: number; seed_date: string | null };
  total: number;
};

export type InstrumentRow = {
  id: string;
  name: string;
  type: string;
  balance: number;
  opening_balance: number;
  details: any;
  is_active: boolean;
};

export type SeedRow = {
  id: string;
  pool: string;
  instrument_id: string | null;
  amount: number;
  as_of: string;
  remarks: string | null;
  created_at: string;
};

const POOL_LABEL: Record<string, string> = {
  cash: "Cash in Hand",
  bank: "Bank Account",
  wallet: "Digital Wallet",
  dmt: "DMT Float",
  aeps: "AEPS Float",
  upi_qr: "UPI QR",
  credit_card: "Credit Card",
  debit_card: "Debit Card",
};

function fmtDate(d?: string | null) {
  if (!d) return "Not set";
  const dt = new Date(d.length === 10 ? d + "T00:00:00" : d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function OpeningBalancesClient({
  initialBalances,
  initialInstruments,
  initialSeeds,
  customers = [],
  suppliers = [],
  products = [],
}: {
  initialBalances: PoolBalances | null;
  initialInstruments: InstrumentRow[];
  initialSeeds: SeedRow[];
  customers?: any[];
  suppliers?: any[];
  products?: any[];
}) {
  const supabase = createClient();
  const { toastView } = useToast();

  const [balances, setBalances] = useState<PoolBalances | null>(initialBalances);
  const [seeds, setSeeds] = useState<SeedRow[]>(initialSeeds);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [draftExists, setDraftExists] = useState(false);
  const [draftSnapshot, setDraftSnapshot] = useState<OpeningPositionSnapshot | null>(null);

  // Check if a saved draft exists in localStorage (using versioned v2 key)
  useEffect(() => {
    try {
      window.localStorage.removeItem("cafe_erp_opening_position_draft_v1");
      const raw = window.localStorage.getItem("cafe_erp_opening_position_draft_v2");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setDraftExists(true);
          setDraftSnapshot(parsed);
        }
      }
    } catch {}
  }, []);

  async function refresh() {
    const [{ data: b }, { data: s }] = await Promise.all([
      supabase.rpc("get_pool_balances"),
      supabase
        .from("opening_balances")
        .select("id, pool, instrument_id, amount, as_of, remarks, created_at")
        .order("as_of", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    if (b) setBalances(b as any);
    if (s) setSeeds(s as any);
    try {
      window.localStorage.removeItem("cafe_erp_opening_position_draft_v1");
      const raw = window.localStorage.getItem("cafe_erp_opening_position_draft_v2");
      if (raw) {
        const parsed = JSON.parse(raw);
        setDraftExists(true);
        setDraftSnapshot(parsed);
      } else {
        setDraftExists(false);
        setDraftSnapshot(null);
      }
    } catch {}
  }

  // Derive Initialization Status & Metrics
  const isFinalized = useMemo(() => {
    if (!balances) return false;
    const hasAnyOpening = Object.entries(balances)
      .filter(([k]) => k !== "total" && k !== "credit_card")
      .some(([_, v]: any) => Number(v?.opening || 0) > 0);
    return hasAnyOpening || (seeds && seeds.length > 0);
  }, [balances, seeds]);

  const status: "not_initialized" | "draft" | "finalized" = isFinalized
    ? "finalized"
    : draftExists
    ? "draft"
    : "not_initialized";

  const totalSeededAssets = useMemo(() => {
    if (isFinalized && balances) {
      return (
        (balances.cash?.opening || 0) +
        (balances.bank?.opening || 0) +
        (balances.wallet?.opening || 0) +
        (balances.aeps?.opening || 0) +
        (balances.dmt?.opening || 0) +
        (balances.upi_qr?.opening || 0)
      );
    }
    if (draftSnapshot) {
      return Number(draftSnapshot.total_assets || 0);
    }
    return 0;
  }, [isFinalized, balances, draftSnapshot]);

  const totalSeededLiabilities = useMemo(() => {
    if (draftSnapshot) {
      return Number(draftSnapshot.total_liabilities || 0);
    }
    return 0;
  }, [draftSnapshot]);

  const openingCapital = useMemo(() => {
    if (draftSnapshot?.opening_capital !== undefined) {
      return Number(draftSnapshot.opening_capital);
    }
    return totalSeededAssets - totalSeededLiabilities;
  }, [draftSnapshot, totalSeededAssets, totalSeededLiabilities]);

  const totalCurrentAssets = balances?.total ?? 0;
  const activeInstruments = initialInstruments.filter((i) => i.is_active);

  // Credit Card Facility Limit
  const creditLimit = Number(balances?.credit_card?.opening || 0);

  // Opening Anchor Date
  const anchorDate = useMemo(() => {
    if (seeds && seeds.length > 0) {
      return seeds[0].as_of;
    }
    if (draftSnapshot?.opening_date) {
      return draftSnapshot.opening_date;
    }
    return null;
  }, [seeds, draftSnapshot]);

  return (
    <div className="space-y-8 pt-6 sm:pt-8 md:pt-10">
      {/* ========================================================================= */}
      {/* 1. PRIMARY: OPENING FINANCIAL POSITION WORKSPACE HERO */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-slate-900 via-indigo-950/80 to-slate-950 p-6 sm:p-7 text-white shadow-xl ring-1 ring-white/10 mt-1">
        {/* Spatial background glow */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-purple-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl shadow-lg shadow-indigo-500/30">
                🏛️
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
                    ACCOUNT OPENING
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="text-xs font-bold text-slate-300">
                    Single Source of Truth
                  </span>
                </div>
                <h1 className="mt-0.5 text-xl font-black tracking-tight text-white sm:text-2xl">
                  Opening Position &amp; Balance Sheet
                </h1>
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-300">
              Initialize your business starting position from one controlled accounting workspace.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Establish starting cash, bank accounts, digital floats, inventory stock, customer receivables, and supplier payables in one balanced double-entry position.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            {/* Status Pill Badge */}
            <div className="flex items-center gap-2">
              {status === "finalized" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3.5 py-1.5 text-xs font-black text-emerald-300 ring-1 ring-emerald-400/30">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Status: Finalized
                </span>
              ) : status === "draft" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3.5 py-1.5 text-xs font-black text-amber-300 ring-1 ring-amber-400/30">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Status: Draft Saved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/90 px-3.5 py-1.5 text-xs font-black text-slate-300 ring-1 ring-white/15">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  Status: Not Initialized (₹0.00 Baseline)
                </span>
              )}
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={() => setWorkspaceOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-purple-600/30 transition hover:brightness-110 active:scale-[0.98]"
            >
              <span>
                {status === "finalized"
                  ? "View Opening Position Studio"
                  : status === "draft"
                  ? "Continue Opening Position Studio →"
                  : "Launch Opening Position Studio →"}
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Master Position Summary Bento Grid (Read-Only Informational Summary) */}
        <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/5 p-4 backdrop-blur-sm ring-1 ring-white/5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Starting Assets</p>
            <p className="mt-1 text-xl font-black text-white">{inr(totalSeededAssets)}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">Total initialized assets</p>
          </div>

          <div className="rounded-2xl bg-white/5 p-4 backdrop-blur-sm ring-1 ring-white/5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Opening Capital</p>
            <p className="mt-1 text-xl font-black text-purple-400">{inr(openingCapital)}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">Assets minus liabilities equity</p>
          </div>

          <div className="rounded-2xl bg-white/5 p-4 backdrop-blur-sm ring-1 ring-white/5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Current Position</p>
            <p className="mt-1 text-xl font-black text-emerald-400">{inr(totalCurrentAssets)}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">Opening + live net movements</p>
          </div>

          <div className="rounded-2xl bg-white/5 p-4 backdrop-blur-sm ring-1 ring-white/5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Active Accounts</p>
            <p className="mt-1 text-xl font-black text-indigo-300">{activeInstruments.length} Treasury Accounts</p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              {anchorDate ? `Anchor Date: ${fmtDate(anchorDate)}` : "Fresh zero-slate baseline"}
            </p>
          </div>
        </div>

        {/* ACCOUNTING HEALTH & GUARDRAILS BANNER */}
        <div className="relative z-10 mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-indigo-300">Accounting Guardrails</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ✓ All Treasury Modules Reconciled
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-300">
                <span className="flex items-center gap-1"><strong className="text-emerald-400">✓</strong> Physical Cash</span>
                <span className="flex items-center gap-1"><strong className="text-emerald-400">✓</strong> Bank Accounts</span>
                <span className="flex items-center gap-1"><strong className="text-emerald-400">✓</strong> Digital &amp; UPI QR</span>
                <span className="flex items-center gap-1"><strong className="text-emerald-400">✓</strong> AEPS Provider Floats</span>
                <span className="flex items-center gap-1"><strong className="text-emerald-400">✓</strong> DMT Provider Wallets</span>
              </div>
            </div>

            <div className="border-t border-white/10 pt-3 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0 text-xs text-slate-400 space-y-1">
              <p className="flex items-center gap-1.5">
                <span className="font-semibold text-violet-300">Debit Card:</span>
                <span>Linked to Bank · Excluded from asset aggregation (0% duplication)</span>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="font-semibold text-cyan-300">Credit Card:</span>
                <span>Credit facility ({inr(creditLimit)} limit) · Excluded from cash wealth</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. AUDIT TRAIL: OPENING POSITION SEED HISTORY (READ-ONLY) */}
      {/* ========================================================================= */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Opening Position Audit Trail</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Authoritative ledger record of all configured opening balances and adjustments.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
            {seeds.length} Records
          </span>
        </div>

        {seeds.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            <p className="font-medium text-slate-500 dark:text-slate-400">No historical seed adjustments recorded.</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Click &quot;Launch Opening Position Studio&quot; above to initialize your starting balance sheet.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 font-semibold text-slate-500 dark:border-white/5 dark:bg-white/5">
                  <th className="p-3">Pool / Account</th>
                  <th className="p-3">As Of Date</th>
                  <th className="p-3 text-right">Seeded Amount</th>
                  <th className="p-3">Remarks / Purpose</th>
                  <th className="p-3">Recorded Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {seeds.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      {POOL_LABEL[s.pool] ?? s.pool}
                      {s.instrument_id && " (Treasury Account)"}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{fmtDate(s.as_of)}</td>
                    <td className="p-3 text-right font-black text-slate-900 dark:text-white">{inr(s.amount)}</td>
                    <td className="p-3 text-slate-500 dark:text-slate-400">{s.remarks || "—"}</td>
                    <td className="p-3 text-slate-400">{fmtDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Floating Spatial Opening Position Studio */}
      <OpeningPositionWorkspace
        isOpen={workspaceOpen}
        onClose={() => setWorkspaceOpen(false)}
        instruments={initialInstruments}
        customers={customers}
        suppliers={suppliers}
        products={products}
        initialSnapshot={draftSnapshot}
        onFinalized={async () => {
          await refresh();
        }}
      />

      {toastView}
    </div>
  );
}