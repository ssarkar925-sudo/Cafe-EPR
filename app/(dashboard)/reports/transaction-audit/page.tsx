import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserRole, hasRole } from "@/lib/authz";
import { inr } from "@/lib/format";
import {
  ChevronRight,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Database,
  FileCheck2,
} from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string; service?: string; status?: string }>;
type Tx = {
  id: string;
  transaction_number: string;
  service_type: string;
  amount: string | number;
  status: string;
  commission?: string | number | null;
  service_fee?: string | number | null;
  portal_charge?: string | number | null;
  portal_commission?: string | number | null;
  upi_fee?: string | number | null;
  instrument_id?: string | null;
  pay_from_instrument_id?: string | null;
};
type GL = {
  source_id: string;
  entry_number: string;
  account_code: string;
  account_name: string;
  account_type: string;
  debit: string | number;
  credit: string | number;
  line_description?: string | null;
};
const money = (v: string | number | null | undefined) => Number(v) || 0;
const success = (s: string) => ["success", "successful", "completed", "successfully"].includes(String(s).toLowerCase());

export default async function TransactionAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");
  const p = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = p.from && /^\d{4}-\d{2}-\d{2}$/.test(p.from) ? p.from : today;
  const to = p.to && /^\d{4}-\d{2}-\d{2}$/.test(p.to) ? p.to : today;
  const service = p.service || "";
  const status = p.status || "success";
  const supabase = await createClient();

  let q = supabase
    .from("transactions")
    .select("id,transaction_number,service_type,amount,status,commission,service_fee,portal_charge,portal_commission,upi_fee,instrument_id,pay_from_instrument_id")
    .gte("transaction_date", from)
    .lte("transaction_date", to)
    .order("transaction_number");
  if (service) q = q.eq("service_type", service);
  if (status) q = q.ilike("status", status);
  const { data: txData } = await q;
  const txs = (txData ?? []) as Tx[];
  const ids = txs.map((x) => x.id);
  let gl: GL[] = [];
  if (ids.length) {
    const { data } = await supabase
      .from("accounting_general_ledger")
      .select("source_id,entry_number,account_code,account_name,account_type,debit,credit,line_description")
      .in("source_id", ids)
      .order("entry_number")
      .order("account_code");
    gl = (data ?? []) as GL[];
  }
  const bySource = new Map<string, GL[]>();
  for (const line of gl) {
    const a = bySource.get(line.source_id) ?? [];
    a.push(line);
    bySource.set(line.source_id, a);
  }
  const rows = txs.map((tx) => {
    const lines = bySource.get(tx.id) ?? [];
    const debit = lines.reduce((s, l) => s + money(l.debit), 0);
    const credit = lines.reduce((s, l) => s + money(l.credit), 0);
    const income = lines.filter((l) => l.account_type === "income").reduce((s, l) => s + money(l.credit) - money(l.debit), 0);
    const asset = lines.filter((l) => l.account_type === "asset").reduce((s, l) => s + money(l.debit) - money(l.credit), 0);
    const flags: string[] = [];
    if (!tx.instrument_id && !tx.pay_from_instrument_id) flags.push("NO_FUNDING");
    if (!lines.length) flags.push("NO_LEDGER");
    if (Math.abs(debit - credit) > 0.01) flags.push("UNBALANCED");
    if (success(tx.status) && !lines.length) flags.push("SUCCESS_WITHOUT_POSTING");
    const feeTotal = money(tx.commission) + money(tx.service_fee) + money(tx.portal_charge) + money(tx.portal_commission) + money(tx.upi_fee);
    if (feeTotal < 0) flags.push("NEGATIVE_FEE");
    return { tx, lines, debit, credit, income, asset, feeTotal, flags };
  });
  const exceptions = rows.filter((r) => r.flags.length);
  const balancedCount = rows.filter((r) => !r.flags.includes("UNBALANCED") && r.lines.length).length;
  const services = [...new Set(txs.map((x) => x.service_type).filter(Boolean))].sort();

  const csv = [
    ["Transaction", "Service", "Status", "Amount", "Fees", "GL Debit", "GL Credit", "Income Effect", "Asset Effect", "Flags"],
    ...rows.map((r) => [
      r.tx.transaction_number,
      r.tx.service_type,
      r.tx.status,
      money(r.tx.amount).toFixed(2),
      r.feeTotal.toFixed(2),
      r.debit.toFixed(2),
      r.credit.toFixed(2),
      r.income.toFixed(2),
      r.asset.toFixed(2),
      r.flags.join(";"),
    ]),
  ]
    .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

  return (
    <div className="space-y-6 pb-12" id="transaction-audit-report">
      {/* Top Breadcrumbs & Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Link href="/reports" className="hover:text-blue-600 dark:hover:text-blue-400">
              Reports &amp; Tax Hub
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-bold text-slate-900 dark:text-white">Financial Transaction GL Audit</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
            Financial Transaction Audit
          </h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
            Trace every operational transaction directly into general ledger double-entry postings to verify balancing and integrity.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href={href}
            download={`transaction-audit-${from}-to-${to}.csv`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-blue-500"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* Filter Form */}
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
        <div>
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Service</label>
          <select
            name="service"
            defaultValue={service}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs dark:border-white/10 dark:bg-slate-950 dark:text-white"
          >
            <option value="">All services</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Status</label>
          <select
            name="status"
            defaultValue={status}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs dark:border-white/10 dark:bg-slate-950 dark:text-white"
          >
            <option value="success">Success</option>
            <option value="">All</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div className="flex justify-end md:col-span-4">
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            Apply Audit Filters
          </button>
        </div>
      </form>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Transactions Audited
            </span>
            <span className="rounded-md bg-blue-50 p-1 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <Database className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
            {rows.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Selected operational vouchers</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              General Ledger Lines
            </span>
            <span className="rounded-md bg-indigo-50 p-1 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Scale className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
            {gl.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Double-entry debits &amp; credits</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Balanced &amp; Posted
            </span>
            <span className="rounded-md bg-emerald-50 p-1 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
            {balancedCount}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Debit = Credit verified</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Exceptions Found
            </span>
            <span className="rounded-md bg-amber-50 p-1 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </div>
          <div
            className={`mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums ${
              exceptions.length > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-950 dark:text-white"
            }`}
          >
            {exceptions.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Requiring review</div>
        </div>
      </div>

      {/* Audit Result Status Box */}
      <div
        className={`flex items-start gap-3 rounded-2xl border p-4 text-xs sm:text-sm ${
          exceptions.length
            ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
            : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200"
        }`}
      >
        {exceptions.length ? <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
        <div>
          <strong>Audit Result:</strong>{" "}
          {exceptions.length
            ? `${exceptions.length} transaction(s) require review. The audit flags missing funding instrument links, unposted vouchers, or imbalance conditions.`
            : "No structural GL exceptions found in the selected transactions. All transactions posted and balanced."}
        </div>
      </div>

      {/* Audit Register Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">Transaction General Ledger Audit Trail</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Complete verification matrix of amounts, fees, debits, credits, and linked accounts</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Transaction #</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-right font-medium">Fees</th>
                <th className="px-4 py-3 text-right font-medium">GL Debit</th>
                <th className="px-4 py-3 text-right font-medium">GL Credit</th>
                <th className="px-4 py-3 font-medium">Linked Accounts</th>
                <th className="px-4 py-3 font-medium">Audit Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {rows.map((r) => (
                <tr key={r.tx.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white">
                    {r.tx.transaction_number}
                  </td>
                  <td className="px-4 py-3 uppercase text-xs text-slate-600 dark:text-slate-400">{r.tx.service_type}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-950 dark:text-white tabular-nums">
                    {inr(money(r.tx.amount))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    {inr(r.feeTotal)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-medium text-slate-900 dark:text-white tabular-nums">
                    {inr(r.debit)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-medium text-slate-900 dark:text-white tabular-nums">
                    {inr(r.credit)}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-slate-500 dark:text-slate-400 truncate">
                    {r.lines.map((l) => `${l.account_code} ${l.account_name}`).filter((v, i, a) => a.indexOf(v) === i).join(" · ") || "No ledger"}
                  </td>
                  <td className="px-4 py-3">
                    {r.flags.length ? (
                      <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                        {r.flags.join(" · ")}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        RECONCILED
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No transactions found for the selected period.
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
