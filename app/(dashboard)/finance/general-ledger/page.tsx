import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

type LedgerRow = {
  line_id: string;
  journal_entry_id: string;
  entry_number: string;
  entry_date: string;
  source_type: string;
  source_id: string | null;
  entry_description: string;
  status: string;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  line_no: number;
  debit: number | string;
  credit: number | string;
  line_description: string | null;
};

const money = (value: number | string) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const title = (value: string) => value.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export default async function GeneralLedgerPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounting_general_ledger")
    .select("line_id, journal_entry_id, entry_number, entry_date, source_type, source_id, entry_description, status, account_id, account_code, account_name, account_type, line_no, debit, credit, line_description")
    .eq("status", "posted")
    .order("entry_date", { ascending: true })
    .order("entry_number", { ascending: true })
    .order("line_no", { ascending: true })
    .limit(5000);

  const rows = (data ?? []) as LedgerRow[];
  const accounts = Array.from(new Map(rows.map((r) => [r.account_id, { id: r.account_id, code: r.account_code, name: r.account_name, type: r.account_type }])).values()).sort((a, b) => a.code.localeCompare(b.code));
  const totalDebit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);

  const running = new Map<string, number>();
  const withBalances = rows.map((row) => {
    const previous = running.get(row.account_id) ?? 0;
    const balance = previous + Number(row.debit || 0) - Number(row.credit || 0);
    running.set(row.account_id, balance);
    return { row, balance };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Finance / Accounting</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">General Ledger</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">True account-wise double-entry ledger. Customer Ledger remains a subsidiary ledger; this view is the canonical financial book behind Trial Balance and financial statements.</p>
          </div>
          <a href="/finance" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200">← Finance Hub</a>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Accounts Used</div><div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{accounts.length}</div></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Debits</div><div className="mt-1 text-xl font-black text-slate-900 dark:text-white">{money(totalDebit)}</div></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Credits</div><div className="mt-1 text-xl font-black text-slate-900 dark:text-white">{money(totalCredit)}</div></div>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">Unable to load General Ledger: {error.message}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10"><h2 className="text-lg font-black text-slate-900 dark:text-white">Account-wise Posting</h2><p className="text-xs text-slate-500">Running balance = prior balance + debit − credit. Account balances are calculated independently.</p></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.03]"><tr><th className="px-6 py-3">Date</th><th className="px-6 py-3">Account</th><th className="px-6 py-3">Entry</th><th className="px-6 py-3">Source</th><th className="px-6 py-3">Description</th><th className="px-6 py-3 text-right">Debit</th><th className="px-6 py-3 text-right">Credit</th><th className="px-6 py-3 text-right">Running Balance</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {withBalances.map(({ row, balance }) => <tr key={row.line_id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-300">{row.entry_date}</td>
                <td className="px-6 py-4"><div className="font-mono text-xs font-bold text-indigo-600">{row.account_code}</div><div className="font-bold text-slate-900 dark:text-white">{row.account_name}</div><div className="text-[10px] uppercase text-slate-400">{title(row.account_type)}</div></td>
                <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-white">{row.entry_number}</td>
                <td className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-300">{title(row.source_type)}</td>
                <td className="max-w-[300px] px-6 py-4 text-slate-600 dark:text-slate-300">{row.line_description || row.entry_description}</td>
                <td className="px-6 py-4 text-right font-mono font-semibold">{Number(row.debit) ? money(row.debit) : "—"}</td>
                <td className="px-6 py-4 text-right font-mono font-semibold">{Number(row.credit) ? money(row.credit) : "—"}</td>
                <td className="px-6 py-4 text-right font-mono font-black text-slate-900 dark:text-white">{money(balance)}</td>
              </tr>)}
              {!rows.length && <tr><td colSpan={8} className="px-6 py-16 text-center text-sm text-slate-500">No posted double-entry lines yet. The accounting foundation is ready for source modules to post balanced journal entries.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
