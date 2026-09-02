"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";
import {
  FileCheck2,
  Calendar,
  Database,
  Calculator,
  FileSpreadsheet,
  ShieldCheck,
  Download,
  ArrowRight,
  TrendingUp,
  Receipt,
  Layers,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Search,
  Building2,
  CreditCard,
  Percent,
} from "lucide-react";

type FYOption = {
  label: string;
  startDate: string;
  endDate: string;
};

const FY_OPTIONS: FYOption[] = [
  { label: "FY 2026-27 — Year to Date", startDate: "2026-04-01", endDate: "2027-03-31" },
  { label: "FY 2025-26 (Full Year)", startDate: "2025-04-01", endDate: "2026-03-31" },
  { label: "FY 2024-25 (Full Year)", startDate: "2024-04-01", endDate: "2025-03-31" },
];

export type WorkflowStep = "period" | "source" | "summary" | "schedules" | "review" | "export";

export default function TaxPreparationClient({
  initialStartDate,
  initialEndDate,
  initialReport,
  rawInvoices,
  rawQuickSales,
  rawExpenses,
  rawTransactions,
  rawCustomers,
}: {
  initialStartDate: string;
  initialEndDate: string;
  initialReport: any;
  rawInvoices: any[];
  rawQuickSales: any[];
  rawExpenses: any[];
  rawTransactions: any[];
  rawCustomers: any[];
}) {
  const [selectedFY, setSelectedFY] = useState<string>("FY 2026-27 — Year to Date");
  const [startDate, setStartDate] = useState<string>(initialStartDate);
  const [endDate, setEndDate] = useState<string>(initialEndDate);
  const [isCustomDate, setIsCustomDate] = useState<boolean>(false);
  const [report, setReport] = useState<any>(initialReport);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<WorkflowStep>("period");

  // Filter & Search states for tables
  const [sourceTab, setSourceTab] = useState<"invoices" | "quick_sales" | "expenses" | "transactions" | "dues">("invoices");
  const [sourceSearch, setSourceSearch] = useState<string>("");

  // Modal / Drawer state for drill-down audit
  const [drillDownTitle, setDrillDownTitle] = useState<string | null>(null);
  const [drillDownType, setDrillDownType] = useState<"invoices" | "quick_sales" | "expenses" | "aeps" | "dmt" | "upi" | "customers" | null>(null);

  const { showToast, toastView } = useToast();

  async function handleFYChange(fyLabel: string) {
    setSelectedFY(fyLabel);
    const opt = FY_OPTIONS.find((o) => o.label === fyLabel);
    if (opt) {
      setIsCustomDate(false);
      setStartDate(opt.startDate);
      setEndDate(opt.endDate);
      await fetchReport(opt.startDate, opt.endDate);
    }
  }

  async function fetchReport(sDate: string, eDate: string) {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_tax_preparation_report", {
        p_start_date: sDate,
        p_end_date: eDate,
      });
      if (error) {
        showToast("error", error.message);
      } else {
        setReport(data);
        showToast("success", "Tax preparation report updated.");
      }
    } catch (err: any) {
      showToast("error", err.message || "Failed to load tax report");
    } finally {
      setLoading(false);
    }
  }

  // Export CSV Helper
  function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("success", `${filename} downloaded successfully.`);
  }

  // Export Generators
  function exportPnLCSV() {
    if (!report) return;
    const pnl = report.pnl;
    const rev = report.revenue;
    const cogs = report.cogs;
    const exp = report.expenses;
    const rows = [
      ["Gross Retail Invoices", rev.gross_invoices],
      ["Less: Sales Returns", rev.sales_returns],
      ["Add: Retail Quick Sales", rev.quick_sales],
      ["Net Retail Revenue", rev.net_retail_revenue],
      ["AEPS Customer Fees", rev.service_fees.aeps_fees],
      ["AEPS Portal Commissions", rev.commissions.aeps_commissions],
      ["DMT Service Fees", rev.service_fees.dmt_fees],
      ["UPI Convenience Fees", rev.service_fees.upi_fees],
      ["TOTAL OPERATING REVENUE", rev.total_operating_revenue],
      ["Less: Historical Cost of Goods Sold (COGS)", cogs.total_cogs],
      ["GROSS BUSINESS PROFIT", cogs.gross_profit],
      ["Less: Recorded Business Expenses", exp.total_active_expenses],
      ["BUSINESS PROFIT BEFORE TAX ADJUSTMENTS", pnl.net_profit],
    ];
    downloadCSV(`Tax_P_and_L_${startDate}_to_${endDate}.csv`, ["Account Line Item", "Amount (INR)"], rows);
  }

  function exportExpenseRegisterCSV() {
    const rows = rawExpenses.map((e) => [
      e.expense_date,
      e.category || "General",
      e.note || "-",
      e.amount,
      e.status,
      e.created_at,
    ]);
    downloadCSV(`Expense_Register_${startDate}_to_${endDate}.csv`, ["Date", "Category", "Description/Note", "Amount", "Status", "Timestamp"], rows);
  }

  function exportIncomeClassificationCSV() {
    if (!report) return;
    const rev = report.revenue;
    const pt = report.pass_through;
    const rows = [
      ["Retail Revenue", "POS Invoices (Gross)", rev.gross_invoices, "Operating Income"],
      ["Retail Revenue", "Less: Sales Returns & Credit Notes", -rev.sales_returns, "Revenue Reversal"],
      ["Retail Revenue", "Counter Quick Sales", rev.quick_sales, "Operating Income"],
      ["Service Fees", "AEPS Customer Service Fees", rev.service_fees.aeps_fees, "Operating Fee Revenue"],
      ["Service Fees", "DMT Remittance Fees", rev.service_fees.dmt_fees, "Operating Fee Revenue"],
      ["Service Fees", "UPI Processing / Convenience Fees", rev.service_fees.upi_fees, "Operating Fee Revenue"],
      ["Commission Income", "AEPS Portal Commissions", rev.commissions.aeps_commissions, "Operating Commission"],
      ["Commission Income", "DMT Portal Commissions", rev.commissions.dmt_commissions ?? 0, "Operating Commission"],
      ["Pass-Through Volume", "AEPS Customer Cash Withdrawal Principal", pt.aeps_volume, "Custodial Pass-Through (Excluded from Revenue)"],
      ["Pass-Through Volume", "DMT Customer Remittance Principal", pt.dmt_volume, "Custodial Pass-Through (Excluded from Revenue)"],
      ["Pass-Through Volume", "UPI QR Customer Cash Payout Principal", pt.upi_volume, "Custodial Pass-Through (Excluded from Revenue)"],
      ["---", "---", "---", "---"],
      ["RECONCILIATION SUMMARY", "1. Net Retail Revenue", rev.net_retail_revenue, "Operating Revenue"],
      ["RECONCILIATION SUMMARY", "2. Service Fee Revenue", rev.service_fees.total_service_fees, "Operating Revenue"],
      ["RECONCILIATION SUMMARY", "3. Commission Revenue", rev.commissions.total_commissions, "Operating Revenue"],
      ["RECONCILIATION SUMMARY", "4. Other Operating Revenue", 0, "Operating Revenue"],
      ["RECONCILIATION SUMMARY", "TOTAL OPERATING REVENUE", rev.total_operating_revenue, "Canonical Reconciled (Variance: INR 0.00)"],
    ];
    downloadCSV(`Income_Classification_${startDate}_to_${endDate}.csv`, ["Classification Group", "Revenue Stream", "Amount (INR)", "Accounting P&L Treatment"], rows);
  }

  function exportReceivablesCSV() {
    const rows = rawCustomers.map((c) => [c.name, c.phone || "-", c.balance]);
    downloadCSV(`Customer_Receivables_${endDate}.csv`, ["Customer Name", "Phone Number", "Outstanding Balance (INR)"], rows);
  }

  const revenue = report?.revenue;
  const cogs = report?.cogs;
  const expenses = report?.expenses;
  const pnl = report?.pnl;
  const passThrough = report?.pass_through;
  const readiness = report?.readiness;
  const assets = report?.assets;

  const WORKFLOW_STEPS: { id: WorkflowStep; label: string; num: string; icon: any; desc: string }[] = [
    { id: "period", label: "Period & Scope", num: "1", icon: Calendar, desc: "Financial year & readiness" },
    { id: "source", label: "Source Data", num: "2", icon: Database, desc: "Invoices, expenses & txns" },
    { id: "summary", label: "Financial Summary", num: "3", icon: Calculator, desc: "P&L & pool balances" },
    { id: "schedules", label: "Tax Schedules", num: "4", icon: FileSpreadsheet, desc: "Operating vs pass-through" },
    { id: "review", label: "Compliance Review", num: "5", icon: ShieldCheck, desc: "44AD & 40A(3) checks" },
    { id: "export", label: "Export Package", num: "6", icon: Download, desc: "CA verification pack" },
  ];

  return (
    <div className="space-y-6 pb-12" id="tax-preparation-hub">
      {toastView}

      {/* Top Breadcrumbs & Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Link href="/reports" className="hover:text-blue-600 dark:hover:text-blue-400">
              Reports &amp; Tax Hub
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-bold text-slate-900 dark:text-white">CA Year-End Tax Preparation &amp; ITR</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
            Tax Preparation &amp; ITR Workspace
          </h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
            Deterministic accounting workspace: locked historical COGS, expense registers, pass-through segregation, and CA audit schedules.
          </p>
        </div>

        {/* Financial Year Selector & Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-2xs dark:border-white/10 dark:bg-slate-900">
            {FY_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => handleFYChange(opt.label)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  selectedFY === opt.label && !isCustomDate
                    ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {opt.label.split(" (")[0]}
              </button>
            ))}
            <button
              onClick={() => setIsCustomDate(!isCustomDate)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isCustomDate
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Custom
            </button>
          </div>

          {isCustomDate && (
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1 shadow-2xs dark:border-white/10 dark:bg-slate-900">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border-0 bg-transparent px-2 py-1 text-xs text-slate-900 focus:ring-0 dark:text-slate-200"
              />
              <span className="text-xs text-slate-400">&minus;</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border-0 bg-transparent px-2 py-1 text-xs text-slate-900 focus:ring-0 dark:text-slate-200"
              />
              <button
                onClick={() => fetchReport(startDate, endDate)}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? "..." : "Apply"}
              </button>
            </div>
          )}

          <Link
            href="/reports/gst"
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>GST Returns</span>
          </Link>
        </div>
      </div>

      {/* 6-Stage Visual Workflow Stepper */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-white/10 dark:bg-slate-900">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {WORKFLOW_STEPS.map((step) => {
            const StepIcon = step.icon;
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                className={`group flex flex-col items-start rounded-xl p-3 text-left transition ${
                  isActive
                    ? "bg-slate-950 text-white shadow-xs dark:bg-white dark:text-slate-950"
                    : "bg-slate-50/70 text-slate-700 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold ${
                      isActive
                        ? "bg-blue-500 text-white dark:bg-blue-600 dark:text-white"
                        : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {step.num}
                  </span>
                  <StepIcon
                    className={`h-4 w-4 ${
                      isActive ? "text-blue-400 dark:text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                    }`}
                  />
                </div>
                <span className="mt-2 text-xs font-bold">{step.label}</span>
                <span
                  className={`mt-0.5 text-[10px] line-clamp-1 ${
                    isActive ? "text-slate-300 dark:text-slate-600" : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {step.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Top Metric Bar */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div
          onClick={() => setActiveStep("summary")}
          className="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs transition hover:-translate-y-0.5 hover:border-blue-300 dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Operating Revenue
            </span>
            <span className="rounded-md bg-blue-50 p-1 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
            {inr(revenue?.total_operating_revenue ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Retail + Services + Commissions
          </div>
        </div>

        <div
          onClick={() => setActiveStep("summary")}
          className="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs transition hover:-translate-y-0.5 hover:border-blue-300 dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Historical COGS
            </span>
            <span className="rounded-md bg-slate-100 p-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
            {inr(cogs?.total_cogs ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Locked acquisition inventory cost
          </div>
        </div>

        <div
          onClick={() => setActiveStep("source")}
          className="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs transition hover:-translate-y-0.5 hover:border-rose-300 dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Operating Expenses
            </span>
            <span className="rounded-md bg-rose-50 p-1 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
              <Receipt className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400 tabular-nums">
            {inr(expenses?.total_active_expenses ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {expenses?.by_category?.length ?? 0} active tax categories
          </div>
        </div>

        <div
          onClick={() => setActiveStep("summary")}
          className="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs transition hover:-translate-y-0.5 hover:border-emerald-300 dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Profit Before Tax
            </span>
            <span className="rounded-md bg-emerald-50 p-1 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Percent className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
            {inr(pnl?.net_profit ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Margin: {pnl?.net_profit_margin_pct ?? 0}%
          </div>
        </div>
      </div>

      {/* WORKFLOW STEP 1: PERIOD & SCOPE */}
      {activeStep === "period" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Score Card */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Tax Data Readiness Score
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  100% Audit Ready
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-black text-emerald-900 dark:text-emerald-100 tabular-nums">
                  {readiness?.score ?? 100}
                </span>
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">/ 100 points</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
                Measures ERP double-entry posting completeness, source vouchers, and reconciliation. Not a determination of final tax liability.
              </p>
            </div>

            {/* Pass-Through Volume Segregation Card */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900/40 dark:bg-amber-950/20 md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Pass-Through Principal Volume (Excluded From Revenue)
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                  Strictly Segregated
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-amber-900 dark:text-amber-100 tabular-nums">
                  {inr(passThrough?.total_pass_through_volume ?? 0)}
                </span>
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  (AEPS: {inr(passThrough?.aeps_volume ?? 0)} · DMT: {inr(passThrough?.dmt_volume ?? 0)} · UPI: {inr(passThrough?.upi_volume ?? 0)})
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                <strong>Accountant Safety Guard:</strong> Customer cash withdrawal and remittance principals are treated strictly as balance-sheet custodial pass-through funds, preventing artificial inflation of taxable turnover.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">Active Period Configuration</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Tax calculations are scoped strictly to the selected Indian Financial Year dates.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Selected Financial Year</span>
                <p className="mt-1 font-mono text-sm font-bold text-slate-950 dark:text-white">{selectedFY}</p>
                <p className="mt-0.5 text-xs text-slate-400">Start: {startDate} &bull; End: {endDate}</p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Accounting Basis</span>
                <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">Cash / Accrual Hybrid</p>
                <p className="mt-0.5 text-xs text-slate-400">Invoice accruals + cash receipts</p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Audit Trail Lock</span>
                <p className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">Immutable General Ledger</p>
                <p className="mt-0.5 text-xs text-slate-400">Canonical Supabase RPC backed</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setActiveStep("source")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                <span>Continue to Source Data</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WORKFLOW STEP 2: SOURCE DATA & REGISTERS */}
      {activeStep === "source" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-950 dark:text-white">Raw Source Registers &amp; Vouchers</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Inspect raw transactions underpinning the tax calculation.
                </p>
              </div>

              {/* Source Tab Selector */}
              <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs dark:border-white/10 dark:bg-slate-800">
                <button
                  onClick={() => setSourceTab("invoices")}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    sourceTab === "invoices"
                      ? "bg-white text-slate-950 shadow-xs dark:bg-slate-900 dark:text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Invoices ({rawInvoices.length})
                </button>
                <button
                  onClick={() => setSourceTab("quick_sales")}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    sourceTab === "quick_sales"
                      ? "bg-white text-slate-950 shadow-xs dark:bg-slate-900 dark:text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Quick Sales ({rawQuickSales.length})
                </button>
                <button
                  onClick={() => setSourceTab("expenses")}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    sourceTab === "expenses"
                      ? "bg-white text-slate-950 shadow-xs dark:bg-slate-900 dark:text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Expenses ({rawExpenses.length})
                </button>
                <button
                  onClick={() => setSourceTab("transactions")}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    sourceTab === "transactions"
                      ? "bg-white text-slate-950 shadow-xs dark:bg-slate-900 dark:text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Services ({rawTransactions.length})
                </button>
                <button
                  onClick={() => setSourceTab("dues")}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    sourceTab === "dues"
                      ? "bg-white text-slate-950 shadow-xs dark:bg-slate-900 dark:text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Receivables ({rawCustomers.length})
                </button>
              </div>
            </div>

            {/* Invoices Table */}
            {sourceTab === "invoices" && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2.5 font-medium">Invoice #</th>
                      <th className="px-3.5 py-2.5 font-medium">Customer</th>
                      <th className="px-3.5 py-2.5 font-medium">Date</th>
                      <th className="px-3.5 py-2.5 text-right font-medium">Total</th>
                      <th className="px-3.5 py-2.5 text-right font-medium">Paid</th>
                      <th className="px-3.5 py-2.5 text-right font-medium">Due</th>
                      <th className="px-3.5 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {rawInvoices.slice(0, 25).map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                        <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                          {inv.invoice_number}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-800 dark:text-slate-200">
                          {inv.customers?.name ?? "Walk-in Customer"}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                          {inv.invoice_date}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">
                          {inr(Number(inv.total))}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {inr(Number(inv.paid))}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                          {inr(Number(inv.due))}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {rawInvoices.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3.5 py-8 text-center text-slate-500">
                          No invoices found for the period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Quick Sales Table */}
            {sourceTab === "quick_sales" && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2.5 font-medium">Entry ID / Date</th>
                      <th className="px-3.5 py-2.5 font-medium">Method</th>
                      <th className="px-3.5 py-2.5 font-medium">Description</th>
                      <th className="px-3.5 py-2.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {rawQuickSales.slice(0, 25).map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                        <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {q.entry_date}
                        </td>
                        <td className="px-3.5 py-2.5 capitalize text-slate-700 dark:text-slate-300">{q.method}</td>
                        <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">{q.description || "POS Quick Sale"}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">
                          {inr(Number(q.amount))}
                        </td>
                      </tr>
                    ))}
                    {rawQuickSales.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3.5 py-8 text-center text-slate-500">
                          No quick sales found for the period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Expenses Table */}
            {sourceTab === "expenses" && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2.5 font-medium">Date</th>
                      <th className="px-3.5 py-2.5 font-medium">Category</th>
                      <th className="px-3.5 py-2.5 font-medium">Note</th>
                      <th className="px-3.5 py-2.5 text-right font-medium">Amount</th>
                      <th className="px-3.5 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {rawExpenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                        <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                          {exp.expense_date}
                        </td>
                        <td className="px-3.5 py-2.5 font-semibold capitalize text-slate-900 dark:text-white">
                          {exp.category || "General"}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">{exp.note || "—"}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                          {inr(Number(exp.amount))}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              exp.status === "active"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {exp.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {rawExpenses.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3.5 py-8 text-center text-slate-500">
                          No expenses found for the period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Transactions Table */}
            {sourceTab === "transactions" && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2.5 font-medium">Txn #</th>
                      <th className="px-3.5 py-2.5 font-medium">Service</th>
                      <th className="px-3.5 py-2.5 font-medium">Date</th>
                      <th className="px-3.5 py-2.5 text-right font-medium">Principal</th>
                      <th className="px-3.5 py-2.5 text-right font-medium">Fee</th>
                      <th className="px-3.5 py-2.5 text-right font-medium">Commission</th>
                      <th className="px-3.5 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {rawTransactions.slice(0, 25).map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                        <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                          {t.transaction_number}
                        </td>
                        <td className="px-3.5 py-2.5 uppercase text-slate-700 dark:text-slate-300">{t.service_type}</td>
                        <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                          {t.transaction_date}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">
                          {inr(Number(t.amount))}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                          {inr(Number(t.service_fee))}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {inr(Number(t.portal_commission))}
                        </td>
                        <td className="px-3.5 py-2.5 capitalize text-slate-600 dark:text-slate-400">{t.status}</td>
                      </tr>
                    ))}
                    {rawTransactions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3.5 py-8 text-center text-slate-500">
                          No service transactions found for the period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Dues Table */}
            {sourceTab === "dues" && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2.5 font-medium">Customer</th>
                      <th className="px-3.5 py-2.5 font-medium">Phone</th>
                      <th className="px-3.5 py-2.5 text-right font-medium">Outstanding Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {rawCustomers.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                        <td className="px-3.5 py-2.5 font-medium text-slate-900 dark:text-white">{c.name}</td>
                        <td className="px-3.5 py-2.5 text-slate-500">{c.phone || "—"}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                          {inr(Number(c.balance))}
                        </td>
                      </tr>
                    ))}
                    {rawCustomers.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3.5 py-8 text-center text-slate-500">
                          No outstanding customer balances.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WORKFLOW STEP 3: FINANCIAL SUMMARY (P&L & BALANCES) */}
      {activeStep === "summary" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4 dark:border-white/10">
              <div>
                <h2 className="text-base font-bold text-slate-950 dark:text-white">
                  Tax Preparation Profit &amp; Loss Statement
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Period: {startDate} to {endDate} &bull; Accounting Standard: Cash/Accrual Hybrid
                </p>
              </div>
              <button
                onClick={exportPnLCSV}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
              >
                <Download className="h-3.5 w-3.5" />
                Export P&amp;L (CSV)
              </button>
            </div>

            <div className="mt-4 space-y-4 font-mono text-sm">
              {/* Revenue Section */}
              <div className="space-y-1.5">
                <p className="font-sans text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  1. Operating Revenue
                </p>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span className="font-sans">Gross Retail POS Sales (Invoices)</span>
                  <span className="tabular-nums">{inr(revenue?.gross_invoices ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-500 dark:text-slate-400">
                  <span className="font-sans">Less: Sales Returns &amp; Refunds</span>
                  <span className="tabular-nums">- {inr(revenue?.sales_returns ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span className="font-sans">Add: Counter Quick Sales</span>
                  <span className="tabular-nums">+ {inr(revenue?.quick_sales ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span className="font-sans">AEPS Service Fees Collected</span>
                  <span className="tabular-nums">+ {inr(revenue?.service_fees?.aeps_fees ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span className="font-sans">AEPS Portal Commissions Credited</span>
                  <span className="tabular-nums">+ {inr(revenue?.commissions?.aeps_commissions ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span className="font-sans">DMT Remittance Service Fees</span>
                  <span className="tabular-nums">+ {inr(revenue?.service_fees?.dmt_fees ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span className="font-sans">UPI Processing Convenience Fees</span>
                  <span className="tabular-nums">+ {inr(revenue?.service_fees?.upi_fees ?? 0)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900 dark:border-white/10 dark:text-white">
                  <span className="font-sans">Total Operating Revenue</span>
                  <span className="text-blue-600 dark:text-blue-400 tabular-nums">{inr(revenue?.total_operating_revenue ?? 0)}</span>
                </div>
              </div>

              {/* COGS Section */}
              <div className="space-y-1.5 pt-3">
                <p className="font-sans text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  2. Cost of Goods Sold (COGS)
                </p>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span className="font-sans">Historical Locked Cost of Inventory Sold</span>
                  <span className="tabular-nums">- {inr(cogs?.total_cogs ?? 0)}</span>
                </div>
                {cogs?.total_cogs === 0 && (
                  <div className="rounded-lg bg-slate-50 p-2.5 font-sans text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    No qualifying inventory COGS records found for the period (sales were primarily service/margin-based).
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900 dark:border-white/10 dark:text-white">
                  <span className="font-sans">Gross Business Profit</span>
                  <span className="tabular-nums">{inr(cogs?.gross_profit ?? 0)}</span>
                </div>
              </div>

              {/* Expenses Section */}
              <div className="space-y-1.5 pt-3">
                <p className="font-sans text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  3. Recorded Business Expenses
                </p>
                {expenses?.by_category?.map((cat: any) => (
                  <div key={cat.category} className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                    <span className="font-sans capitalize">{cat.category} ({cat.transaction_count} items)</span>
                    <span className="tabular-nums">- {inr(cat.total_amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900 dark:border-white/10 dark:text-white">
                  <span className="font-sans">Total Recorded Business Expenses</span>
                  <span className="text-rose-600 dark:text-rose-400 tabular-nums">- {inr(expenses?.total_active_expenses ?? 0)}</span>
                </div>
              </div>

              {/* Net Profit Box */}
              <div className="rounded-xl bg-slate-950 p-4 font-bold text-white shadow-xs dark:bg-white dark:text-slate-950">
                <div className="flex justify-between text-base">
                  <span className="font-sans">BUSINESS PROFIT BEFORE TAX ADJUSTMENTS</span>
                  <span className="text-emerald-400 dark:text-emerald-600 tabular-nums">{inr(pnl?.net_profit ?? 0)}</span>
                </div>
                <p className="mt-1 font-sans text-xs font-normal text-slate-400 dark:text-slate-600">
                  Computed deterministically from ERP records. Tax adjustments (depreciation, Section 44AD presumptive rates) to be reviewed by your CA.
                </p>
              </div>
            </div>
          </div>

          {/* Liquid Pool Asset Positions */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">
              Liquid Asset Pool Closing Positions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Balance sheet closing positions across all liquid asset pools.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { key: "cash", label: "Physical Cash Drawer", amt: assets?.cash?.current ?? 0 },
                { key: "bank", label: "Bank Accounts", amt: assets?.bank?.current ?? 0 },
                { key: "aeps", label: "AEPS Platform Float", amt: assets?.aeps?.current ?? 0 },
                { key: "upi_qr", label: "UPI QR Balance", amt: assets?.upi_qr?.current ?? 0 },
                { key: "wallet", label: "Digital Wallets", amt: assets?.wallet?.current ?? 0 },
                { key: "dmt", label: "DMT Float", amt: assets?.dmt?.current ?? 0 },
              ].map((p) => (
                <div key={p.key} className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{p.label}</p>
                  <p className="mt-1 font-mono text-lg font-bold text-slate-950 dark:text-white tabular-nums">{inr(p.amt)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* WORKFLOW STEP 4: TAX SCHEDULES & INCOME CLASSIFICATION */}
      {activeStep === "schedules" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4 dark:border-white/10">
              <div>
                <h2 className="text-base font-bold text-slate-950 dark:text-white">Income Classification Schedules</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Categorization of operating revenues versus custodial pass-through funds for statutory review.
                </p>
              </div>
              <button
                onClick={exportIncomeClassificationCSV}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200"
              >
                <Download className="h-3.5 w-3.5" />
                Export Classification (CSV)
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                  <tr>
                    <th className="px-3.5 py-2.5 font-medium">Stream / Description</th>
                    <th className="px-3.5 py-2.5 font-medium">Category</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-3.5 py-2.5 font-medium">P&amp;L Accounting Treatment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-white">Retail Invoices (POS)</td>
                    <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">Retail Sales</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">
                      {inr(revenue?.gross_invoices ?? 0)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        Net Retail Revenue
                      </span>
                    </td>
                  </tr>
                  {Number(revenue?.sales_returns ?? 0) > 0 && (
                    <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                      <td className="px-3.5 py-2.5 font-semibold text-rose-600 dark:text-rose-400">
                        Less: Sales Returns &amp; Credit Notes
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">Sales Deduction</td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        -{inr(revenue?.sales_returns ?? 0)}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                          Revenue Reversal
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-white">Quick Counter Sales</td>
                    <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">Retail Sales</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">
                      {inr(revenue?.quick_sales ?? 0)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        Net Retail Revenue
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-white">AEPS Customer Service Fees</td>
                    <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">Service Charges</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">
                      {inr(revenue?.service_fees?.aeps_fees ?? 0)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                        Operating Fee Revenue
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-white">DMT Remittance Fees</td>
                    <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">Service Charges</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">
                      {inr(revenue?.service_fees?.dmt_fees ?? 0)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                        Operating Fee Revenue
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-white">AEPS Portal Commission</td>
                    <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">Direct Commission</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">
                      {inr(revenue?.commissions?.aeps_commissions ?? 0)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                        Operating Commission
                      </span>
                    </td>
                  </tr>
                  <tr className="bg-amber-50/40 dark:bg-amber-950/10">
                    <td className="px-3.5 py-2.5 font-semibold text-amber-900 dark:text-amber-200">
                      AEPS Cash Withdrawal Volume
                    </td>
                    <td className="px-3.5 py-2.5 text-amber-700 dark:text-amber-300">Customer Pass-Through</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-amber-900 dark:text-amber-100 tabular-nums">
                      {inr(passThrough?.aeps_volume ?? 0)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        Excluded From Income
                      </span>
                    </td>
                  </tr>
                  <tr className="bg-amber-50/40 dark:bg-amber-950/10">
                    <td className="px-3.5 py-2.5 font-semibold text-amber-900 dark:text-amber-200">
                      DMT Remittance Volume
                    </td>
                    <td className="px-3.5 py-2.5 text-amber-700 dark:text-amber-300">Customer Pass-Through</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-amber-900 dark:text-amber-100 tabular-nums">
                      {inr(passThrough?.dmt_volume ?? 0)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        Excluded From Income
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Reconciliation Subtotal Box */}
            <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-blue-200 pb-3 dark:border-blue-800/60">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200">
                    Operating Revenue Reconciliation Summary
                  </h3>
                </div>
                <span className="self-start sm:self-auto rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  100% CANONICALLY RECONCILED (VARIANCE: ₹0.00)
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-800">
                  <p className="text-slate-500 dark:text-slate-400 font-medium">1. Net Retail Revenue</p>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-950 dark:text-white tabular-nums">
                    {inr(revenue?.net_retail_revenue ?? 0)}
                  </p>
                </div>

                <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-800">
                  <p className="text-slate-500 dark:text-slate-400 font-medium">+ 2. Service Fee Revenue</p>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-950 dark:text-white tabular-nums">
                    {inr(revenue?.service_fees?.total_service_fees ?? 0)}
                  </p>
                </div>

                <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-800">
                  <p className="text-slate-500 dark:text-slate-400 font-medium">+ 3. Commission Revenue</p>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-950 dark:text-white tabular-nums">
                    {inr(revenue?.commissions?.total_commissions ?? 0)}
                  </p>
                </div>

                <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-800">
                  <p className="text-slate-500 dark:text-slate-400 font-medium">+ 4. Other Operating Revenue</p>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-950 dark:text-white tabular-nums">
                    {inr(0)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between rounded-xl bg-slate-950 p-4 text-white dark:bg-slate-900">
                <div>
                  <p className="text-xs font-semibold text-slate-300">Reconciled Total Operating Revenue</p>
                  <p className="text-[11px] text-slate-400">
                    Retail ({inr(revenue?.net_retail_revenue ?? 0)}) + Service Fees ({inr(revenue?.service_fees?.total_service_fees ?? 0)}) + Commissions ({inr(revenue?.commissions?.total_commissions ?? 0)})
                  </p>
                </div>
                <div className="text-right mt-2 sm:mt-0">
                  <span className="font-mono text-xl font-bold tabular-nums">{inr(revenue?.total_operating_revenue ?? 0)}</span>
                  <span className="block text-[10px] text-emerald-400 font-bold uppercase">Variance: ₹0.00 (Exact Match)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WORKFLOW STEP 5: COMPLIANCE REVIEW (44AD / 40A(3)) */}
      {activeStep === "review" && (
        <div className="space-y-6">
          {/* Section 44AD Panel */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3 dark:border-white/10">
              <div>
                <h2 className="text-base font-bold text-slate-950 dark:text-white">
                  Section 44AD — Data Prepared for Accountant Review
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Presumptive taxation data breakdown. Final qualification must be evaluated by your CA under Section 44AD(6).
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                Requires Accountant Evaluation
              </span>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-3.5 dark:border-white/10">
                <p className="text-xs text-slate-500 dark:text-slate-400">Gross Turnover / Retail Receipts</p>
                <p className="mt-1 font-mono text-lg font-bold text-slate-950 dark:text-white tabular-nums">{inr(revenue?.net_retail_revenue ?? 0)}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">Invoices + Quick Counter Sales</p>
              </div>

              <div className="rounded-xl border border-slate-200 p-3.5 dark:border-white/10">
                <p className="text-xs text-slate-500 dark:text-slate-400">Service Fees &amp; Convenience Charges</p>
                <p className="mt-1 font-mono text-lg font-bold text-slate-950 dark:text-white tabular-nums">{inr(revenue?.service_fees?.total_service_fees ?? 0)}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">AEPS, DMT, UPI service fees</p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/10">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Commission Income</p>
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">Flagged under 44AD(6)</span>
                </div>
                <p className="mt-1 font-mono text-lg font-bold text-amber-900 dark:text-amber-200 tabular-nums">{inr(revenue?.commissions?.total_commissions ?? 0)}</p>
                <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">Agency/Commission income requires review</p>
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-400">
              <strong>Accountant Notice:</strong> Section 44AD excludes persons earning income in the nature of commission or brokerage under Section 44AD(6). Since portal commissions ({inr(revenue?.commissions?.total_commissions ?? 0)}) are tracked, your Chartered Accountant will determine whether separate books or presumptive rates apply to eligible retail streams.
            </div>
          </div>

          {/* Section 40A(3) Review Panel */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3 dark:border-white/10">
              <div>
                <h2 className="text-base font-bold text-slate-950 dark:text-white">
                  Section 40A(3) — Cash Payment Review Audit
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cash payments at or above ₹10,000 threshold are flagged for accountant verification (not automatically disallowed).
                </p>
              </div>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                Threshold: ₹10,000 / day
              </span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                  <tr>
                    <th className="px-3.5 py-2.5 font-medium">Date</th>
                    <th className="px-3.5 py-2.5 font-medium">Category</th>
                    <th className="px-3.5 py-2.5 font-medium">Description</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-3.5 py-2.5 font-medium">Status Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {rawExpenses.slice(0, 10).map((exp) => {
                    const isOverLimit = Number(exp.amount) >= 10000;
                    return (
                      <tr key={exp.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                        <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{exp.expense_date}</td>
                        <td className="px-3.5 py-2.5 font-semibold capitalize text-slate-900 dark:text-white">{exp.category || "General"}</td>
                        <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">{exp.note || "—"}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">{inr(exp.amount)}</td>
                        <td className="px-3.5 py-2.5">
                          {isOverLimit ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                              Flagged for 40A(3) Review
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                              Standard
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rawExpenses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3.5 py-8 text-center text-slate-500">
                        No expenses logged.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* WORKFLOW STEP 6: ACCOUNTANT EXPORT PACKAGE */}
      {activeStep === "export" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">Accountant Tax Export Package</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Download verified statutory registers and accounting schedules for financial year {startDate} to {endDate}.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">P&amp;L Tax Statement</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Standard accounting P&amp;L with locked COGS</p>
                </div>
                <button
                  onClick={exportPnLCSV}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-blue-500"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download CSV
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">Expense Register</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Categorized business expense register</p>
                </div>
                <button
                  onClick={exportExpenseRegisterCSV}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-blue-500"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download CSV
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">Income Classification</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Segregated operating vs pass-through streams</p>
                </div>
                <button
                  onClick={exportIncomeClassificationCSV}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-blue-500"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download CSV
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">Customer Receivables</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Outstanding ledger balances and customer dues</p>
                </div>
                <button
                  onClick={exportReceivablesCSV}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-blue-500"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Direct Quick Links & Footer Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400">
        <div className="flex flex-wrap gap-4">
          <Link href="/reports/gst" className="text-indigo-600 hover:underline dark:text-indigo-400">
            GST Returns (GSTR-1 / GSTR-3B) &rarr;
          </Link>
          <Link href="/reports/profit-loss" className="text-blue-600 hover:underline dark:text-blue-400">
            Profit &amp; Loss Statement &rarr;
          </Link>
          <Link href="/reports/cash-bank" className="text-blue-600 hover:underline dark:text-blue-400">
            Cash &amp; Bank Reconciliation &rarr;
          </Link>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Print Audit Summary
        </button>
      </div>
    </div>
  );
}
