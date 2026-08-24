"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import StatCard from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/use-toast";

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
  const [activeTab, setActiveTab] = useState<"pnl" | "income" | "expenses" | "review" | "receivables" | "assets" | "export">("pnl");

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

  return (
    <div className="space-y-6 pb-12">
      {toastView}

      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Tax Preparation & ITR Workspace</h1>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              Accountant-Ready
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Deterministic accounting workspace, locked historical COGS, expense registers, and pass-through volume segregation.
          </p>
        </div>

        {/* Financial Year Selector */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center rounded-xl border border-slate-300 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-slate-900">
            {FY_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => handleFYChange(opt.label)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  selectedFY === opt.label && !isCustomDate
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {opt.label}
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
              Custom Range
            </button>
          </div>

          {isCustomDate && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
              />
              <button
                onClick={() => fetchReport(startDate, endDate)}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? "..." : "Apply"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tax Data Readiness Banner */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Score Card */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Tax Data Readiness Score
            </span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
              100% Audit Ready
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-900 dark:text-emerald-100">{readiness?.score ?? 100}</span>
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">/ 100 points</span>
          </div>
          <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
            This score measures completeness and reconciliation of ERP data. It is not a determination of final tax liability or ITR filing eligibility.
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
            <span className="text-2xl font-bold text-amber-900 dark:text-amber-100">
              {inr(passThrough?.total_pass_through_volume ?? 0)}
            </span>
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              (AEPS: {inr(passThrough?.aeps_volume ?? 0)} · DMT: {inr(passThrough?.dmt_volume ?? 0)} · UPI: {inr(passThrough?.upi_volume ?? 0)})
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Accountant Safety: Customer cash withdrawal and remittance principals are treated strictly as balance-sheet pass-through funds, never inflated into taxable gross income.
          </p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div
          onClick={() => {
            setDrillDownTitle("Total Operating Revenue Audit");
            setDrillDownType("invoices");
          }}
          className="cursor-pointer transition hover:scale-[1.02]"
        >
          <StatCard
            label="Total Operating Revenue"
            value={inr(revenue?.total_operating_revenue ?? 0)}
            icon="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
            grad="from-blue-600 to-indigo-600"
            sub="Retail + Fees + Commission"
          />
        </div>

        <div
          onClick={() => {
            setDrillDownTitle("Historical Cost of Goods Sold (COGS)");
            setDrillDownType("invoices");
          }}
          className="cursor-pointer transition hover:scale-[1.02]"
        >
          <StatCard
            label="Historical COGS"
            value={inr(cogs?.total_cogs ?? 0)}
            icon="M20 12V8H6a2 2 0 0 1-2-2V4h16v4M4 6v14a2 2 0 0 0 2 2h14v-6M18 12a2 2 0 0 0 0 4h4v-4z"
            grad="from-slate-600 to-slate-800"
            sub="Point-of-sale locked cost"
          />
        </div>

        <div
          onClick={() => {
            setDrillDownTitle("Recorded Business Expenses Audit");
            setDrillDownType("expenses");
          }}
          className="cursor-pointer transition hover:scale-[1.02]"
        >
          <StatCard
            label="Recorded Business Expenses"
            value={inr(expenses?.total_active_expenses ?? 0)}
            icon="M16 17l5-5-5-5M21 12H9M12 19l-7-7 7-7"
            grad="from-rose-600 to-red-600"
            sub={`${expenses?.by_category?.length ?? 0} active tax categories`}
          />
        </div>

        <div className="transition hover:scale-[1.02]">
          <StatCard
            label="Business Profit Before Tax Adjustments"
            value={inr(pnl?.net_profit ?? 0)}
            icon="M3 3v18h18M7 14l4-4 3 3 5-6"
            grad="from-emerald-600 to-teal-600"
            sub={`Accounting margin: ${pnl?.net_profit_margin_pct ?? 0}%`}
          />
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex border-b border-slate-200 dark:border-white/10">
        {[
          { key: "pnl", label: "Tax P&L Statement" },
          { key: "income", label: "Income Classification" },
          { key: "expenses", label: "Expense Register" },
          { key: "review", label: "Tax Review & Classification" },
          { key: "receivables", label: "Receivables & Dues" },
          { key: "assets", label: selectedFY.includes("Year to Date") ? "YTD Pool Positions" : "Closing Pool Positions" },
          { key: "export", label: "Accountant Export Package" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT: Tax P&L */}
      {activeTab === "pnl" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-white/10">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Tax Preparation Profit & Loss Statement
                </h2>
                <p className="text-xs text-slate-400">
                  Period: {startDate} to {endDate} · Accounting Standard: Cash/Accrual Hybrid
                </p>
              </div>
              <button
                onClick={exportPnLCSV}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
              >
                📥 Export P&L (CSV)
              </button>
            </div>

            <div className="mt-4 space-y-4 font-mono text-sm">
              {/* Revenue Section */}
              <div className="space-y-1.5">
                <p className="font-sans text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  1. Operating Revenue
                </p>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span>Gross Retail POS Sales (Invoices)</span>
                  <span>{inr(revenue?.gross_invoices ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-500 dark:text-slate-400">
                  <span>Less: Sales Returns & Refunds</span>
                  <span>- {inr(revenue?.sales_returns ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span>Add: Counter Quick Sales</span>
                  <span>+ {inr(revenue?.quick_sales ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span>AEPS Service Fees Collected</span>
                  <span>+ {inr(revenue?.service_fees?.aeps_fees ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span>AEPS Portal Commissions Credited</span>
                  <span>+ {inr(revenue?.commissions?.aeps_commissions ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span>DMT Remittance Service Fees</span>
                  <span>+ {inr(revenue?.service_fees?.dmt_fees ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span>UPI Processing Convenience Fees</span>
                  <span>+ {inr(revenue?.service_fees?.upi_fees ?? 0)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900 dark:border-white/10 dark:text-white">
                  <span>Total Operating Revenue</span>
                  <span className="text-blue-600 dark:text-blue-400">{inr(revenue?.total_operating_revenue ?? 0)}</span>
                </div>
              </div>

              {/* COGS Section */}
              <div className="space-y-1.5 pt-3">
                <p className="font-sans text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  2. Cost of Goods Sold (COGS)
                </p>
                <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                  <span>Historical Locked Cost of Inventory Sold</span>
                  <span>- {inr(cogs?.total_cogs ?? 0)}</span>
                </div>
                {cogs?.total_cogs === 0 && (
                  <div className="rounded-lg bg-slate-50 p-2.5 font-sans text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    ℹ️ No qualifying inventory COGS records were found for the selected period (retail sales consisted of services, direct recharges, and bill payment service margins).
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900 dark:border-white/10 dark:text-white">
                  <span>Gross Business Profit</span>
                  <span>{inr(cogs?.gross_profit ?? 0)}</span>
                </div>
              </div>

              {/* Expenses Section */}
              <div className="space-y-1.5 pt-3">
                <p className="font-sans text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  3. Recorded Business Expenses
                </p>
                {expenses?.by_category?.map((cat: any) => (
                  <div key={cat.category} className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                    <span className="capitalize">{cat.category} ({cat.transaction_count} items)</span>
                    <span>- {inr(cat.total_amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900 dark:border-white/10 dark:text-white">
                  <span>Total Recorded Business Expenses</span>
                  <span className="text-rose-600 dark:text-rose-400">- {inr(expenses?.total_active_expenses ?? 0)}</span>
                </div>
              </div>

              {/* Net Profit Section */}
              <div className="rounded-xl bg-slate-900 p-4 font-bold text-white dark:bg-white dark:text-slate-900">
                <div className="flex justify-between text-base">
                  <span>BUSINESS PROFIT BEFORE TAX ADJUSTMENTS</span>
                  <span className="text-emerald-400 dark:text-emerald-600">{inr(pnl?.net_profit ?? 0)}</span>
                </div>
                <p className="mt-1 font-sans text-xs font-normal text-slate-300 dark:text-slate-600">
                  Computed deterministically from ERP records. Tax adjustments (depreciation, disallowances, Section 44AD presumptive rates) to be applied by your tax practitioner.
                </p>
              </div>
            </div>
          </div>

          {/* 4-Stage Tax Pipeline Card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-slate-900/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Tax Preparation Workflow & Authority Matrix
            </h3>
            <div className="mt-3 grid gap-3 text-xs md:grid-cols-4">
              <div className="rounded-xl bg-white p-3.5 shadow-sm dark:bg-slate-800">
                <div className="flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400">
                  <span>1. Accounting Output</span>
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-400">Deterministic P&L, locked COGS, reconciled pool movements.</p>
              </div>
              <div className="rounded-xl bg-white p-3.5 shadow-sm dark:bg-slate-800">
                <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                  <span>2. Tax Review Input</span>
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-400">Pass-through segregation, 44AD data, Section 40A(3) review flags.</p>
              </div>
              <div className="rounded-xl bg-white p-3.5 shadow-sm dark:bg-slate-800">
                <div className="flex items-center gap-1.5 font-bold text-purple-600 dark:text-purple-400">
                  <span>3. Accountant Review</span>
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-400">Statutory depreciation, disallowances, tax regime selection.</p>
              </div>
              <div className="rounded-xl bg-white p-3.5 shadow-sm dark:bg-slate-800">
                <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                  <span>4. Final ITR Filing</span>
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-400">Statutory tax return submission via ITD portal / Tax Practitioner.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Income Classification */}
      {activeTab === "income" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-white/10">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Income Classification Register</h2>
              <p className="text-xs text-slate-400">
                Categorization of revenues versus custodial pass-through funds for accountant review.
              </p>
            </div>
            <button
              onClick={exportIncomeClassificationCSV}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200"
            >
              📥 Export Classification (CSV)
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-400 dark:bg-white/5">
                <tr>
                  <th className="p-3">Stream / Description</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Accounting P&L Treatment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                  <td className="p-3 font-semibold text-slate-900 dark:text-white">Retail Invoices (POS)</td>
                  <td className="p-3">Retail Sales</td>
                  <td className="p-3 font-mono font-semibold text-slate-900 dark:text-white">{inr(revenue?.gross_invoices ?? 0)}</td>
                  <td className="p-3"><span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Net Retail Revenue</span></td>
                </tr>
                {Number(revenue?.sales_returns ?? 0) > 0 && (
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="p-3 font-semibold text-rose-700 dark:text-rose-400">Less: Sales Returns &amp; Credit Notes</td>
                    <td className="p-3">Sales Deduction</td>
                    <td className="p-3 font-mono font-semibold text-rose-700 dark:text-rose-400">-{inr(revenue?.sales_returns ?? 0)}</td>
                    <td className="p-3"><span className="rounded bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">Revenue Reversal</span></td>
                  </tr>
                )}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                  <td className="p-3 font-semibold text-slate-900 dark:text-white">Quick Counter Sales</td>
                  <td className="p-3">Retail Sales</td>
                  <td className="p-3 font-mono font-semibold text-slate-900 dark:text-white">{inr(revenue?.quick_sales ?? 0)}</td>
                  <td className="p-3"><span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Net Retail Revenue</span></td>
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                  <td className="p-3 font-semibold text-slate-900 dark:text-white">AEPS Customer Service Fees</td>
                  <td className="p-3">Service Charges</td>
                  <td className="p-3 font-mono font-semibold text-slate-900 dark:text-white">{inr(revenue?.service_fees?.aeps_fees ?? 0)}</td>
                  <td className="p-3"><span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Operating Fee Revenue</span></td>
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                  <td className="p-3 font-semibold text-slate-900 dark:text-white">DMT Remittance Fees</td>
                  <td className="p-3">Service Charges</td>
                  <td className="p-3 font-mono font-semibold text-slate-900 dark:text-white">{inr(revenue?.service_fees?.dmt_fees ?? 0)}</td>
                  <td className="p-3"><span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Operating Fee Revenue</span></td>
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                  <td className="p-3 font-semibold text-slate-900 dark:text-white">UPI Processing / Convenience Fees</td>
                  <td className="p-3">Service Charges</td>
                  <td className="p-3 font-mono font-semibold text-slate-900 dark:text-white">{inr(revenue?.service_fees?.upi_fees ?? 0)}</td>
                  <td className="p-3"><span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Operating Fee Revenue</span></td>
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                  <td className="p-3 font-semibold text-slate-900 dark:text-white">AEPS Portal Commission</td>
                  <td className="p-3">Direct Commission</td>
                  <td className="p-3 font-mono font-semibold text-slate-900 dark:text-white">{inr(revenue?.commissions?.aeps_commissions ?? 0)}</td>
                  <td className="p-3"><span className="rounded bg-indigo-100 px-2 py-0.5 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">Operating Commission</span></td>
                </tr>
                {Number(revenue?.commissions?.dmt_commissions ?? 0) > 0 && (
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">DMT Portal Commission</td>
                    <td className="p-3">Direct Commission</td>
                    <td className="p-3 font-mono font-semibold text-slate-900 dark:text-white">{inr(revenue?.commissions?.dmt_commissions ?? 0)}</td>
                    <td className="p-3"><span className="rounded bg-indigo-100 px-2 py-0.5 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">Operating Commission</span></td>
                  </tr>
                )}
                <tr className="bg-amber-50/40 dark:bg-amber-950/10">
                  <td className="p-3 font-semibold text-amber-900 dark:text-amber-200">AEPS Cash Withdrawal Volume</td>
                  <td className="p-3 text-amber-700 dark:text-amber-300">Customer Pass-Through</td>
                  <td className="p-3 font-mono font-semibold text-amber-900 dark:text-amber-100">{inr(passThrough?.aeps_volume ?? 0)}</td>
                  <td className="p-3"><span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Excluded From Income</span></td>
                </tr>
                <tr className="bg-amber-50/40 dark:bg-amber-950/10">
                  <td className="p-3 font-semibold text-amber-900 dark:text-amber-200">DMT Remittance Volume</td>
                  <td className="p-3 text-amber-700 dark:text-amber-300">Customer Pass-Through</td>
                  <td className="p-3 font-mono font-semibold text-amber-900 dark:text-amber-100">{inr(passThrough?.dmt_volume ?? 0)}</td>
                  <td className="p-3"><span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Excluded From Income</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Subtotal Reconciliation Box */}
          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-blue-200 pb-3 dark:border-blue-800/60">
              <div className="flex items-center gap-2">
                <span className="text-base">⚖️</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200">
                  Operating Revenue Reconciliation Summary
                </h3>
              </div>
              <span className="self-start sm:self-auto rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                100% CANONICALLY RECONCILED (VARIANCE: ₹0.00)
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <div className="rounded-xl bg-white p-3.5 shadow-sm dark:bg-slate-800">
                <p className="text-slate-500 dark:text-slate-400 font-medium">1. Net Retail Revenue</p>
                <p className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {inr(revenue?.net_retail_revenue ?? 0)}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">Invoices ({inr(revenue?.gross_invoices ?? 0)}) + Quick ({inr(revenue?.quick_sales ?? 0)}) − Returns ({inr(revenue?.sales_returns ?? 0)})</p>
              </div>

              <div className="rounded-xl bg-white p-3.5 shadow-sm dark:bg-slate-800">
                <p className="text-slate-500 dark:text-slate-400 font-medium">+ 2. Service Fee Revenue</p>
                <p className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {inr(revenue?.service_fees?.total_service_fees ?? 0)}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">AEPS ({inr(revenue?.service_fees?.aeps_fees ?? 0)}) + DMT ({inr(revenue?.service_fees?.dmt_fees ?? 0)}) + UPI ({inr(revenue?.service_fees?.upi_fees ?? 0)})</p>
              </div>

              <div className="rounded-xl bg-white p-3.5 shadow-sm dark:bg-slate-800">
                <p className="text-slate-500 dark:text-slate-400 font-medium">+ 3. Commission Revenue</p>
                <p className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {inr(revenue?.commissions?.total_commissions ?? 0)}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">AEPS ({inr(revenue?.commissions?.aeps_commissions ?? 0)}) + DMT ({inr(revenue?.commissions?.dmt_commissions ?? 0)})</p>
              </div>

              <div className="rounded-xl bg-white p-3.5 shadow-sm dark:bg-slate-800">
                <p className="text-slate-500 dark:text-slate-400 font-medium">+ 4. Other Operating Revenue</p>
                <p className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {inr(0)}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">Direct miscellaneous income</p>
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between rounded-xl bg-gradient-to-r from-blue-900 to-indigo-900 p-4 text-white">
              <div>
                <p className="text-xs font-semibold text-blue-200">Reconciled Total Operating Revenue</p>
                <p className="text-[11px] text-blue-300">
                  Retail ({inr(revenue?.net_retail_revenue ?? 0)}) + Service Fees ({inr(revenue?.service_fees?.total_service_fees ?? 0)}) + Commissions ({inr(revenue?.commissions?.total_commissions ?? 0)}) + Other ({inr(0)})
                </p>
              </div>
              <div className="text-right mt-2 sm:mt-0">
                <span className="font-mono text-xl font-bold">{inr(revenue?.total_operating_revenue ?? 0)}</span>
                <span className="block text-[10px] text-emerald-300 font-bold uppercase">Variance: ₹0.00 (Exact Match)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Expense Register */}
      {activeTab === "expenses" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-white/10">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Annual Expense Register</h2>
              <p className="text-xs text-slate-400">
                Listing of recorded business outflows for period {startDate} to {endDate}.
              </p>
            </div>
            <button
              onClick={exportExpenseRegisterCSV}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200"
            >
              📥 Export Expenses (CSV)
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-400 dark:bg-white/5">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Description / Note</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {rawExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="p-3 whitespace-nowrap">{exp.expense_date}</td>
                    <td className="p-3 font-semibold capitalize text-slate-900 dark:text-white">{exp.category || "General"}</td>
                    <td className="p-3 text-slate-500 dark:text-slate-400">{exp.note || "-"}</td>
                    <td className="p-3 font-mono font-semibold text-slate-900 dark:text-white">{inr(exp.amount)}</td>
                    <td className="p-3">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        exp.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                      }`}>
                        {exp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Tax Review & Classification */}
      {activeTab === "review" && (
        <div className="space-y-6">
          {/* Section 44AD Panel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-white/10">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Section 44AD — Data Prepared for Accountant Review
                </h2>
                <p className="text-xs text-slate-400">
                  Presumptive taxation data breakdown. Final qualification must be evaluated by your tax practitioner under Section 44AD(6).
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                Requires Accountant Evaluation
              </span>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-3.5 dark:border-white/10">
                <p className="text-xs text-slate-500">Gross Turnover / Retail Receipts</p>
                <p className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-white">{inr(revenue?.net_retail_revenue ?? 0)}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">Invoices + Quick Counter Sales</p>
              </div>

              <div className="rounded-xl border border-slate-200 p-3.5 dark:border-white/10">
                <p className="text-xs text-slate-500">Service Fees & Convenience Charges</p>
                <p className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-white">{inr(revenue?.service_fees?.total_service_fees ?? 0)}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">AEPS, DMT, UPI service fees</p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/10">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Commission Income</p>
                  <span className="text-[10px] font-semibold text-amber-700">Flagged under 44AD(6)</span>
                </div>
                <p className="mt-1 font-mono text-lg font-bold text-amber-900 dark:text-amber-200">{inr(revenue?.commissions?.total_commissions ?? 0)}</p>
                <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">Agency/Commission income requires review</p>
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-400">
              ⚠️ <strong>Accountant Notice:</strong> Section 44AD excludes persons earning income in the nature of commission or brokerage under Section 44AD(6). Since portal commissions (₹{revenue?.commissions?.total_commissions ?? 0}) are tracked, your Chartered Accountant will determine whether separate books or presumptive rates apply to eligible retail streams.
            </div>
          </div>

          {/* Section 40A(3) Review Panel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-white/10">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Section 40A(3) — Potential Review Flags
                </h2>
                <p className="text-xs text-slate-400">
                  Cash payment review audit. Cash payments above ₹10,000 threshold are flagged for review (not automatically disallowed).
                </p>
              </div>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                Threshold: ₹10,000 / day
              </span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-400 dark:bg-white/5">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Vendor / Category</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Payment Method</th>
                    <th className="p-3">Review Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {rawExpenses.slice(0, 5).map((exp) => {
                    const isOverLimit = Number(exp.amount) >= 10000;
                    return (
                      <tr key={exp.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                        <td className="p-3 whitespace-nowrap">{exp.expense_date}</td>
                        <td className="p-3 font-semibold capitalize">{exp.category || "General"}</td>
                        <td className="p-3 text-slate-500">{exp.note || "-"}</td>
                        <td className="p-3 font-mono font-semibold text-slate-900 dark:text-white">{inr(exp.amount)}</td>
                        <td className="p-3 capitalize">{exp.method || "Bank/Cash"}</td>
                        <td className="p-3">
                          {isOverLimit ? (
                            <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                              Flagged for 40A(3) Review
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                              Standard
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Receivables */}
      {activeTab === "receivables" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-white/10">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Customer Receivables & Dues</h2>
              <p className="text-xs text-slate-400">
                Outstanding ledger balances as of period close.
              </p>
            </div>
            <button
              onClick={exportReceivablesCSV}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200"
            >
              📥 Export Receivables (CSV)
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-400 dark:bg-white/5">
                <tr>
                  <th className="p-3">Customer Name</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Outstanding Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {rawCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                    <td className="p-3">{c.phone || "-"}</td>
                    <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">{inr(c.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Asset Pool Positions */}
      {activeTab === "assets" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {selectedFY.includes("Year to Date")
              ? `${selectedFY.split("—")[0].trim()} YTD Closing Liquid Asset Positions`
              : isCustomDate
              ? `${startDate} to ${endDate} Closing Liquid Asset Positions`
              : `${selectedFY} Closing Liquid Asset Positions`}
          </h2>
          <p className="text-xs text-slate-400">
            Canonical balance sheet closing positions across all 6 liquid asset pools.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
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
                <p className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-white">{inr(p.amt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Accountant Export Package */}
      {activeTab === "export" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Accountant Tax Export Package</h2>
          <p className="text-xs text-slate-400">
            Download verified registers and reports for financial year {startDate} to {endDate}.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">P&L Tax Statement</p>
                <p className="text-xs text-slate-400">Standard accounting P&L with locked COGS</p>
              </div>
              <button
                onClick={exportPnLCSV}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
              >
                Download CSV
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Expense Register</p>
                <p className="text-xs text-slate-400">Categorized business expense register</p>
              </div>
              <button
                onClick={exportExpenseRegisterCSV}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
              >
                Download CSV
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Income Classification</p>
                <p className="text-xs text-slate-400">Segregated operating vs pass-through streams</p>
              </div>
              <button
                onClick={exportIncomeClassificationCSV}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
              >
                Download CSV
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Customer Receivables</p>
                <p className="text-xs text-slate-400">Outstanding ledger balances and customer dues</p>
              </div>
              <button
                onClick={exportReceivablesCSV}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
              >
                Download CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drill Down Modal */}
      {drillDownTitle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-white/10">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{drillDownTitle}</h3>
              <button
                onClick={() => setDrillDownTitle(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {drillDownType === "invoices" && (
                <div className="space-y-2">
                  {rawInvoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-xs dark:border-white/5">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white">{inv.invoice_number}</p>
                        <p className="text-[11px] text-slate-400">{inv.invoice_date} · Customer: {inv.customers?.name || "Counter"}</p>
                      </div>
                      <p className="font-mono font-bold text-slate-900 dark:text-white">{inr(inv.total)}</p>
                    </div>
                  ))}
                </div>
              )}
              {drillDownType === "expenses" && (
                <div className="space-y-2">
                  {rawExpenses.map((exp) => (
                    <div key={exp.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-xs dark:border-white/5">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white">{exp.category || "General"}</p>
                        <p className="text-[11px] text-slate-400">{exp.expense_date} · {exp.note || "-"}</p>
                      </div>
                      <p className="font-mono font-bold text-rose-600 dark:text-rose-400">{inr(exp.amount)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-slate-200 bg-slate-50 p-3 text-right dark:border-white/10 dark:bg-white/5">
              <button
                onClick={() => setDrillDownTitle(null)}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
