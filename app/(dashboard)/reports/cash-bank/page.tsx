import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserRole, hasRole } from "@/lib/authz";
import { inr } from "@/lib/format";
import { ChevronRight, Download, Scale, CheckCircle2, AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string; instrument?: string }>;

type Instrument = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  opening_balance: string | number | null;
  current_balance: string | number | null;
};

type CashEntry = {
  id: string;
  entry_date: string;
  method: string;
  direction: string;
  amount: string | number;
  description: string | null;
  instrument_id: string | null;
  payment_instruments?: { name?: string; type?: string } | null;
};

const money = (x: string | number | null | undefined) => Number(x) || 0;
const isIn = (direction: string) => ["in", "credit", "income", "deposit"].includes(String(direction).toLowerCase());

export default async function CashBankReportPage({ searchParams }: { searchParams: SearchParams }) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : today;
  const to = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
  const instrument = params.instrument?.trim() || "";
  const supabase = await createClient();

  const { data: instrumentsData } = await supabase
    .from("payment_instruments")
    .select("id, name, type, is_active, opening_balance, current_balance")
    .order("type")
    .order("name");
  const instruments = (instrumentsData ?? []) as Instrument[];
  const selected = instruments.find((x) => x.id === instrument || x.name === instrument);

  let query = supabase
    .from("cash_entries")
    .select("id, entry_date, method, direction, amount, description, instrument_id, payment_instruments(name, type)")
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date", { ascending: true });
  if (selected) query = query.eq("instrument_id", selected.id);

  let allQuery = supabase.from("cash_entries").select("instrument_id, direction, amount");
  if (selected) allQuery = allQuery.eq("instrument_id", selected.id);

  const [{ data: entries }, { data: allEntries }] = await Promise.all([query, allQuery]);
  const rows = (entries ?? []) as CashEntry[];
  const ledgerRows = (allEntries ?? []) as Pick<CashEntry, "instrument_id" | "direction" | "amount">[];

  const totalIn = rows.filter((x) => isIn(x.direction)).reduce((s, x) => s + money(x.amount), 0);
  const totalOut = rows.filter((x) => !isIn(x.direction)).reduce((s, x) => s + money(x.amount), 0);
  const netMovement = totalIn - totalOut;

  const grouped = new Map<string, { id: string; name: string; type: string; opening: number; recorded: number; ledgerMovement: number; current: number | null }>();
  for (const pi of instruments) {
    if (selected && pi.id !== selected.id) continue;
    const linked = ledgerRows.filter((x) => x.instrument_id === pi.id);
    const ledgerMovement = linked.reduce((s, x) => s + (isIn(x.direction) ? money(x.amount) : -money(x.amount)), 0);
    const opening = money(pi.opening_balance);
    const current = pi.current_balance == null ? null : money(pi.current_balance);
    grouped.set(pi.id, { id: pi.id, name: pi.name, type: pi.type, opening, recorded: opening + ledgerMovement, ledgerMovement, current });
  }
  const balances = [...grouped.values()].map((x) => {
    const difference = x.current == null ? null : x.current - x.recorded;
    return { ...x, difference, status: difference == null ? "UNVERIFIED" : Math.abs(difference) < 0.01 ? "PASS" : "EXCEPTION" };
  });
  const passCount = balances.filter((x) => x.status === "PASS").length;
  const exceptionCount = balances.filter((x) => x.status === "EXCEPTION").length;

  const csv = [
    ["Instrument", "Type", "Opening Balance", "Ledger Movement", "Expected Balance", "Recorded Current Balance", "Difference", "Status"],
    ...balances.map((x) => [x.name, x.type, x.opening.toFixed(2), x.ledgerMovement.toFixed(2), x.recorded.toFixed(2), x.current == null ? "" : x.current.toFixed(2), x.difference == null ? "" : x.difference.toFixed(2), x.status]),
    [],
    ["Date", "Instrument", "Type", "Direction", "Amount", "Description"],
    ...rows.map((x) => [x.entry_date, x.payment_instruments?.name || x.method || "Unmapped", x.payment_instruments?.type || "other", x.direction, money(x.amount).toFixed(2), x.description || ""]),
  ].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
  const exportHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

  return (
    <div className="space-y-6 pb-12" id="cash-bank-report">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Link href="/reports" className="hover:text-blue-600 dark:hover:text-blue-400">
              Reports &amp; Tax Hub
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-bold text-slate-900 dark:text-white">Cash &amp; Bank Reconciliation</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
            Cash &amp; Bank Reconciliation
          </h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
            Instrument-level audit: Opening balance + linked ledger movement = expected balance vs. recorded position.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href={exportHref}
            download={`cash-bank-${from}-to-${to}.csv`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-blue-500"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* Filter Bar */}
      <form className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs md:grid-cols-4 dark:border-white/10 dark:bg-slate-900">
        <div>
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">From Date</label>
          <input
            name="from"
            type="date"
            defaultValue={from}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs dark:border-white/10 dark:bg-slate-950 dark:text-white"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">To Date</label>
          <input
            name="to"
            type="date"
            defaultValue={to}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs dark:border-white/10 dark:bg-slate-950 dark:text-white"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Payment Instrument</label>
          <select
            name="instrument"
            defaultValue={instrument}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs dark:border-white/10 dark:bg-slate-950 dark:text-white"
          >
            <option value="">All instruments &amp; bank accounts</option>
            {instruments.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} &bull; {x.type} {x.is_active ? "" : "(Inactive)"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end md:col-span-4">
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            Apply Filters
          </button>
        </div>
      </form>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Inflows
            </span>
            <span className="rounded-md bg-emerald-50 p-1 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
            {inr(totalIn)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Recorded collections</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Outflows
            </span>
            <span className="rounded-md bg-rose-50 p-1 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-xl font-bold tracking-tight text-rose-600 dark:text-rose-400 tabular-nums">
            {inr(totalOut)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Recorded disbursements</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Net Movement
            </span>
            <span className="rounded-md bg-blue-50 p-1 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <Scale className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
            {inr(netMovement)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Net ledger change</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Reconciled
            </span>
            <span className="rounded-md bg-emerald-50 p-1 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
            {passCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Passing instruments</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Exceptions
            </span>
            <span className="rounded-md bg-amber-50 p-1 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </div>
          <div className={`mt-2 font-mono text-xl font-bold tracking-tight tabular-nums ${exceptionCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-950 dark:text-white"}`}>
            {exceptionCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Variance alerts</div>
        </div>
      </div>

      {/* Audit Banner */}
      <div
        className={`flex items-start gap-3 rounded-2xl border p-4 text-xs sm:text-sm ${
          exceptionCount
            ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200"
            : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200"
        }`}
      >
        {exceptionCount ? <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
        <div>
          <strong>Reconciliation Verdict:</strong>{" "}
          {exceptionCount
            ? `${exceptionCount} instrument(s) show a balance variance between expected movement and recorded current balance.`
            : balances.length
            ? "All active payment instruments with recorded balances reconcile 100% with opening positions and linked ledger entries."
            : "No payment instruments registered for reconciliation."}
        </div>
      </div>

      {/* Instrument Balance Reconciliation Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">Instrument Balance Reconciliation Matrix</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Expected balance = Opening balance + Lifetime ledger movement</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Instrument</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Opening</th>
                <th className="px-4 py-3 text-right font-medium">Ledger Movement</th>
                <th className="px-4 py-3 text-right font-medium">Expected</th>
                <th className="px-4 py-3 text-right font-medium">Recorded Current</th>
                <th className="px-4 py-3 text-right font-medium">Difference</th>
                <th className="px-4 py-3 font-medium">Audit Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {balances.map((x) => (
                <tr key={x.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                  <td className="px-4 py-3 font-medium text-slate-950 dark:text-white">{x.name}</td>
                  <td className="px-4 py-3 text-xs capitalize text-slate-500 dark:text-slate-400">{x.type}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{inr(x.opening)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{inr(x.ledgerMovement)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">{inr(x.recorded)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    {x.current == null ? "—" : inr(x.current)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${
                      x.status === "EXCEPTION" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {x.difference == null ? "—" : inr(x.difference)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        x.status === "PASS"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : x.status === "EXCEPTION"
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}
                    >
                      {x.status}
                    </span>
                  </td>
                </tr>
              ))}
              {balances.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                    No instruments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filtered Entry Ledger Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">Filtered Cash &amp; Bank Entries ({rows.length})</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Date range: {from} to {to}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Instrument / Method</th>
                <th className="px-4 py-3 font-medium">Direction</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {rows.map((x) => (
                <tr key={x.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{x.entry_date}</td>
                  <td className="px-4 py-3 font-medium text-slate-950 dark:text-white">
                    {x.payment_instruments?.name || x.method || "Unmapped"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${
                        isIn(x.direction)
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                      }`}
                    >
                      {x.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">
                    {inr(money(x.amount))}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{x.description || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    No entries found for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
