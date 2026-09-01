import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUserRole, hasRole } from "@/lib/authz";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string; instrument?: string }>;

type Instrument = { id: string; name: string; type: string; is_active: boolean; opening_balance: string | number | null; current_balance: string | number | null };
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
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Financial control</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Cash &amp; Bank Reconciliation</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Instrument-ID based reconciliation: opening balance + all linked ledger movement = expected balance, compared with the recorded current balance.</p>
        </div>
        <a href={exportHref} download={`cash-bank-${from}-to-${to}.csv`} className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">Export CSV</a>
      </div>

      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4 dark:border-white/10 dark:bg-slate-900">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">From<input name="from" type="date" defaultValue={from} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">To<input name="to" type="date" defaultValue={to} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">Instrument<select name="instrument" defaultValue={instrument} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white"><option value="">All instruments</option>{instruments.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.type}{x.is_active ? "" : " · inactive"}</option>)}</select></label>
        <div className="md:col-span-4 flex justify-end"><button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950" type="submit">Apply filters</button></div>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[["Recorded Inflows", totalIn], ["Recorded Outflows", totalOut], ["Net Movement", netMovement], ["PASS", passCount], ["EXCEPTIONS", exceptionCount]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{["PASS", "EXCEPTIONS"].includes(String(label)) ? value : inr(Number(value))}</div>
          </div>
        ))}
      </div>

      <div className={`rounded-2xl border p-4 text-sm ${exceptionCount ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200" : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200"}`}>
        <strong>Reconciliation:</strong> {exceptionCount ? `${exceptionCount} instrument(s) have a balance difference.` : balances.length ? "All instruments with a recorded current balance reconcile to their opening balance plus linked ledger movement." : "No instruments available for reconciliation."}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h2 className="font-semibold text-slate-950 dark:text-white">Balance reconciliation</h2></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5"><tr><th className="px-5 py-3">Instrument</th><th className="px-5 py-3">Type</th><th className="px-5 py-3 text-right">Opening</th><th className="px-5 py-3 text-right">Ledger movement</th><th className="px-5 py-3 text-right">Expected</th><th className="px-5 py-3 text-right">Recorded</th><th className="px-5 py-3 text-right">Difference</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{balances.map((x) => <tr key={x.id}><td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{x.name}</td><td className="px-5 py-3 text-slate-500 dark:text-slate-400">{x.type}</td><td className="px-5 py-3 text-right">{inr(x.opening)}</td><td className="px-5 py-3 text-right">{inr(x.ledgerMovement)}</td><td className="px-5 py-3 text-right">{inr(x.recorded)}</td><td className="px-5 py-3 text-right">{x.current == null ? "—" : inr(x.current)}</td><td className={`px-5 py-3 text-right font-semibold ${x.status === "EXCEPTION" ? "text-red-600" : "text-emerald-600"}`}>{x.difference == null ? "—" : inr(x.difference)}</td><td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${x.status === "PASS" ? "bg-emerald-100 text-emerald-700" : x.status === "EXCEPTION" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{x.status}</span></td></tr>)}{balances.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500">No instruments found.</td></tr>}</tbody></table></div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h2 className="font-semibold text-slate-950 dark:text-white">Filtered entry ledger</h2></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Instrument</th><th className="px-5 py-3">Direction</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3">Description</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{rows.map((x) => <tr key={x.id}><td className="px-5 py-3 text-slate-600 dark:text-slate-400">{x.entry_date}</td><td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{x.payment_instruments?.name || x.method || "Unmapped"}</td><td className="px-5 py-3 capitalize">{x.direction}</td><td className="px-5 py-3 text-right font-semibold">{inr(money(x.amount))}</td><td className="px-5 py-3 text-slate-500 dark:text-slate-400">{x.description || "—"}</td></tr>)}{rows.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No entries found for the selected period.</td></tr>}</tbody></table></div>
      </div>
    </div>
  );
}
