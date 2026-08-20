"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import Modal from "@/components/ui/modal";
import SettingsSection from "@/components/settings/settings-section";

const EXPORTS = [
  { key: "customers", label: "Customers", hint: "Directory, balances & types" },
  { key: "invoices", label: "Invoices", hint: "Every bill with payments" },
  { key: "ledger", label: "Customer Ledger", hint: "All ledger entries" },
] as const;

const DATA_TABLES = [
  "settings",
  "payment_methods",
  "categories",
  "brands",
  "units",
  "products",
  "services",
  "customers",
  "invoices",
  "invoice_items",
  "payments",
  "quick_sales",
  "quick_sale_items",
  "returns",
  "return_items",
  "transactions",
  "cash_entries",
  "expenses",
  "settlements",
  "payment_instruments",
  "customer_ledger",
  "opening_balances",
  "closings",
  "closing_balances",
  "aeps_banks",
  "aeps_portals",
  "upi_merchant_qrs",
] as const;

export default function BackupPanel({ active }: { active: boolean }) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const [exporting, setExporting] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<{ payload: unknown; fileName: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      setIsAdmin(profile?.role === "admin");
    });
  }, [supabase]);

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

  async function downloadFullBackup() {
    setBackingUp(true);
    try {
      const tables: Record<string, any[]> = {};
      for (const t of DATA_TABLES) {
        const { data, error } = await supabase.from(t).select("*");
        if (error) throw new Error(`${t}: ${error.message}`);
        tables[t] = data ?? [];
      }
      const payload = {
        app: "sccomm-web",
        version: 1,
        exported_at: new Date().toISOString(),
        tables,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("success", "Full backup downloaded.");
      logAudit({
        action: "export",
        entity: "backup",
        entity_id: null,
        description: "Downloaded full JSON backup from Settings → Backup & Data",
      });
    } catch (e: any) {
      showToast("error", e.message || "Backup failed.");
    } finally {
      setBackingUp(false);
    }
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result));
        if (!payload || typeof payload !== "object" || !payload.tables || typeof payload.tables !== "object") {
          showToast("error", "Not a valid backup file.");
          return;
        }
        setRestoreConfirm({ payload, fileName: f.name });
      } catch {
        showToast("error", "Not a valid JSON backup file.");
      }
    };
    reader.readAsText(f);
  }

  async function confirmRestore() {
    if (!restoreConfirm) return;
    setRestoring(true);
    try {
      const { error } = await supabase.rpc("restore_backup", { p_payload: restoreConfirm.payload });
      if (error) throw new Error(error.message);
      logAudit({
        action: "restore",
        entity: "backup",
        entity_id: null,
        description: `Restored backup from ${restoreConfirm.fileName} via Settings → Backup & Data`,
      });
      setRestoreConfirm(null);
      showToast("success", "Backup restored. Reloading…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      showToast("error", e.message || "Restore failed.");
    } finally {
      setRestoring(false);
    }
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

        {isAdmin && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Full backup & restore</p>
            <p className="mt-1 text-xs text-slate-400">
              Download every record as a single JSON file, or restore it later to replace all current data.
              Staff accounts and the audit trail are never touched.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadFullBackup}
                disabled={backingUp || restoring}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
              >
                {backingUp ? "Backing up…" : "Download Full Backup (JSON)"}
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={backingUp || restoring}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
              >
                Restore from Backup…
              </button>
            </div>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFileChosen} />
          </div>
        )}
      </SettingsSection>

      {restoreConfirm && (
        <Modal
          onClose={() => (restoring ? undefined : setRestoreConfirm(null))}
          title="Restore Backup?"
          accent="rose"
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRestoreConfirm(null)}
                disabled={restoring}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRestore}
                disabled={restoring}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {restoring ? "Restoring…" : "Restore Backup"}
              </button>
            </div>
          }
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This will <b>replace all current data</b> — customers, catalog, invoices, payments, cash,
            transactions, expenses, settlements, closing &amp; opening balances, and AEPS/DMT/UPI masters —
            with the contents of <b>{restoreConfirm.fileName}</b>.
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Your staff accounts and the audit trail are kept. This cannot be undone.
          </p>
        </Modal>
      )}

      {toastView}
    </div>
  );
}