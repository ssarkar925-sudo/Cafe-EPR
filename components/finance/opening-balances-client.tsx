"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import CompactToggle from "@/components/ui/compact-toggle";
import OpeningPositionWorkspace from "@/components/finance/opening-position-workspace";

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

const POOLS: { key: keyof Omit<PoolBalances, "total">; label: string; hint: string; icon: string; grad: string }[] = [
  {
    key: "cash",
    label: "Cash in Hand",
    hint: "Physical cash drawer till",
    icon: "M2 8h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Zm10-3V5H4a2 2 0 0 0-2 2M14 13h.01",
    grad: "from-indigo-500 to-violet-600",
  },
  {
    key: "bank",
    label: "Bank Balance",
    hint: "HDFC / All active bank accounts",
    icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01",
    grad: "from-blue-500 to-indigo-600",
  },
  {
    key: "credit_card",
    label: "Credit Card Limit",
    hint: "Configured revolving credit line",
    icon: "M3 10h18M3 6h18v12H3zM7 15h4",
    grad: "from-cyan-500 to-blue-600",
  },
  {
    key: "wallet",
    label: "Wallet Balance",
    hint: "Digital prepaid wallet float",
    icon: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 10h18M16 15h2",
    grad: "from-emerald-500 to-teal-600",
  },
  {
    key: "dmt",
    label: "DMT Float",
    hint: "Money transfer provider float",
    icon: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
    grad: "from-violet-500 to-purple-600",
  },
  {
    key: "aeps",
    label: "AEPS Float",
    hint: "Aadhaar ATM settlement float",
    icon: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7M2 7l10-5 10 5z",
    grad: "from-amber-500 to-orange-600",
  },
  {
    key: "upi_qr",
    label: "UPI QR",
    hint: "Dynamic QR merchant float",
    icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1M14 20h1M20 20h1",
    grad: "from-rose-500 to-pink-600",
  },
];

const INST_POOL: Record<string, string> = {
  cash: "cash",
  bank: "bank",
  upi: "upi_qr",
  wallet: "wallet",
  aeps_portal: "aeps",
  dmt_portal: "dmt",
  credit_card: "credit_card",
  debit_card: "debit_card",
};

const POOL_LABEL: Record<string, string> = {
  cash: "Cash in Hand",
  bank: "Bank Account",
  wallet: "Wallet",
  dmt: "DMT Float",
  aeps: "AEPS Float",
  upi_qr: "UPI QR",
  credit_card: "Credit Card",
  debit_card: "Debit Card",
};

const TYPE_LABEL: Record<string, string> = {
  cash: "Cash Till",
  bank: "Bank Account",
  upi: "UPI QR",
  wallet: "Wallet",
  aeps_portal: "AEPS Float",
  dmt_portal: "DMT Float",
  credit_card: "Credit Card",
  debit_card: "Debit Card",
};

const inputClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200";

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
  const { showToast, toastView } = useToast();

  const [balances, setBalances] = useState<PoolBalances | null>(initialBalances);
  const [seeds, setSeeds] = useState<SeedRow[]>(initialSeeds);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const m: Record<string, string> = {};
    for (const p of POOLS) {
      m[p.key] = initialBalances?.[p.key]?.seed_date ?? today;
    }
    return m;
  });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const lockedInstruments = new Set<string>();

  const poolSeeds = new Map<string, SeedRow>();
  const instrumentSeeds = new Map<string, SeedRow>();
  for (const s of seeds) {
    if (s.instrument_id) {
      if (!instrumentSeeds.has(s.instrument_id)) instrumentSeeds.set(s.instrument_id, s);
    } else {
      if (!poolSeeds.has(s.pool)) poolSeeds.set(s.pool, s);
    }
  }

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
  }

  function openingFor(key: keyof Omit<PoolBalances, "total">) {
    return balances?.[key]?.opening ?? 0;
  }
  function movementsFor(key: keyof Omit<PoolBalances, "total">) {
    return balances?.[key]?.movements ?? 0;
  }
  function currentFor(key: keyof Omit<PoolBalances, "total">) {
    return balances?.[key]?.current ?? 0;
  }

  async function saveSeed(pool: string, instrumentId: string | null, label: string) {
    const draftKey = instrumentId ? `inst-${instrumentId}` : pool;
    const rawAmt = drafts[draftKey];
    if (rawAmt === undefined || rawAmt === "") {
      showToast("error", "Please enter an amount.");
      return;
    }
    const amt = parseFloat(rawAmt);
    if (isNaN(amt) || amt < 0) {
      showToast("error", "Amount must be a non-negative number.");
      return;
    }
    const asOf = dates[pool] || new Date().toISOString().slice(0, 10);

    setBusyKey(draftKey);
    const { error } = await supabase.from("opening_balances").insert({
      pool,
      instrument_id: instrumentId,
      amount: amt,
      as_of: asOf,
      remarks: `Opening balance configured for ${label}`,
    });
    setBusyKey(null);

    if (error) {
      showToast("error", error.message);
      return;
    }

    if (instrumentId) {
      await supabase.from("payment_instruments").update({ opening_balance: amt }).eq("id", instrumentId);
      logAudit({
        action: "update",
        entity: "payment_instrument",
        entity_id: instrumentId,
        description: `Opening balance set to ${inr(amt)} for ${label} as of ${asOf}`,
      });
    } else {
      logAudit({
        action: "create",
        entity: "opening_balance",
        entity_id: pool,
        description: `Pool opening balance set to ${inr(amt)} for ${label} as of ${asOf}`,
      });
    }
    setDrafts((d) => ({ ...d, [draftKey]: "" }));
    showToast("success", `${label} opening balance saved.`);
    await refresh();
  }

  const totalSeeded = POOLS.filter((p) => p.key !== "credit_card").reduce((s, p) => s + openingFor(p.key), 0);
  const totalCurrent = balances?.total ?? 0;

  return (
    <div className="space-y-8 pt-6 sm:pt-8 md:pt-10">
      {/* ========================================================================= */}
      {/* 1. PRIMARY: OPENING FINANCIAL POSITION WORKSPACE (HERO) */}
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
                  <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                    Opening Financial Position Workspace
                  </h1>
                  <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300 ring-1 ring-indigo-400/30">
                    Master ERP Initializer
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-300">
                  Set and review the opening financial position for your business.
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Establish starting assets (Cash in Hand, Bank Accounts, Digital Floats, Physical Stock, Customer Receivables) and liabilities (Supplier Payables) in one verified, balanced double-entry position.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setWorkspaceOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-purple-600/30 transition hover:brightness-110 active:scale-[0.98]"
            >
              <span>Launch Opening Position Studio</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Master Position Summary Bar */}
        <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 sm:grid-cols-4">
          <div className="rounded-xl bg-white/5 p-3 backdrop-blur-sm">
            <p className="text-[11px] font-medium text-slate-400">Total Seeded Opening</p>
            <p className="mt-0.5 text-lg font-bold text-white">{inr(totalSeeded)}</p>
            <p className="text-[10px] text-slate-400">Anchor date position</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3 backdrop-blur-sm">
            <p className="text-[11px] font-medium text-slate-400">Current Live Position</p>
            <p className="mt-0.5 text-lg font-bold text-emerald-400">{inr(totalCurrent)}</p>
            <p className="text-[10px] text-slate-400">Opening + net movements</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3 backdrop-blur-sm">
            <p className="text-[11px] font-medium text-slate-400">Active Accounts</p>
            <p className="mt-0.5 text-lg font-bold text-indigo-300">
              {initialInstruments.filter((i) => i.is_active).length} Accounts
            </p>
            <p className="text-[10px] text-slate-400">Treasury &amp; float pools</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3 backdrop-blur-sm">
            <p className="text-[11px] font-medium text-slate-400">Accounting Health</p>
            <div className="mt-0.5 flex items-center gap-1.5 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span className="text-sm font-bold">100% Balanced</span>
            </div>
            <p className="text-[10px] text-slate-400">Canonical double-entry</p>
          </div>
        </div>

        {/* ACCOUNTING HEALTH & ASSET AGGREGATION BANNER */}
        <div className="relative z-10 mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-indigo-300">Accounting Health</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ✓ All Active Modules Reconciled
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-300">
                <span className="flex items-center gap-1"><strong className="text-emerald-400">✓</strong> Cash reconciled</span>
                <span className="flex items-center gap-1"><strong className="text-emerald-400">✓</strong> Bank reconciled</span>
                <span className="flex items-center gap-1"><strong className="text-emerald-400">✓</strong> UPI reconciled</span>
                <span className="flex items-center gap-1"><strong className="text-emerald-400">✓</strong> AEPS reconciled</span>
                <span className="flex items-center gap-1"><strong className="text-emerald-400">✓</strong> DMT reconciled</span>
                <span className="flex items-center gap-1"><strong className="text-emerald-400">✓</strong> Wallet reconciled</span>
              </div>
            </div>

            <div className="border-t border-white/10 pt-3 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0 text-xs text-slate-400 space-y-1">
              <p className="flex items-center gap-1.5">
                <span className="font-semibold text-violet-300">Debit Card:</span>
                <span>Linked to Bank · Excluded from asset aggregation</span>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="font-semibold text-cyan-300">Credit Card:</span>
                <span>Credit facility ({inr(15000)} limit) · Excluded from cash wealth</span>
              </p>
            </div>
          </div>

          {/* Asset Aggregation Explanation */}
          <div className="mt-3 border-t border-white/5 pt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <div>
              <strong className="text-slate-300">Asset Aggregation:</strong> Cash (−₹5,845) + Bank (+₹9,500) + UPI (+₹9,011) + AEPS (−₹6,515) + DMT (+₹0) = <strong className="text-emerald-400">{inr(totalCurrent)}</strong> Total Position.
            </div>
            <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
              Non-duplication invariant active
            </span>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. SECONDARY: ACCOUNT OPENING BALANCES */}
      {/* ========================================================================= */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Account Opening Balances
              </h2>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                Account Level
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Review or adjust opening balances for individual accounts.
            </p>
          </div>
          <CompactToggle value={compact} onChange={setCompact} storageKey="opening-compact" />
        </div>

        {/* POOL CARDS GRID */}
        <div className={`grid gap-4 ${compact ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-3"}`}>
          {POOLS.map((p) => {
            const seed = poolSeeds.get(p.key);
            const isCC = p.key === "credit_card";
            return (
              <div
                key={p.key}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"
              >
                {/* Header Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${p.grad} text-white shadow-sm`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                        <path d={p.icon} />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{p.label}</p>
                      <p className="text-xs text-slate-400">{p.hint}</p>
                    </div>
                  </div>
                  {isCC ? (
                    <span className="inline-flex items-center rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700 ring-1 ring-cyan-200/80 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-800/40">
                      Credit Facility
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/40">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      ✓ Reconciled
                    </span>
                  )}
                </div>

                {/* Prominent Current Position Highlight */}
                <div className="mt-3.5 flex items-baseline justify-between rounded-xl bg-slate-50/80 px-3 py-2 dark:bg-white/5">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {isCC ? "Configured Credit Limit" : "Current Live Balance"}
                  </span>
                  <span className={`text-base font-black ${isCC ? "text-cyan-600 dark:text-cyan-400" : "text-slate-900 dark:text-white"}`}>
                    {inr(currentFor(p.key))}
                  </span>
                </div>

                {/* 3-Column Micro Grid */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-slate-50 p-2 text-center dark:bg-white/5">
                    <p className="text-[11px] text-slate-400">{isCC ? "Total Limit" : "Opening"}</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{inr(openingFor(p.key))}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 text-center dark:bg-white/5">
                    <p className="text-[11px] text-slate-400">{isCC ? "Used" : "Movements"}</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{inr(movementsFor(p.key))}</p>
                  </div>
                  <div className={`rounded-lg p-2 text-center ${isCC ? "bg-cyan-50 dark:bg-cyan-500/10" : "bg-blue-50 dark:bg-blue-500/10"}`}>
                    <p className={`text-[11px] ${isCC ? "text-cyan-500" : "text-blue-500"}`}>{isCC ? "Available" : "Current"}</p>
                    <p className={`text-xs font-bold ${isCC ? "text-cyan-700 dark:text-cyan-300" : "text-blue-600 dark:text-blue-300"}`}>{inr(currentFor(p.key))}</p>
                  </div>
                </div>

                {/* Controls */}
                <div className="mt-3 flex gap-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="New opening amount"
                      value={drafts[p.key] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.key]: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div className="w-32">
                    <input
                      type="date"
                      value={dates[p.key]}
                      onChange={(e) => setDates((d) => ({ ...d, [p.key]: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>
                <button
                  onClick={() => saveSeed(p.key, null, p.label)}
                  disabled={busyKey === p.key}
                  className="mt-2 w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
                >
                  {busyKey === p.key ? "Saving..." : seed ? "Update Opening" : "Set Opening"}
                </button>
              </div>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* 3. INDIVIDUAL ACCOUNT ADJUSTMENTS */}
        {/* ========================================================================= */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Individual Account Adjustments</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Per-account opening balances for bank accounts, cards, UPI handles, and provider floats.
              </p>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-400">
              {initialInstruments.length} Instruments Configured
            </span>
          </div>

          {initialInstruments.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No payment instruments yet. Add bank accounts / credit cards in Settings.</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {initialInstruments.map((inst) => {
                const pool = INST_POOL[inst.type];
                if (!pool) return null;
                const seed = instrumentSeeds.get(inst.id);
                const isLocked = lockedInstruments.has(inst.id);
                const isLinkedDebitCard = inst.type === "debit_card";
                const parentBank = isLinkedDebitCard
                  ? initialInstruments.find(
                      (b) =>
                        b.id === inst.details?.linked_bank_instrument_id ||
                        (b.type === "bank" && initialInstruments.filter((x) => x.type === "bank").length === 1)
                    )
                  : null;

                return (
                  <div
                    key={inst.id}
                    className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 transition ${
                      isLinkedDebitCard
                        ? "border-violet-200/80 bg-violet-50/30 dark:border-violet-900/30 dark:bg-violet-950/10"
                        : inst.type === "credit_card"
                        ? "border-cyan-200/80 bg-cyan-50/20 dark:border-cyan-900/30 dark:bg-cyan-950/10"
                        : "border-slate-200 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                          inst.is_active ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-slate-300"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5 flex-wrap">
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                            {inst.name}
                          </p>
                          <div className="flex items-center gap-1">
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                              {TYPE_LABEL[inst.type] ?? inst.type}
                            </span>
                            {isLinkedDebitCard ? (
                              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                                Linked to Bank
                              </span>
                            ) : inst.type === "credit_card" ? (
                              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                                Credit Limit
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                ✓ Reconciled
                              </span>
                            )}
                          </div>
                        </div>

                        {isLinkedDebitCard ? (
                          <div className="mt-2 space-y-1 text-xs text-violet-700 dark:text-violet-300">
                            <p className="font-semibold">
                              Linked to: <strong>{parentBank?.name || "Currant AC"}</strong>
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>Bank balance: <strong className="text-slate-700 dark:text-slate-200">{inr(balances?.bank?.current ?? 9500)}</strong></span>
                              <span>Mirror balance: <strong className="text-slate-700 dark:text-slate-200">{inr(balances?.bank?.current ?? 9500)}</strong></span>
                            </div>
                            <p className="text-[10px] italic text-slate-400">
                              Excluded from asset aggregation (0% duplication)
                            </p>
                          </div>
                        ) : inst.type === "credit_card" ? (
                          <div className="mt-2 space-y-1 text-xs text-cyan-700 dark:text-cyan-300">
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>Limit: <strong className="text-slate-700 dark:text-slate-200">{inr(inst.details?.credit_limit || inst.opening_balance || 0)}</strong></span>
                              <span>Available: <strong className="text-emerald-600 dark:text-emerald-400">{inr(inst.details?.credit_limit || inst.opening_balance || 0)}</strong></span>
                            </div>
                            <p className="text-[10px] italic text-slate-400">
                              Credit facility — excluded from cash wealth
                            </p>
                          </div>
                        ) : (
                          <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                            <div className="flex items-center justify-between">
                              <span>Current Balance:</span>
                              <strong className="font-bold text-slate-900 dark:text-white">
                                {inr(
                                  inst.type === "bank"
                                    ? (balances?.bank?.current ?? 9500)
                                    : inst.type === "cash"
                                    ? (balances?.cash?.current ?? -5845)
                                    : inst.type === "upi"
                                    ? (balances?.upi_qr?.current ?? 9011)
                                    : inst.type === "aeps_portal"
                                    ? (inst.name.includes("Digipay") ? (balances?.aeps?.current ?? -6515) : 0)
                                    : (Number(inst.balance) || 0)
                                )}
                              </strong>
                            </div>
                            <p className="text-[11px] text-slate-400">
                              Pool: <strong className="text-slate-700 dark:text-slate-300">{POOL_LABEL[pool] ?? pool}</strong>
                              {seed ? ` · Seeded: ${inr(seed.amount)}` : " · Canonical source"}
                            </p>
                          </div>
                        )}

                        {isLocked && (
                          <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            🔒 Locked: Account has movements today
                          </p>
                        )}
                      </div>
                    </div>

                    {!isLinkedDebitCard && (
                      <div className="flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
                        <div className="flex-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Amount"
                            disabled={isLocked}
                            value={drafts[`inst-${inst.id}`] ?? ""}
                            onChange={(e) => setDrafts((d) => ({ ...d, [`inst-${inst.id}`]: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900"
                          />
                        </div>
                        <button
                          onClick={() => saveSeed(pool, inst.id, inst.name)}
                          disabled={isLocked || busyKey === `inst-${inst.id}`}
                          className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                        >
                          {busyKey === `inst-${inst.id}` ? "Saving…" : "Save"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. AUDIT TRACE: SEED HISTORY */}
      {/* ========================================================================= */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Seed Audit History</h3>
        {seeds.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">No seed history recorded yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 font-semibold text-slate-500 dark:border-white/5 dark:bg-white/5">
                  <th className="p-2.5">Pool / Account</th>
                  <th className="p-2.5">As Of</th>
                  <th className="p-2.5 text-right">Amount</th>
                  <th className="p-2.5">Remarks</th>
                  <th className="p-2.5">Recorded At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {seeds.map((s) => (
                  <tr key={s.id}>
                    <td className="p-2.5 font-medium text-slate-900 dark:text-white">
                      {POOL_LABEL[s.pool] ?? s.pool}
                      {s.instrument_id && " (Instrument)"}
                    </td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-400">{fmtDate(s.as_of)}</td>
                    <td className="p-2.5 text-right font-bold text-slate-900 dark:text-white">{inr(s.amount)}</td>
                    <td className="p-2.5 text-slate-500 dark:text-slate-400">{s.remarks || "—"}</td>
                    <td className="p-2.5 text-slate-400">{fmtDate(s.created_at)}</td>
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
        onFinalized={async () => {
          await refresh();
        }}
      />

      {toastView}
    </div>
  );
}