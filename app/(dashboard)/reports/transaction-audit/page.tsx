import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUserRole, hasRole } from "@/lib/authz";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string; service?: string; status?: string }>;
type Tx = { id: string; transaction_number: string; service_type: string; amount: string | number; status: string; commission?: string | number | null; service_fee?: string | number | null; portal_charge?: string | number | null; portal_commission?: string | number | null; upi_fee?: string | number | null; instrument_id?: string | null; pay_from_instrument_id?: string | null };
type GL = { source_id: string; entry_number: string; account_code: string; account_name: string; account_type: string; debit: string | number; credit: string | number; line_description?: string | null };
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

  let q = supabase.from("transactions").select("id,transaction_number,service_type,amount,status,commission,service_fee,portal_charge,portal_commission,upi_fee,instrument_id,pay_from_instrument_id").gte("transaction_date", from).lte("transaction_date", to).order("transaction_number");
  if (service) q = q.eq("service_type", service);
  if (status) q = q.ilike("status", status);
  const { data: txData } = await q;
  const txs = (txData ?? []) as Tx[];
  const ids = txs.map(x => x.id);
  let gl: GL[] = [];
  if (ids.length) {
    const { data } = await supabase.from("accounting_general_ledger").select("source_id,entry_number,account_code,account_name,account_type,debit,credit,line_description").in("source_id", ids).order("entry_number").order("account_code");
    gl = (data ?? []) as GL[];
  }
  const bySource = new Map<string, GL[]>();
  for (const line of gl) { const a = bySource.get(line.source_id) ?? []; a.push(line); bySource.set(line.source_id, a); }
  const rows = txs.map(tx => {
    const lines = bySource.get(tx.id) ?? [];
    const debit = lines.reduce((s,l) => s + money(l.debit),0);
    const credit = lines.reduce((s,l) => s + money(l.credit),0);
    const income = lines.filter(l => l.account_type === "income").reduce((s,l) => s + money(l.credit) - money(l.debit),0);
    const asset = lines.filter(l => l.account_type === "asset").reduce((s,l) => s + money(l.debit) - money(l.credit),0);
    const flags: string[] = [];
    if (!tx.instrument_id && !tx.pay_from_instrument_id) flags.push("NO_FUNDING");
    if (!lines.length) flags.push("NO_LEDGER");
    if (Math.abs(debit-credit) > .01) flags.push("UNBALANCED");
    if (success(tx.status) && !lines.length) flags.push("SUCCESS_WITHOUT_POSTING");
    const feeTotal = money(tx.commission)+money(tx.service_fee)+money(tx.portal_charge)+money(tx.portal_commission)+money(tx.upi_fee);
    if (feeTotal < 0) flags.push("NEGATIVE_FEE");
    return { tx, lines, debit, credit, income, asset, feeTotal, flags };
  });
  const exceptions = rows.filter(r => r.flags.length);
  const services = [...new Set(txs.map(x => x.service_type).filter(Boolean))].sort();
  const csv = [["Transaction","Service","Status","Amount","Fees","GL Debit","GL Credit","Income Effect","Asset Effect","Flags"],...rows.map(r=>[r.tx.transaction_number,r.tx.service_type,r.tx.status,money(r.tx.amount).toFixed(2),r.feeTotal.toFixed(2),r.debit.toFixed(2),r.credit.toFixed(2),r.income.toFixed(2),r.asset.toFixed(2),r.flags.join(";")])].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Financial control</div><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Financial Transaction Audit</h1><p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Trace each transaction into its accounting entries and automatically flag missing funding, missing posting and imbalance conditions.</p></div><a href={href} download={`transaction-audit-${from}-to-${to}.csv`} className="rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700">Export CSV</a></div>
    <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4 dark:border-white/10 dark:bg-slate-900"><label className="text-sm font-medium">From<input name="from" type="date" defaultValue={from} className="mt-1 block w-full rounded-xl border px-3 py-2 dark:bg-slate-950"/></label><label className="text-sm font-medium">To<input name="to" type="date" defaultValue={to} className="mt-1 block w-full rounded-xl border px-3 py-2 dark:bg-slate-950"/></label><label className="text-sm font-medium">Service<select name="service" defaultValue={service} className="mt-1 block w-full rounded-xl border px-3 py-2 dark:bg-slate-950"><option value="">All services</option>{services.map(s=><option key={s} value={s}>{s}</option>)}</select></label><label className="text-sm font-medium">Status<select name="status" defaultValue={status} className="mt-1 block w-full rounded-xl border px-3 py-2 dark:bg-slate-950"><option value="success">Success</option><option value="">All</option><option value="failed">Failed</option><option value="pending">Pending</option></select></label><div className="md:col-span-4 flex justify-end"><button type="submit" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">Apply audit</button></div></form>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Transactions",rows.length],["Ledger lines",gl.length],["Exceptions",exceptions.length],["Balanced",rows.filter(r=>!r.flags.includes("UNBALANCED")&&r.lines.length).length]].map(([l,v])=><div key={String(l)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{l}</div><div className="mt-2 text-2xl font-bold">{v}</div></div>)}</div>
    <div className={`rounded-2xl border p-4 text-sm ${exceptions.length ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200" : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200"}`}><strong>Audit result:</strong> {exceptions.length ? `${exceptions.length} transaction(s) require review. The report flags structural accounting conditions only; it does not rewrite financial history.` : "No structural exceptions found in the selected transactions."}</div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5"><tr><th className="px-4 py-3">Transaction</th><th className="px-4 py-3">Service</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Fees</th><th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3 text-right">Credit</th><th className="px-4 py-3">Accounts</th><th className="px-4 py-3">Audit</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{rows.map(r=><tr key={r.tx.id}><td className="px-4 py-3 font-semibold">{r.tx.transaction_number}</td><td className="px-4 py-3">{r.tx.service_type}</td><td className="px-4 py-3">{inr(money(r.tx.amount))}</td><td className="px-4 py-3">{inr(r.feeTotal)}</td><td className="px-4 py-3 text-right">{inr(r.debit)}</td><td className="px-4 py-3 text-right">{inr(r.credit)}</td><td className="max-w-xs px-4 py-3 text-xs text-slate-500">{r.lines.map(l=>`${l.account_code} ${l.account_name}`).filter((v,i,a)=>a.indexOf(v)===i).join(" · ") || "No ledger"}</td><td className="px-4 py-3">{r.flags.length?<span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">{r.flags.join(" · ")}</span>:<span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">RECONCILED</span>}</td></tr>)}{!rows.length&&<tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No transactions found.</td></tr>}</tbody></table></div>
  </div>;
}
