import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

type RegisterRow = {
  id: string;
  entry_number: string;
  entry_date: string;
  source_type: string;
  source_id: string | null;
  description: string;
  status: string;
  total_debit: number | string;
  total_credit: number | string;
  line_count: number;
};

const money = (value: number | string) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const title = (value: string) => value.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export default async function AccountingTransactionsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounting_transaction_register")
    .select("id, entry_number, entry_date, source_type, source_id, description, status, total_debit, total_credit, line_count")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);

  const rows = (data ?? []) as RegisterRow[];
  const posted = rows.filter((r) => r.status === "posted");
  const totalDebit = posted.reduce((s, r) => s + Number(r.total_debit || 0), 0);
  const totalCredit = posted.reduce((s, r) => s + Number(r.total_credit || 0), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Finance / Accounting</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">Common Transaction Register</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">One canonical register for posted accounting transactions. Every entry carries a source type and source ID so POS, purchases, expenses, services and settlements can be traced into the General Ledger.</p>
          </div>
          <a href="/finance" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200">← Finance Hub</a>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Posted Entries</div><div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{posted.length}</div></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Debits</div><div className="mt-1 text-xl font-black text-slate-900 dark:text-white">{money(totalDebit)}</div></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Credits</div><div className="mt-1 text-xl font-black text-slate-900 dark:text-white">{money(totalCredit)}</div></div>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">Unable to load accounting register: {error.message}</div>}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10"><h2 className="text-lg font-black text-slate-900 dark:text-white">Accounting Transactions</h2><p className="text-xs text-slate-500">Dr = total debit lines · Cr = total credit lines · source identifies the originating module.</p></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.03]"><tr><th className="px-6 py-3">Date</th><th className="px-6 py-3">Entry</th><th className="px-6 py-3">Source</th><th className="px-6 py-3">Description</th><th className="px-6 py-3 text-right">Debit</th><th className="px-6 py-3 text-right">Credit</th><th className="px-6 py-3 text-center">Lines</th><th className="px-6 py-3 text-center">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {rows.map((row) => <tr key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-300">{row.entry_date}</td>
                <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-white">{row.entry_number}</td>
                <td className="px-6 py-4"><span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">{title(row.source_type)}</span>{row.source_id && <div className="mt-1 max-w-[180px] truncate font-mono text-[10px] text-slate-400">{row.source_id}</div>}</td>
                <td className="max-w-[320px] px-6 py-4 text-slate-700 dark:text-slate-300">{row.description}</td>
                <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900 dark:text-white">{money(row.total_debit)}</td>
                <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900 dark:text-white">{money(row.total_credit)}</td>
                <td className="px-6 py-4 text-center font-mono text-xs">{row.line_count}</td>
                <td className="px-6 py-4 text-center"><span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${row.status === "posted" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-amber-50 text-amber-700"}`}>{title(row.status)}</span></td>
              </tr>)}
              {!rows.length && <tr><td colSpan={8} className="px-6 py-16 text-center text-sm text-slate-500">No journalized accounting transactions yet. Existing operational transactions remain intact; posting workflows can now use this canonical register.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
