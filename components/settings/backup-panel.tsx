"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import SettingsSection from "@/components/settings/settings-section";

const EXPORTS = [
  { key: "customers", label: "Customers", hint: "Directory, balances & types" },
  { key: "invoices", label: "Invoices", hint: "Every bill with payments" },
  { key: "ledger", label: "Customer Ledger", hint: "All ledger entries" },
] as const;

export default function BackupPanel({ active }: { active: boolean }) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const [exporting, setExporting] = useState<string | null>(null);

  async function exportCsv(kind: "customers" | "invoices" | "ledger") {
    setExporting(kind);
    let rows: any[] = [];
    let headers: string[] = [];
    let map: (r: any) => (string | number)[] = () => [];
    try {
      if (kind === "customers") {
        const { data, error } = await supabase
          .from("customers")
          .select("code, name, phone, email, address, opening_balance, balance, customer_type, is_active, created_at")
          .order("created_at");
        if (error) throw new Error(error.message);
        headers = ["Code", "Name", "Phone", "Email", "Address", "Opening Balance", "Balance", "Type", "Active", "Created At"];
        rows = (data ?? []) as any[];
        map = (r) => [r.code, r.name, r.phone, r.email, r.address, r.opening_balance, r.balance, r.customer_type, r.is_active, r.created_at];
      } else if (kind === "invoices") {
        const { data, error } = await supabase
          .from("invoices")
          .select("invoice_number, invoice_date, customers(name), subtotal, discount, total, paid, due, status")
          .order("created_at");
        if (error) throw new Error(error.message);
        headers = ["Invoice", "Date", "Customer", "Subtotal", "Discount", "Total", "Paid", "Due", "Status"];
        rows = (data ?? []) as any[];
        map = (r) => [r.invoice_number, r.invoice_date, r.customers?.name ?? "", r.subtotal, r.discount, r.total, r.paid, r.due, r.status];
      } else {
        const { data, error } = await supabase
          .from("customer_ledger")
          .select("entry_date, customers(name), type, description, debit, credit, balance_after")
          .order("created_at");
        if (error) throw new Error(error.message);
        headers = ["Date", "Customer", "Type", "Description", "Debit", "Credit", "Balance After"];
        rows = (data ?? []) as any[];
        map = (r) => [r.entry_date, r.customers?.name ?? "", r.type, r.description, r.debit, r.credit, r.balance_after];
      }
    } catch (e: any) {
      setExporting(null);
      showToast("error", e.message || "Export failed.");
      return;
    }

    const csv = (v: any) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [headers.join(","), ...rows.map((r) => map(r).map(csv).join(","))];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExporting(null);
    showToast("success", `${kind} exported.`);
    logAudit({
      action: "export",
      entity: "report",
      entity_id: null,
      description: `Exported ${kind} CSV from Settings → Backup & Data`,
    });
  }

  return (
    <div className={active ? "mt-6" : "hidden"}>
      <SettingsSection
        icon="M21 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v13"
        tone="slate"
        title="Backup & Data"
        desc="Download a CSV snapshot of your data. Full backups live in your Supabase project."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {EXPORTS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => exportCsv(b.key)}
              disabled={exporting === b.key}
              className="flex flex-col items-start gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-slate-900">{exporting === b.key ? "Exporting…" : b.label}</span>
              <span className="text-xs text-slate-400">{b.hint}</span>
              <span className="mt-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white">Download CSV</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      {toastView}
    </div>
  );
}