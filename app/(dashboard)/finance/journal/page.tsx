import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

type JournalEntry = {
  id: string;
  entry_number: string;
  entry_date: string;
  source_type: string;
  source_id: string | null;
  description: string;
  status: string;
  created_at: string;
};

type JournalLine = {
  id: string;
  journal_entry_id: string;
  line_no: number;
  account_id: string;
  debit: number | string;
  credit: number | string;
  description: string | null;
  account?: { code: string; name: string; account_type: string } | null;
};

const money = (value: number | string) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const title = (value: string) => (value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export default async function JournalPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: entries, error: entriesError }, { data: lines, error: linesError }] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("id, entry_number, entry_date, source_type, source_id, description, status, created_at")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("journal_lines")
      .select("id, journal_entry_id, line_no, account_id, debit, credit, description, accounting_accounts(code, name, account_type)")
      .order("journal_entry_id")
      .order("line_no")
      .limit(10000),
  ]);

  const entryRows = (entries ?? []) as JournalEntry[];
  const lineRows = (lines ?? []).map((row: any) => ({
    ...row,
    account: Array.isArray(row.accounting_accounts) ? row.accounting_accounts[0] ?? null : row.accounting_accounts ?? null,
  })) as JournalLine[];
  const byEntry = new Map<string, JournalLine[]>();
  for (const line of lineRows) byEntry.set(line.journal_entry_id, [...(byEntry.get(line.journal_entry_id) ?? []), line]);

  const postedEntries = entryRows.filter((e) => e.status === "posted");
  const totalDebit = lineRows.filter((l) => postedEntries.some((e) => e.id === l.journal_entry_id)).reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lineRows.filter((l) => postedEntries.some((e) => e.id === l.journal_entry_id)).reduce((s, l) => s + Number(l.credit || 0), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">Formal Accounting Book</span>
              <span className="text-xs text-slate-400">· Canonical Double-Entry General Journal</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">Double-Entry Financial Journal</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Every posted business event is shown as its balanced debit and credit lines, with its originating module and source record.</p>
          </div>
          <Link href="/finance/trial-balance" className="btn-3d-tactile-primary flex items-center gap-2 px-5 py-2.5 text-xs font-black shadow-sm">Verify Trial Balance →</Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/30 dark:bg-emerald-950/20"><div className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Posted Entries</div><div className="mt-1 text-2xl font-black text-emerald-900 dark:text-emerald-100">{postedEntries.length}</div></div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-900/30 dark:bg-indigo-950/20"><div className="text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Total Debits</div><div className="mt-1 text-xl font-black text-indigo-900 dark:text-indigo-100">{money(totalDebit)}</div></div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-900/30 dark:bg-violet-950/20"><div className="text-xs font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">Total Credits</div><div className="mt-1 text-xl font-black text-violet-900 dark:text-violet-100">{money(totalCredit)}</div></div>
      </div>

      {(entriesError || linesError) && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">Unable to load the canonical journal: {entriesError?.message || linesError?.message}</div>}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10"><h2 className="text-lg font-black text-slate-900 dark:text-white">Posted Journal Entries</h2><p className="text-xs text-slate-500">Source is immutable journal_entries + journal_lines, not the cash movement register.</p></div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {entryRows.map((entry) => {
            const entryLines = byEntry.get(entry.id) ?? [];
            const debit = entryLines.reduce((s, l) => s + Number(l.debit || 0), 0);
            const credit = entryLines.reduce((s, l) => s + Number(l.credit || 0), 0);
            return (
              <div key={entry.id} className="p-5 sm:p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-black text-slate-900 dark:text-white">{entry.entry_number}</span><span className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">{title(entry.source_type)}</span><span className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wider ${entry.status === "posted" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-amber-50 text-amber-700"}`}>{title(entry.status)}</span></div>
                    <div className="mt-1 text-xs text-slate-500">{entry.entry_date} · {entry.description}{entry.source_id ? ` · Source ${entry.source_id}` : ""}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-right text-xs"><div><div className="text-[10px] font-bold uppercase text-slate-400">Debit</div><div className="font-mono font-black">{money(debit)}</div></div><div><div className="text-[10px] font-bold uppercase text-slate-400">Credit</div><div className="font-mono font-black">{money(credit)}</div></div></div>
                </div>
                <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
                  <table className="min-w-full text-xs"><thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:bg-white/[0.03]"><tr><th className="px-4 py-2 text-left">Line</th><th className="px-4 py-2 text-left">Account</th><th className="px-4 py-2 text-left">Description</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{entryLines.map((line) => <tr key={line.id}><td className="px-4 py-2 font-mono text-slate-400">{line.line_no}</td><td className="px-4 py-2"><div className="font-mono font-bold text-indigo-600">{line.account?.code}</div><div className="font-bold text-slate-900 dark:text-white">{line.account?.name}</div></td><td className="px-4 py-2 text-slate-500">{line.description || entry.description}</td><td className="px-4 py-2 text-right font-mono font-semibold">{Number(line.debit) ? money(line.debit) : "—"}</td><td className="px-4 py-2 text-right font-mono font-semibold">{Number(line.credit) ? money(line.credit) : "—"}</td></tr>)}</tbody></table>
                </div>
              </div>
            );
          })}
          {!entryRows.length && <div className="px-6 py-16 text-center text-sm text-slate-500">No journal entries found.</div>}
        </div>
      </section>
    </div>
  );
}
