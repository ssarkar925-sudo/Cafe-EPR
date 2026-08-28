import Link from "next/link";
import { inr } from "@/lib/format";

export default function DashboardOpsStrip({ todayRevenue, todayProfit, receivables, lowStock, auditScore }: { todayRevenue:number; todayProfit:number; receivables:number; lowStock:number; auditScore:number }) {
 const items = [
  ["Today revenue", inr(todayRevenue), "text-slate-950 dark:text-white", "/reports"],
  ["Today profit", inr(todayProfit), todayProfit >= 0 ? "text-emerald-600" : "text-rose-600", "/reports"],
  ["Receivables", inr(receivables), "text-amber-600", "/customers"],
  ["Low stock", String(lowStock), lowStock ? "text-amber-600" : "text-emerald-600", "/catalog/products"],
  ["Audit score", auditScore ? `${auditScore}%` : "Not run", auditScore >= 80 ? "text-emerald-600" : auditScore ? "text-amber-600" : "text-slate-500", "/ai/self-audit"],
 ];
 return <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-5">{items.map(([label,value,cls,href])=><Link key={label} href={href} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 text-lg font-bold ${cls}`}>{value}</div></Link>)}</div>;
}
