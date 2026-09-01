import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUserRole, hasRole } from "@/lib/authz";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string; instrument?: string }>;

type CashEntry = {
  id: string;
  entry_date: string;
  method: string;
  direction: string;
  amount: string | number;
  description: string | null;
  payment_instruments?: { name?: string; type?: string } | null;
};

export default async function CashBankReportPage({ searchParams }: { searchParams: SearchParams }) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : today;
  const to = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
  const instrument = params.instrument?.trim() || "";
  const supabase = await createClient();

  let query = supabase
    .from("cash_entries")
    .select("id, entry_date, method, direction, amount, description, payment_instruments(name, type)")
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date", { ascending: true });

  if (instrument) query = query.eq("method", instrument);
  const [{ data: entries }, { data: instruments }] = await Promise.all([
    query,
    supabase.from("payment_instruments").select("id, name, type, is_active").order("type").order("name"),
  ]);

  const rows = (entries ?? []) as CashEntry[];
  const money = (x: string | number) => Number(x) || 0;
  const isIn = (direction: string) => ["in", "credit", "income", "deposit"].includes(String(direction).toLowerCase());
  const totalIn = rows.filter((x) => isIn(x.direction)).reduce((s, x) => s + money(x.amount), 0);
  const totalOut = rows.filter((x) => !isIn(x.direction)).reduce((s, x) => s + money(x.amount), 0);
  const netMovement = totalIn - totalOut;

  const grouped = new Map<string, { name: string; type: string; in: number; out: number }>();
  for (const row of rows) {
    const name = row.payment_instruments?.name || row.method || "Unmapped";
    const type = row.payment_instruments?.type || "other";
    const key = `${name}|${type}`;
    const current = grouped.get(key) ?? { name, type, in: 0, out: 0 };
    if (isIn(row.direction)) current.in += money(row.amount);
    else current.out += money(row.amount);
    grouped.set(key, current);
  }
  const balances = [...grouped.values()].map((x) => ({ ...x, movement: x.in - x.out }));

  const csv = [
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
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Movement-based reconciliation of recorded cash and payment-instrument entries. No opening balance or bank statement balance is invented.</p>
        </div>
        <a href={exportHref} download={`cash-bank-${from}-to-${to}.csv`} className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">Export CSV</a>
      </div>

      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4 dark:border-white/10 dark:bg-slate-900">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">From<input name="from" type="date" defaultValue={from} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">To<input name="to" type="date" defaultValue={to} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">Instrument<select name="instrument" defaultValue={instrument} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white"><option value="">All instruments</option>{(instruments ?? []).map((x: any) => <option key={x.id} value={x.name}>{x.name} · {x.type}{x.is_active ? "" : " · inactive"}</option>)}</select></label>
        <div className="md:col-span-4 flex justify-end"><button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950" type="submit">Apply filters</button></div>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Recorded Inflows", totalIn], ["Recorded Outflows", totalOut], ["Net Movement", netMovement], ["Entries", rows.length]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{label === "Entries" ? value : inr(Number(value))}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
        <strong>Reconciliation status:</strong> Movement-only. A true closing-balance difference requires an independently verified opening balance and/or bank/provider statement balance; this report deliberately does not fabricate either value.
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h2 className="font-semibold text-slate-950 dark:text-white">Instrument movement</h2></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5"><tr><th className="px-5 py-3">Instrument</th><th className="px-5 py-3">Type</th><th className="px-5 py-3 text-right">In</th><th className="px-5 py-3 text-right">Out</th><th className="px-5 py-3 text-right">Net movement</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{balances.map((x) => <tr key={`${x.name}|${x.type}`}><td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{x.name}</td><td className="px-5 py-3 text-slate-500 dark:text-slate-400">{x.type}</td><td className="px-5 py-3 text-right">{inr(x.in)}</td><td className="px-5 py-3 text-right">{inr(x.out)}</td><td className="px-5 py-3 text-right font-semibold">{inr(x.movement)}</td></tr>)}{balances.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No cash entries found for the selected period.</td></tr>}</tbody></table></div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h2 className="font-semibold text-slate-950 dark:text-white">Entry ledger</h2></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Instrument</th><th className="px-5 py-3">Direction</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3">Description</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{rows.map((x) => <tr key={x.id}><td className="px-5 py-3 text-slate-600 dark:text-slate-400">{x.entry_date}</td><td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{x.payment_instruments?.name || x.method || "Unmapped"}</td><td className="px-5 py-3 capitalize">{x.direction}</td><td className="px-5 py-3 text-right font-semibold">{inr(money(x.amount))}</td><td className="px-5 py-3 text-slate-500 dark:text-slate-400">{x.description || "—"}</td></tr>)}{rows.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No entries found.</td></tr>}</tbody></table></div>
      </div>
    </div>
  );
}
