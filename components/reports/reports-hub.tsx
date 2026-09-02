"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { inr } from "@/lib/format";
import {
  BarChart3,
  TrendingUp,
  CreditCard,
  ShoppingBag,
  Users,
  Wallet,
  FileSpreadsheet,
  FileCheck2,
  Receipt,
  ArrowRight,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
  ArrowUpRight,
  Percent,
} from "lucide-react";

type Invoice = { total: string | number; paid: string | number; due: string | number; status: string };
type Expense = { amount: string | number; status: string };
type ReturnRow = { subtotal: string | number; refund: string | number };

type Props = { invoices: Invoice[]; expenses: Expense[]; returns: ReturnRow[] };

export default function ReportsHub({ invoices, expenses, returns }: Props) {
  const [selectedGroup, setSelectedGroup] = useState<string>("all");

  const metrics = useMemo(() => {
    const sales = invoices.reduce((s, x) => s + (Number(x.total) || 0), 0);
    const collected = invoices.reduce((s, x) => s + (Number(x.paid) || 0), 0);
    const outstanding = invoices.reduce((s, x) => s + (Number(x.due) || 0), 0);
    const expense = expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const returned = returns.reduce((s, x) => s + (Number(x.subtotal) || 0), 0);
    const net = sales - returned - expense;
    const collectionRate = sales > 0 ? (collected / sales) * 100 : 0;
    return { sales, collected, outstanding, expense, returned, net, collectionRate };
  }, [invoices, expenses, returns]);

  const REPORT_GROUPS = [
    {
      id: "operational",
      name: "1. Operational Reports",
      icon: BarChart3,
      description: "Day-to-day transaction flow, activity summaries and system audit trails",
      reports: [
        {
          title: "Reports Studio (Master Register)",
          desc: "Full tabular register across invoices, cash entries, service transactions & quick POS",
          href: "/reports",
          badge: "Core Studio",
          badgeTone: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
        },
        {
          title: "Financial Transaction Audit",
          desc: "Verify double-entry ledger postings, identify orphaned transactions and funding mismatches",
          href: "/reports/transaction-audit",
          badge: "GL Audit",
          badgeTone: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        },
        {
          title: "Security & Operations Audit Log",
          desc: "Immutable timestamped activity record for authentication, user actions & data changes",
          href: "/audit",
          badge: "Audit Trail",
          badgeTone: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
        },
      ],
    },
    {
      id: "sales",
      name: "2. Sales & Revenue",
      icon: TrendingUp,
      description: "Invoicing trends, POS quick sales, service margins and category revenues",
      reports: [
        {
          title: "Comprehensive Income Breakdown",
          desc: "Granular breakdown of POS retail revenue, service fees, commissions and gross profit margins",
          href: "/reports/income",
          badge: "Real-Time",
          badgeTone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        },
        {
          title: "Retail Sales Register & Invoices",
          desc: "Detailed invoice history with payment modes, customer mapping, status and CSV exports",
          href: "/reports?tab=invoices",
          badge: "Invoices",
          badgeTone: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
        },
        {
          title: "Quick Sales & Over-The-Counter Register",
          desc: "Single-item and fast counter receipts, change due calculations and COGS tracking",
          href: "/reports?tab=quick",
          badge: "POS",
          badgeTone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
        },
        {
          title: "Customer Returns & Credit Register",
          desc: `${returns.length} return vouchers logged totaling ${inr(metrics.returned)} with status and refunds`,
          href: "/returns",
          badge: "Returns",
          badgeTone: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
        },
      ],
    },
    {
      id: "purchases",
      name: "3. Purchases & Inventory",
      icon: ShoppingBag,
      description: "Procurement records, supplier valuations, Weighted Average Cost (WAC) & stock levels",
      reports: [
        {
          title: "Procurement & Purchase History",
          desc: "Vendor intake vouchers, purchase costs, payment tracking and supplier invoices",
          href: "/purchases",
          badge: "WAC Intake",
          badgeTone: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
        },
        {
          title: "Stock Valuation & Inventory Summary",
          desc: "Real-time SKU quantities, low-stock warnings, reorder points and total inventory value",
          href: "/inventory",
          badge: "Stock Level",
          badgeTone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        },
        {
          title: "Stock Movement Journal",
          desc: "Item-by-item inward, outward, adjustments and return movement audit trail",
          href: "/inventory/movements",
          badge: "Movement Log",
          badgeTone: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
        },
        {
          title: "Supplier Ledger & Payables",
          desc: "Vendor accounts directory, procurement balances and outstanding payables",
          href: "/suppliers",
          badge: "Payables",
          badgeTone: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
        },
      ],
    },
    {
      id: "customers",
      name: "4. Customer & Receivables",
      icon: Users,
      description: "Customer accounts, credit ledgers, aging receivables and collection performance",
      reports: [
        {
          title: "Customer Credit & Dues Ledger",
          desc: `Outstanding balances totaling ${inr(metrics.outstanding)} across active customer accounts`,
          href: "/reports?tab=accounts",
          badge: "Receivables",
          badgeTone: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        },
        {
          title: "Customer Directory & Balance Statements",
          desc: "Individual customer transaction history, balance tracking and statement generation",
          href: "/customers",
          badge: "Directory",
          badgeTone: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
        },
      ],
    },
    {
      id: "finance",
      name: "5. Finance & Treasury",
      icon: Wallet,
      description: "7-Pool liquidity, double-entry trial balance, P&L statement & cashbook audits",
      reports: [
        {
          title: "Profit & Loss Statement (P&L)",
          desc: "Canonical income statement: revenue, returns, POS COGS, service commissions and net margin",
          href: "/reports/profit-loss",
          badge: "Income Statement",
          badgeTone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        },
        {
          title: "Cash & Bank Balance Reconciliation",
          desc: "Instrument-level reconciliation: opening + ledger movements = expected vs current balance",
          href: "/reports/cash-bank",
          badge: "Reconciliation",
          badgeTone: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
        },
        {
          title: "Double-Entry Master Trial Balance",
          desc: "Self-balancing accounting debit and credit verification across all general ledger accounts",
          href: "/finance/trial-balance",
          badge: "Trial Balance",
          badgeTone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
        },
        {
          title: "General Ledger & Master Journal",
          desc: "Complete double-entry accounting postings with account codes, source references and vouchers",
          href: "/finance/journal",
          badge: "General Ledger",
          badgeTone: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
        },
        {
          title: "Daily Cash Book Ledger",
          desc: "Physical counter cash drawer register with opening cash, daily ins/outs and closing tally",
          href: "/finance/cashbook",
          badge: "Cash Book",
          badgeTone: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        },
        {
          title: "Operating Expenses Register",
          desc: `${expenses.length} operating vouchers totaling ${inr(metrics.expense)} with category tracking`,
          href: "/reports?tab=expenses",
          badge: "Expenses",
          badgeTone: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
        },
      ],
    },
    {
      id: "gst",
      name: "6. GST & Statutory",
      icon: FileSpreadsheet,
      description: "Indian statutory GSTR-1, GSTR-3B outwards summary, B2B/B2C tables & HSN schedules",
      reports: [
        {
          title: "GST Compliance & Tax Schedules (GSTR-1 / 3B)",
          desc: "Deterministic tax liability: CGST, SGST, IGST, B2B Invoices, B2C supplies, Credit Notes and HSN summaries",
          href: "/reports/gst",
          badge: "Statutory GSTR",
          badgeTone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
        },
      ],
    },
    {
      id: "tax",
      name: "7. Tax Preparation / ITR",
      icon: FileCheck2,
      description: "CA audit pack, Section 44AD presumptive turnover, 40A(3) cash expense limits & Balance Sheet",
      reports: [
        {
          title: "CA Year-End Tax Preparation Pack",
          desc: "Complete financial pack: P&L Statement, Presumptive 44AD compliance, Expense audit, Net Assets & Liabilities",
          href: "/reports/tax-preparation",
          badge: "ITR / CA Audit",
          badgeTone: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
        },
      ],
    },
    {
      id: "exports",
      name: "8. Exports & Print Center",
      icon: Receipt,
      description: "Dedicated CSV exports, thermal receipt views and accounting schedule downloads",
      reports: [
        {
          title: "Export Master Invoices & Registers (CSV)",
          desc: "Download complete comma-separated raw registers for external spreadsheet analysis",
          href: "/reports?tab=invoices",
          badge: "CSV Export",
          badgeTone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        },
        {
          title: "Cash & Bank Reconciliation Export",
          desc: "Export full multi-instrument reconciliation with expected balances and variance flags",
          href: "/reports/cash-bank",
          badge: "CSV Download",
          badgeTone: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
        },
      ],
    },
  ];

  const filteredGroups = selectedGroup === "all" ? REPORT_GROUPS : REPORT_GROUPS.filter((g) => g.id === selectedGroup);

  return (
    <div className="space-y-8" id="reports-hub-container">
      {/* Top Header & Context */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-center lg:justify-between dark:border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              ERP ENTERPRISE INTELLIGENCE
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Statutory GST &bull; Double-Entry Audit &bull; CA Pack Ready
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
            Reports &amp; Tax Command Center
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Authoritative financial statements, statutory tax schedules, audit registers, and multi-pool liquidity reports.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/reports/gst"
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300"
          >
            <FileSpreadsheet className="h-4 w-4" />
            GST Returns (GSTR-1/3B)
          </Link>
          <Link
            href="/reports/tax-preparation"
            className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3.5 py-2 text-xs font-semibold text-purple-700 transition hover:bg-purple-100 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300"
          >
            <FileCheck2 className="h-4 w-4" />
            CA Tax Preparation
          </Link>
          <Link
            href="/reports/profit-loss"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            <TrendingUp className="h-4 w-4" />
            Profit &amp; Loss
          </Link>
        </div>
      </div>

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Gross Invoiced Sales
            </span>
            <span className="rounded-md bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
            {inr(metrics.sales)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {invoices.length} total issued invoices
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Collected Payments
            </span>
            <span className="rounded-md bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CreditCard className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
            {inr(metrics.collected)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {metrics.collectionRate.toFixed(1)}% realization rate
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Outstanding Dues
            </span>
            <span className="rounded-md bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 tabular-nums">
            {inr(metrics.outstanding)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Active customer receivables
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Net Operating Result
            </span>
            <span className="rounded-md bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Percent className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
            {inr(metrics.net)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Sales &minus; Returns &minus; Op Expenses
          </div>
        </div>
      </div>

      {/* Information Architecture Taxonomy Filter Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Report Taxonomy &amp; Classifications
          </h2>
          <span className="text-xs text-slate-400">
            {REPORT_GROUPS.reduce((acc, g) => acc + g.reports.length, 0)} Authoritative Reports Available
          </span>
        </div>

        {/* Group Selector Pills */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3 dark:border-white/10">
          <button
            onClick={() => setSelectedGroup("all")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              selectedGroup === "all"
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            All Categories ({REPORT_GROUPS.reduce((acc, g) => acc + g.reports.length, 0)})
          </button>
          {REPORT_GROUPS.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroup(g.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                selectedGroup === g.id
                  ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <span>{g.name.split(". ")[1]}</span>
              <span className="text-[10px] opacity-75">({g.reports.length})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grouped Report Cards Grid */}
      <div className="space-y-8">
        {filteredGroups.map((group) => {
          const GroupIcon = group.icon;
          return (
            <div key={group.id} className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-slate-100 p-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <GroupIcon className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">
                    {group.name}
                  </h3>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {group.description}
                </span>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {group.reports.map((report) => (
                  <Link
                    key={report.title}
                    href={report.href}
                    className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xs dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-700"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${report.badgeTone}`}>
                          {report.badge}
                        </span>
                        <ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                      </div>
                      <h4 className="mt-2.5 text-sm font-bold text-slate-950 dark:text-white">
                        {report.title}
                      </h4>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {report.desc}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                      <span>Open Report</span>
                      <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Accounting & CA Direct Assistance Box */}
      <div className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
              <ShieldCheck className="h-4 w-4" />
              Statutory Accounting Invariants
            </div>
            <h3 className="mt-1 text-lg font-bold">
              Looking for CA Year-End &amp; GST Audit Workflows?
            </h3>
            <p className="mt-1 text-xs text-slate-400 max-w-2xl">
              All financial reporting is generated strictly from the immutable general ledger and canonical Supabase RPCs. Service transaction principal is isolated from retail turnover.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/reports/gst"
              className="rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              GSTR-1 &bull; GSTR-3B
            </Link>
            <Link
              href="/reports/tax-preparation"
              className="rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              ITR 44AD / 40A(3)
            </Link>
            <Link
              href="/reports/profit-loss"
              className="rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              P&amp;L Margin Audit
            </Link>
            <Link
              href="/reports/cash-bank"
              className="rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              Cash &amp; Bank Reconcile
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

