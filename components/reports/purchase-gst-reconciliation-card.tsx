import { inr } from "@/lib/format";
import { CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";

export default function PurchaseGstReconciliationCard({ data }: { data: any }) {
  if (!data) return null;
  const ok = data.status === "ok";
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-black text-slate-950 dark:text-white">Purchase Input GST Reconciliation</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Purchase input tax less purchase-return GST reversals for the selected period.</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}>
          {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {ok ? "Reconciled" : "Mismatch"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Purchase Input GST" value={data.purchase_input_gst} />
        <Metric label="Return GST Reversal" value={data.purchase_return_gst_reversal} />
        <Metric label="Net Input GST" value={data.net_input_gst} />
        <Metric label="Journal Variance" value={data.variance} />
      </div>
      <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
        {data.purchase_count ?? 0} purchase(s) · {data.purchase_return_count ?? 0} purchase-return document(s) · Tax journal: {inr(data.purchase_return_tax_journal ?? 0)}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/5">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-lg font-black tabular-nums text-slate-950 dark:text-white">{inr(value ?? 0)}</p>
    </div>
  );
}
