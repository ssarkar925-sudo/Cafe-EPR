import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { inr } from "@/lib/format";

export const metadata = {
  title: "Purchases | CyberCafe ERP",
  description: "Purchase control center for supplier bills, payables and inward stock",
};

export default async function PurchasesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchases")
    .select("id, purchase_number, purchase_date, total, paid, due, status, suppliers(name, code)")
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const purchases = (data ?? []) as Array<any>;
  const total = purchases.reduce((s, p) => s + Number(p.total || 0), 0);
  const paid = purchases.reduce((s, p) => s + Number(p.paid || 0), 0);
  const due = purchases.reduce((s, p) => s + Number(p.due || 0), 0);
  const open = purchases.filter((p) => Number(p.due || 0) > 0).length;
  const recent = purchases.slice(0, 8);

  return (
    <div className="min-h-[calc(100vh-9rem)] bg-slate-50/60 px-4 py-5 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-8">
          <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400"><span className="h-1.5 w-1.5 rounded-full bg-current" /> Procurement control</div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">Purchases, under control.</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Track inward stock, supplier liabilities and purchase returns from one focused workspace.</p>
            </div>
            <Link href="/purchases/entry" className="inline-flex w-fit items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900">Record Purchase Bill <span>→</span></Link>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Purchase Value", inr(total), `${purchases.length} bills`],
            ["Paid", inr(paid), "settled with suppliers"],
            ["Payable", inr(due), `${open} bills with balance`],
            ["Open Bills", open.toLocaleString(), "requiring settlement"],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-2 truncate text-2xl font-black text-slate-950 dark:text-white">{value}</p>
              <p className="mt-1 text-xs text-slate-500">{sub}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10"><div><h2 className="font-bold text-slate-900 dark:text-white">Recent purchase bills</h2><p className="text-xs text-slate-400">Latest inward procurement activity</p></div><Link href="/purchases/entry" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Open workspace →</Link></div>
            {recent.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">No purchase bills recorded yet.</div> : <div className="divide-y divide-slate-100 dark:divide-white/5">{recent.map((p) => { const balance = Number(p.due || 0); return <div key={p.id} className="flex items-center gap-4 px-5 py-3.5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">PO</div><div className="min-w-0 flex-1"><p className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-white">{p.purchase_number}</p><p className="truncate text-xs text-slate-400">{p.suppliers?.name || "Unspecified supplier"} · {p.purchase_date}</p></div><div className="text-right"><p className="text-sm font-bold text-slate-900 dark:text-white">{inr(p.total)}</p><p className={`text-[10px] font-semibold ${balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>{balance > 0 ? `${inr(balance)} due` : "Settled"}</p></div></div>; })}</div>}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h2 className="font-bold text-slate-900 dark:text-white">Procurement actions</h2><p className="mt-1 text-xs text-slate-400">Fast operational entry points</p>
            <div className="mt-4 space-y-2">
              {[
                ["/purchases/entry", "New purchase bill", "Post inward stock and supplier payment", "＋"],
                ["/returns", "Purchase returns", "Send goods back to suppliers", "↶"],
                ["/business/suppliers", "Supplier directory", "Review supplier balances and profiles", "♙"],
                ["/inventory/movements", "Stock journal", "Audit every inward movement", "◇"],
              ].map(([href, title, text, icon]) => <Link key={href} href={href} className="group flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-white/5 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700 dark:bg-white/5 dark:text-slate-300">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</span><span className="block truncate text-[11px] text-slate-400">{text}</span></span><span className="text-slate-300 group-hover:text-indigo-500">→</span></Link>)}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
