"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import StatCard from "@/components/ui/stat-card";
import CompactToggle from "@/components/ui/compact-toggle";
import { useToast } from "@/components/ui/use-toast";

type PoolBal = {
  opening: number;
  seed_date: string;
  movements: number;
  current: number;
};

export type PoolBalances = {
  cash: PoolBal;
  bank: PoolBal;
  wallet: PoolBal;
  dmt: PoolBal;
  aeps: PoolBal;
  upi_qr: PoolBal;
  credit_card: PoolBal;
  total: number;
};

export type InstrumentRow = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
};

export type SeedRow = {
  id: string;
  pool: string;
  instrument_id: string | null;
  amount: number | string;
  as_of: string;
  remarks: string | null;
  created_at: string;
};

const POOLS: { key: keyof PoolBalances; label: string; icon: string; grad: string; hint: string }[] = [
  { key: "cash", label: "Cash in Hand", icon: "M2 8h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Zm10-3V5H4a2 2 0 0 0-2 2M14 13h.01", grad: "from-indigo-500 to-violet-600", hint: "Physical cash at the counter" },
  { key: "bank", label: "Bank Balance", icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01", grad: "from-blue-500 to-indigo-600", hint: "All bank accounts combined" },
  { key: "credit_card", label: "Credit Card Limit", icon: "M2 8h20v11H2zM2 12h20M6 16h4M7 3l3 5h4l3-5", grad: "from-cyan-500 to-sky-600", hint: "Available credit limit" },
  { key: "wallet", label: "Wallet Balance", icon: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 10h18M16 15h2", grad: "from-emerald-500 to-teal-600", hint: "Digital wallet float" },
  { key: "dmt", label: "DMT Float", icon: "M22 2 11 13M22 2 15 22l-4-9-9-4z", grad: "from-violet-500 to-purple-600", hint: "Remittance float with provider" },
  { key: "aeps", label: "AEPS Float", icon: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7M2 7l10-5 10 5z", grad: "from-amber-500 to-orange-600", hint: "AEPS float with provider" },
  { key: "upi_qr", label: "UPI QR", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1M14 20h1M20 20h1", grad: "from-rose-500 to-pink-600", hint: "Shop UPI QR receipts" },
];

const INST_POOL: Record<string, string> = {
  cash: "cash",
  bank: "bank",
  debit_card: "bank",
  credit_card: "credit_card",
  upi: "upi_qr",
  wallet: "wallet",
};

const POOL_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  wallet: "Wallet",
  dmt: "DMT Float",
  aeps: "AEPS Float",
  upi_qr: "UPI QR",
  credit_card: "Credit Card",
};

const TYPE_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank Account",
  debit_card: "Debit Card",
  credit_card: "Credit Card",
  upi: "UPI ID",
  wallet: "Wallet",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200";

function fmtDate(d: string) {
  if (!d || d === "0001-01-01") return "-";
  const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function OpeningBalancesClient({
  initialBalances,
  initialInstruments,
  initialSeeds,
}: {
  initialBalances: PoolBalances | null;
  initialInstruments: InstrumentRow[];
  initialSeeds: SeedRow[];
}) {
  const [balances, setBalances] = useState<PoolBalances | null>(initialBalances);
  const [seeds, setSeeds] = useState<SeedRow[]>(initialSeeds);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>(() => {
    const today = new Date().toISOString().slice(0, 10);
    return Object.fromEntries(POOLS.map((p) => [p.key, today]));
  });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const { showToast, toastView } = useToast();

  const instrumentSeeds = useMemo(() => {
    const map = new Map<string, SeedRow>();
    for (const s of seeds) {
      if (s.instrument_id) map.set(s.instrument_id, s);
    }
    return map;
  }, [seeds]);

  const poolSeeds = useMemo(() => {
    const map = new Map<string, SeedRow>();
    for (const s of seeds) {
      if (!s.instrument_id) map.set(s.pool, s);
    }
    return map;
  }, [seeds]);

  const currentFor = (pool: string) =>
    (balances as any)?.[pool]?.current ?? 0;
  const openingFor = (pool: string) =>
    (balances as any)?.[pool]?.opening ?? 0;
  const movementsFor = (pool: string) =>
    (balances as any)?.[pool]?.movements ?? 0;

  async function refresh() {
    const supabase = createClient();
    const [b, s] = await Promise.all([
      supabase.rpc("get_pool_balances"),
      supabase
        .from("opening_balances")
        .select("id, pool, instrument_id, amount, as_of, remarks, created_at")
        .order("as_of", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    if (b.data) setBalances(b.data as PoolBalances);
    if (s.data) setSeeds(s.data as SeedRow[]);
  }

  async function saveSeed(pool: string, instrumentId: string | null, label: string) {
    const draftKey = instrumentId ? `inst-${instrumentId}` : pool;
    const amount = Number(drafts[draftKey] ?? "");
    if (Number.isNaN(amount) || amount < 0) {
      showToast("error", "Enter a valid opening amount.");
      return;
    }
    const busyId = instrumentId ? `inst-${instrumentId}` : pool;
    setBusyKey(busyId);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_opening_balance", {
      p_pool: pool,
      p_amount: amount,
      p_as_of: dates[pool] ?? new Date().toISOString().slice(0, 10),
      p_instrument_id: instrumentId,
      p_remarks: instrumentId ? `${label} opening balance` : null,
    });
    setBusyKey(null);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setDrafts((d) => ({ ...d, [draftKey]: "" }));
    showToast("success", `${label} opening balance saved.`);
    await refresh();
  }

  const totalSeeded = POOLS.filter((p) => p.key !== "credit_card").reduce((s, p) => s + openingFor(p.key), 0);
  const totalCurrent = balances?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Opening Balances</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Set what each account actually holds today. Movements after the seed date are added automatically.
          </p>
        </div>
        <CompactToggle value={compact} onChange={setCompact} storageKey="opening-compact" />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Opening (seeded)"
          value={inr(totalSeeded)}
          icon="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
          grad="from-slate-500 to-slate-700"
          sub="Sum of opening seeds"
          href="/finance/day-close"
        />
        <StatCard
          label="Current Position"
          value={inr(totalCurrent)}
          icon="M18 20V10M12 20V4M6 20v-6"
          grad="from-blue-600 to-indigo-600"
          sub="Opening + movements"
          href="/finance/settlements"
        />
      </div>

      <div className={`grid gap-4 ${compact ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-3"}`}>
        {POOLS.map((p) => {
          const seed = poolSeeds.get(p.key);
          return (
            <div
              key={p.key}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${p.grad} text-white`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                      <path d={p.icon} />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{p.label}</p>
                    <p className="text-xs text-slate-400">{p.hint}</p>
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-white/5 dark:text-slate-400">
                  {fmtDate((balances as any)?.[p.key]?.seed_date)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-slate-50 p-2 text-center dark:bg-white/5">
                  <p className="text-[11px] text-slate-400">Opening</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{inr(openingFor(p.key))}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2 text-center dark:bg-white/5">
                  <p className="text-[11px] text-slate-400">Movements</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{inr(movementsFor(p.key))}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 text-center dark:bg-blue-500/10">
                  <p className="text-[11px] text-blue-400">Current</p>
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-300">{inr(currentFor(p.key))}</p>
                </div>
              </div>

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
              {seed && (
                <p className="mt-2 text-[11px] text-slate-400">
                  Last seed: {inr(seed.amount)} on {fmtDate(seed.as_of)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Per-Account Opening (bank / card / UPI / wallet)</h3>
        <p className="mt-0.5 text-xs text-slate-400">
          Add or update individual accounts. Each account&apos;s opening adds to its pool&apos;s opening balance.
        </p>
        {initialInstruments.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No payment instruments yet. Add bank accounts / credit cards in Settings.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {initialInstruments.map((inst) => {
              const pool = INST_POOL[inst.type];
              if (!pool) return null;
              const seed = instrumentSeeds.get(inst.id);
              return (
                <div key={inst.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
                  <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${inst.is_active ? "bg-emerald-500" : "bg-slate-300"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{inst.name}</p>
                    <p className="text-xs text-slate-400">
                      {TYPE_LABEL[inst.type] ?? inst.type} · {POOL_LABEL[pool] ?? pool}
                      {seed ? ` · seeded ${inr(seed.amount)}` : " · not seeded"}
                    </p>
                  </div>
                  <div className="flex w-28 items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amt"
                      value={drafts[`inst-${inst.id}`] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [`inst-${inst.id}`]: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                    />
                    <button
                      onClick={() => saveSeed(pool, inst.id, inst.name)}
                      disabled={busyKey === `inst-${inst.id}`}
                      className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                    >
                      {busyKey === `inst-${inst.id}` ? "..." : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Seed History</h3>
        {seeds.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No opening balances set yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase text-slate-400 dark:border-white/10">
                  <th className="py-2 pr-3">Pool</th>
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2 pr-3">As of</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {seeds.map((s) => {
                  const inst = initialInstruments.find((i) => i.id === s.instrument_id);
                  return (
                    <tr key={s.id} className="border-b border-slate-50 last:border-0 dark:border-white/5">
                      <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200">{POOL_LABEL[s.pool] ?? s.pool}</td>
                      <td className="py-2 pr-3 text-slate-500">{inst?.name ?? "Pool base"}</td>
                      <td className="py-2 pr-3 text-slate-500">{fmtDate(s.as_of)}</td>
                      <td className="py-2 pr-3 font-semibold text-slate-800 dark:text-white">{inr(s.amount)}</td>
                      <td className="py-2 text-slate-400">{s.remarks ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toastView}
    </div>
  );
}