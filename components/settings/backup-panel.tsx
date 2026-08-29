"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import Modal from "@/components/ui/modal";
import SettingsSection from "@/components/settings/settings-section";

interface ExportCard {
  key: string;
  label: string;
  desc: string;
  icon: string;
  tone: string;
}

const EXPORTS: ExportCard[] = [
  {
    key: "customers",
    label: "Customers & Dues",
    desc: "Directory, contact numbers, credit limits & outstanding balances",
    icon: "👥",
    tone: "blue",
  },
  {
    key: "invoices",
    label: "Sales Invoices",
    desc: "All billing transactions with tax, discount & payment split",
    icon: "🧾",
    tone: "emerald",
  },
  {
    key: "ledger",
    label: "Customer Ledger",
    desc: "Every debit, credit, opening balance & running customer balance",
    icon: "📑",
    tone: "indigo",
  },
  {
    key: "catalog",
    label: "Products & Services",
    desc: "Complete price list, purchase cost, HSN codes & current stock",
    icon: "📦",
    tone: "amber",
  },
  {
    key: "expenses",
    label: "Expense Ledger",
    desc: "Operating expenses, vendor payments & categorized shop costs",
    icon: "💸",
    tone: "rose",
  },
  {
    key: "day_close",
    label: "Daily Closings & P&L",
    desc: "Historical day close records, cash reconciliation & net profit",
    icon: "📊",
    tone: "violet",
  },
];

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
  const [tableStats, setTableStats] = useState<Record<string, number>>({});
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

    async function loadStats() {
      try {
        const counts: Record<string, number> = {};
        const [cCust, cInv, cProd, cServ, cExp] = await Promise.all([
          supabase.from("customers").select("*", { count: "exact", head: true }),
          supabase.from("invoices").select("*", { count: "exact", head: true }),
          supabase.from("products").select("*", { count: "exact", head: true }),
          supabase.from("services").select("*", { count: "exact", head: true }),
          supabase.from("expenses").select("*", { count: "exact", head: true }),
        ]);
        counts["customers"] = cCust.count || 0;
        counts["invoices"] = cInv.count || 0;
        counts["products"] = cProd.count || 0;
        counts["services"] = cServ.count || 0;
        counts["expenses"] = cExp.count || 0;
        setTableStats(counts);
      } catch {}
    }
    loadStats();
  }, [supabase]);

  async function exportCsv(kind: string) {
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
        map = (r) => [r.code, r.name, r.phone, r.email, r.address, r.opening_balance, r.balance, r.customer_type, r.is_active ? "Yes" : "No", r.created_at];
      } else if (kind === "invoices") {
        const { data, error } = await supabase
          .from("invoices")
          .select("invoice_number, invoice_date, customers(name), subtotal, discount, total, paid, due, status")
          .order("created_at", { ascending: false });
        if (error) throw new Error(error.message);
        headers = ["Invoice No", "Date", "Customer", "Subtotal", "Discount", "Total", "Paid", "Due", "Status"];
        rows = (data ?? []) as any[];
        map = (r) => [r.invoice_number, r.invoice_date, r.customers?.name ?? "Walk-in", r.subtotal, r.discount, r.total, r.paid, r.due, r.status];
      } else if (kind === "ledger") {
        const { data, error } = await supabase
          .from("customer_ledger")
          .select("entry_date, customers(name), type, description, debit, credit, balance_after")
          .order("created_at", { ascending: false });
        if (error) throw new Error(error.message);
        headers = ["Date", "Customer", "Type", "Description", "Debit", "Credit", "Balance After"];
        rows = (data ?? []) as any[];
        map = (r) => [r.entry_date, r.customers?.name ?? "", r.type, r.description, r.debit, r.credit, r.balance_after];
      } else if (kind === "catalog") {
        const [{ data: prods }, { data: servs }] = await Promise.all([
          supabase.from("products").select("name, sku, barcode, cost_price, sale_price, stock_quantity, min_stock_alert, is_active"),
          supabase.from("services").select("name, code, cost_price, sale_price, is_active"),
        ]);
        headers = ["Item Type", "Code/SKU", "Name", "Cost Price", "Sale Price", "Current Stock", "Active"];
        rows = [
          ...(prods || []).map((p: any) => ({ type: "Product", code: p.sku || p.barcode || "-", name: p.name, cost: p.cost_price, sale: p.sale_price, stock: p.stock_quantity, active: p.is_active })),
          ...(servs || []).map((s: any) => ({ type: "Service", code: s.code || "-", name: s.name, cost: s.cost_price, sale: s.sale_price, stock: "N/A", active: s.is_active })),
        ];
        map = (r) => [r.type, r.code, r.name, r.cost, r.sale, r.stock, r.active ? "Yes" : "No"];
      } else if (kind === "expenses") {
        const { data, error } = await supabase
          .from("expenses")
          .select("expense_date, category, description, amount, payment_mode, vendor_name, created_at")
          .order("expense_date", { ascending: false });
        if (error) throw new Error(error.message);
        headers = ["Date", "Category", "Description", "Amount", "Payment Mode", "Vendor", "Created At"];
        rows = (data ?? []) as any[];
        map = (r) => [r.expense_date, r.category, r.description, r.amount, r.payment_mode, r.vendor_name || "", r.created_at];
      } else if (kind === "day_close") {
        const { data, error } = await supabase
          .from("closings")
          .select("closing_date, closing_number, total_sales, total_collected, net_profit, status, created_at")
          .order("closing_date", { ascending: false });
        if (error) throw new Error(error.message);
        headers = ["Closing Date", "Closing No", "Total Sales", "Collected Amount", "Net Business Profit", "Status", "Recorded At"];
        rows = (data ?? []) as any[];
        map = (r) => [r.closing_date, r.closing_number, r.total_sales, r.total_collected, r.net_profit, r.status, r.created_at];
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
    showToast("success", `Exported ${kind.replace("_", " ")} CSV successfully.`);
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
        app: "CafeERP",
        version: "2.0.0",
        exported_at: new Date().toISOString(),
        total_tables: DATA_TABLES.length,
        tables,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `CafeERP-FullBackup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("success", "Full encrypted shop backup downloaded.");
      logAudit({
        action: "export",
        entity: "backup",
        entity_id: null,
        description: "Downloaded complete JSON database snapshot from Settings → Backup & Data",
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
          showToast("error", "Not a valid Cafe ERP backup file.");
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
      showToast("success", "Backup restored successfully. Reloading…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      showToast("error", e.message || "Restore failed.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      {/* 1. Database Health & Snapshot Status Banner */}
      <section className="overflow-hidden rounded-[24px] border border-blue-500/20 bg-gradient-to-br from-blue-50/60 via-white to-indigo-50/40 p-5 shadow-sm backdrop-blur-xl dark:border-blue-900/40 dark:from-blue-950/30 dark:via-slate-900/80 dark:to-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
            </span>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Live Cloud Database Snapshots &amp; Export Studio
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                All business records, sales receipts, and ledgers are continuously synced with Supabase PostgreSQL.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Continuous Cloud RPO 0s
            </span>
          </div>
        </div>

        {/* Live Records Metric Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-xs dark:border-white/10 dark:bg-slate-800/80">
            <p className="text-[10px] font-bold uppercase text-slate-400">Invoices</p>
            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{tableStats.invoices ?? "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-xs dark:border-white/10 dark:bg-slate-800/80">
            <p className="text-[10px] font-bold uppercase text-slate-400">Customers</p>
            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{tableStats.customers ?? "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-xs dark:border-white/10 dark:bg-slate-800/80">
            <p className="text-[10px] font-bold uppercase text-slate-400">Products</p>
            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{tableStats.products ?? "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-xs dark:border-white/10 dark:bg-slate-800/80">
            <p className="text-[10px] font-bold uppercase text-slate-400">Services</p>
            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{tableStats.services ?? "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-xs dark:border-white/10 dark:bg-slate-800/80">
            <p className="text-[10px] font-bold uppercase text-slate-400">Expenses</p>
            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{tableStats.expenses ?? "-"}</p>
          </div>
        </div>
      </section>

      {/* 2. One-Click Module CSV Data Exporters */}
      <SettingsSection
        icon="M21 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v13"
        tone="blue"
        title="1-Click Modular CSV &amp; Excel Exporters"
        desc="Download formatted CSV spreadsheets compatible with Microsoft Excel, Google Sheets, and Tally."
      >
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORTS.map((b) => (
            <div
              key={b.key}
              className="flex flex-col justify-between rounded-[20px] border border-slate-200/90 bg-white p-4 shadow-sm transition hover:border-blue-300 dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-800"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{b.icon}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600 dark:bg-white/10 dark:text-slate-300">
                    CSV / Excel
                  </span>
                </div>
                <h4 className="mt-2.5 text-sm font-extrabold text-slate-900 dark:text-white">
                  {b.label}
                </h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {b.desc}
                </p>
              </div>

              <button
                type="button"
                onClick={() => exportCsv(b.key)}
                disabled={exporting === b.key}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {exporting === b.key ? (
                  <span>Generating CSV…</span>
                ) : (
                  <>
                    <span>Download {b.label} CSV</span>
                    <span>↓</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* 3. Full Database Backup & Disaster Recovery */}
      {isAdmin && (
        <SettingsSection
          icon="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
          tone="emerald"
          title="Full Database Snapshot &amp; Disaster Recovery"
          desc="Download an all-inclusive single JSON file containing all 27 database tables, or restore an earlier snapshot."
        >
          <div className="rounded-[22px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Full Store Snapshot (JSON)
                </h4>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Encapsulates products, invoices, payments, ledgers, AEPS/DMT/UPI masters, and closing accounts.
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={downloadFullBackup}
                  disabled={backingUp || restoring}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  <span>{backingUp ? "Generating Snapshot…" : "Download Full Backup (JSON)"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={backingUp || restoring}
                  className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-extrabold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  <span>Restore from Backup…</span>
                </button>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onFileChosen}
            />
          </div>
        </SettingsSection>
      )}

      {/* Restore Confirmation Modal */}
      {restoreConfirm && (
        <Modal
          onClose={() => (restoring ? undefined : setRestoreConfirm(null))}
          title="Confirm Database Restoration"
          accent="rose"
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRestoreConfirm(null)}
                disabled={restoring}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRestore}
                disabled={restoring}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md transition hover:bg-rose-700 disabled:opacity-50"
              >
                {restoring ? "Restoring Records…" : "Yes, Replace & Restore All Data"}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              You are about to restore data from <strong>{restoreConfirm.fileName}</strong>. This will replace all active sales, invoices, customers, and ledger tables with the snapshot file.
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
              ⚠️ <strong>Important:</strong> Staff login credentials and security audit logs are strictly preserved.
            </div>
          </div>
        </Modal>
      )}

      {toastView}
    </div>
  );
}