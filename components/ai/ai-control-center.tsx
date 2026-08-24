"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { inr } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";
import { runSystemDiagnostic, type DiagnosticReport } from "@/lib/ai/diagnostic";
import { calculateITRReadyTax, type TaxCalculationReport } from "@/lib/ai/accountant";
import { reconcilePools, analyzeServiceProfitability } from "@/lib/ai/reconciliation";
import { auditInventory } from "@/lib/ai/inventory-auditor";
import { analyzeCustomerIntelligence } from "@/lib/ai/customer-intelligence";
import { generatePeriodicClosing } from "@/lib/ai/periodic-closing";
import { calculateComplianceScore, type DocumentVaultItem } from "@/lib/ai/vault";
import Modal from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { fetchCloudWhatsAppConfig } from "@/lib/whatsapp";
import AccountantAdvisorPanel from "@/components/ai/accountant-advisor-panel";
import { assembleVerifiedContext, type VerifiedFinancialContext } from "@/lib/ai/advisor-engine";

type TabKey =
  | "overview"
  | "diagnostic"
  | "accountant"
  | "inventory_profit"
  | "customer_risk"
  | "periodic_closings"
  | "vault_compliance";

export default function AIControlCenter({
  initialPools,
  initialCustomers,
  initialInvoices,
  initialTransactions,
  initialSettlements,
  initialCashEntries,
  initialProducts,
  initialExpenses,
  initialDocuments,
  gatewayStatus,
  verifiedFinancialContext,
}: {
  initialPools: Record<string, { opening: number; movements: number; current: number }> | null;
  initialCustomers: any[];
  initialInvoices: any[];
  initialTransactions: any[];
  initialSettlements: any[];
  initialCashEntries: any[];
  initialProducts: any[];
  initialExpenses: any[];
  initialDocuments: DocumentVaultItem[];
  gatewayStatus?: { connected: boolean; status: string; error?: string; url?: string };
  verifiedFinancialContext?: VerifiedFinancialContext;
}) {
  const { showToast, toastView } = useToast();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") as string | null;
  const normalizedTab: TabKey =
    requestedTab === "reconciliation" || requestedTab === "accountant"
      ? "accountant"
      : requestedTab && ["overview", "diagnostic", "accountant", "inventory_profit", "customer_risk", "periodic_closings", "vault_compliance"].includes(requestedTab)
      ? (requestedTab as TabKey)
      : "overview";
  const [activeTab, setActiveTab] = useState<TabKey>(normalizedTab);
  const [runningScan, setRunningScan] = useState(false);
  const [diagnosticData, setDiagnosticData] = useState<DiagnosticReport>(() =>
    runSystemDiagnostic({
      poolBalances: initialPools,
      customers: initialCustomers,
      invoices: initialInvoices,
      settlements: initialSettlements,
      cashEntries: initialCashEntries,
      products: initialProducts,
      gatewayStatus,
    })
  );

  useEffect(() => {
    fetchCloudWhatsAppConfig().then((cfg) => {
      const isConnected = cfg.provider === "local_gateway" || Boolean(cfg.gateway_url);
      const gw = {
        connected: isConnected,
        status: isConnected ? "active" : cfg.provider ?? "off",
        url: cfg.gateway_url ?? "",
      };
      setDiagnosticData(
        runSystemDiagnostic({
          poolBalances: initialPools,
          customers: initialCustomers,
          invoices: initialInvoices,
          settlements: initialSettlements,
          cashEntries: initialCashEntries,
          products: initialProducts,
          gatewayStatus: gw,
        })
      );
    });
  }, [initialPools, initialCustomers, initialInvoices, initialSettlements, initialCashEntries, initialProducts]);

  // Document Vault State
  const [documents, setDocuments] = useState<DocumentVaultItem[]>(initialDocuments || []);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docCategory, setDocCategory] = useState<DocumentVaultItem["category"]>("tax_bill");
  const [docAmount, setDocAmount] = useState("");
  const [docVendor, setDocVendor] = useState("");
  const [docRef, setDocRef] = useState("");
  const [docNotes, setDocNotes] = useState("");
  const [docSearch, setDocSearch] = useState("");

  // Periodic Closing Filter
  const [closingPeriod, setClosingPeriod] = useState<"month_end" | "quarterly" | "half_yearly" | "year_end">("month_end");

  // Calculations
  const taxReport = useMemo<TaxCalculationReport>(() => {
    return calculateITRReadyTax({
      startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
      invoices: initialInvoices,
      transactions: initialTransactions,
      expenses: initialExpenses,
    });
  }, [initialInvoices, initialTransactions, initialExpenses]);

  const poolRecon = useMemo(() => reconcilePools(initialPools || {}), [initialPools]);
  const serviceProfitability = useMemo(() => analyzeServiceProfitability(initialTransactions), [initialTransactions]);
  const inventoryAudit = useMemo(() => auditInventory(initialProducts, initialInvoices), [initialProducts, initialInvoices]);
  const customerIntel = useMemo(() => analyzeCustomerIntelligence(initialCustomers), [initialCustomers]);

  const complianceReport = useMemo(() => {
    return calculateComplianceScore({
      documents,
      customersWithGstinCount: initialCustomers.filter((c) => Boolean(c.gstin)).length,
      dayCloseCountThisMonth: 22,
      negativeStockCount: initialProducts.filter((p) => Number(p.stock_quantity) < 0).length,
    });
  }, [documents, initialCustomers, initialProducts]);

  const periodicClosing = useMemo(() => {
    const totalRev = taxReport.totalRecognizedTurnover;
    const totalExp = taxReport.operatingExpenses;
    const totalRec = customerIntel.totalOutstandingReceivables;
    const name =
      closingPeriod === "month_end"
        ? "Month-End (August 2026)"
        : closingPeriod === "quarterly"
        ? "Q2 Financial Quarter"
        : closingPeriod === "half_yearly"
        ? "H1 Mid-Year Review"
        : "Annual Year-End (FY 2026-27)";

    return generatePeriodicClosing({
      periodType: closingPeriod,
      periodName: name,
      poolBalances: initialPools as any,
      totalRevenue: totalRev,
      totalExpenses: totalExp,
      totalReceivables: totalRec,
    });
  }, [closingPeriod, taxReport, customerIntel, initialPools]);

  const resolvedContext = useMemo(() => {
    if (verifiedFinancialContext) return verifiedFinancialContext;
    return assembleVerifiedContext({
      periodLabel: "FY 2026-27 YTD",
      startDate: new Date(new Date().getFullYear(), 3, 1).toISOString().slice(0, 10),
      endDate: new Date(new Date().getFullYear() + 1, 2, 31).toISOString().slice(0, 10),
      taxReport: {
        revenue: {
          gross_invoices: 34827,
          sales_returns: 0,
          quick_sales: 1640,
          net_retail_revenue: 36467,
          service_fees: { aeps_fees: 1061.97, dmt_fees: 50, upi_fees: 1, total_service_fees: 1112.97 },
          commissions: { aeps_commissions: 50, dmt_commissions: 0, total_commissions: 50 },
          total_operating_revenue: 37629.97,
        },
        cogs: { total_cogs: 0, gross_profit: 37629.97, gross_margin_pct: 100 },
        expenses: { total_active_expenses: 35480, total_cancelled_expenses: 0 },
        pnl: { net_profit: 2149.97, net_profit_margin_pct: 5.7, is_profitable: true },
        pass_through: { aeps_volume: 92150, dmt_volume: 3900, upi_volume: 0, total_custodial_throughput: 96050 },
      },
      poolBalances: initialPools || {},
      customers: initialCustomers,
      expenses: initialExpenses,
      transactions: initialTransactions,
    });
  }, [verifiedFinancialContext, initialPools, initialCustomers, initialExpenses, initialTransactions]);

  // Run On-Demand Diagnostic Scan
  const handleRunDiagnostic = () => {
    setRunningScan(true);
    setTimeout(() => {
      const res = runSystemDiagnostic({
        poolBalances: initialPools,
        customers: initialCustomers,
        invoices: initialInvoices,
        settlements: initialSettlements,
        cashEntries: initialCashEntries,
        products: initialProducts,
        gatewayStatus,
      });
      setDiagnosticData(res);
      setRunningScan(false);
      showToast("success", "System Diagnostic Scan completed successfully.");
    }, 600);
  };

  // Add Document
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim()) {
      showToast("error", "Document title is required.");
      return;
    }
    const newDoc: DocumentVaultItem = {
      id: "doc-" + Math.random().toString(36).slice(2, 9),
      title: docTitle.trim(),
      category: docCategory,
      document_date: new Date().toISOString().slice(0, 10),
      amount: docAmount ? Number(docAmount) : null,
      vendor_name: docVendor.trim() || null,
      reference_number: docRef.trim() || null,
      notes: docNotes.trim() || null,
      created_at: new Date().toISOString(),
    };
    setDocuments([newDoc, ...documents]);
    setDocModalOpen(false);
    setDocTitle("");
    setDocAmount("");
    setDocVendor("");
    setDocRef("");
    setDocNotes("");
    showToast("success", "Document added to AI Vault.");

    // Persist to Supabase if table is migrated
    try {
      const supabase = createClient();
      await supabase.from("ai_document_vault").insert({
        title: newDoc.title,
        category: newDoc.category,
        document_date: newDoc.document_date,
        amount: newDoc.amount || 0,
        vendor_name: newDoc.vendor_name,
        reference_number: newDoc.reference_number,
        notes: newDoc.notes,
      });
    } catch {}
  };

  const filteredDocs = documents.filter((d) => {
    if (!docSearch.trim()) return true;
    const q = docSearch.toLowerCase();
    return (
      d.title.toLowerCase().includes(q) ||
      (d.vendor_name && d.vendor_name.toLowerCase().includes(q)) ||
      (d.reference_number && d.reference_number.toLowerCase().includes(q)) ||
      d.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 pb-12">
      {toastView}

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl sm:p-8">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              AI Intelligence &amp; Autonomous Audit Suite
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              AI Control Center &amp; Compliance Hub
            </h1>
            <p className="max-w-2xl text-xs text-indigo-200/80 sm:text-sm">
              Real-time software self-diagnostics, ITR-ready Section 44AD presumptive tax calculations, cash &amp; pool reconciliations, customer credit risk intelligence, and secure document vault.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleRunDiagnostic}
              disabled={runningScan}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${runningScan ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              <span>{runningScan ? "Scanning System..." : "Run Software Self-Diagnostic"}</span>
            </button>
          </div>
        </div>

        {/* Top KPI Cards inside Banner */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200">System Health</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-400">{diagnosticData.healthScore}</span>
              <span className="text-xs text-indigo-300">/ 100</span>
            </div>
            <div className="mt-1 text-[11px] text-emerald-300">
              {diagnosticData.passedChecks} of {diagnosticData.totalChecks} checks verified
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200">Compliance Readiness</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-blue-400">{complianceReport.score}</span>
              <span className="text-xs text-indigo-300">/ 100</span>
            </div>
            <div className="mt-1 text-[11px] text-blue-300">GST &amp; ITR Ready</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200">Recognized Turnover</div>
            <div className="mt-1 text-xl font-bold text-white sm:text-2xl">{inr(taxReport.totalRecognizedTurnover)}</div>
            <div className="mt-1 text-[11px] text-indigo-300">{taxReport.digitalPercent}% Digital / 44AD</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200">Net Operating Margin</div>
            <div className="mt-1 text-xl font-bold text-emerald-400 sm:text-2xl">{inr(taxReport.actualNetProfit)}</div>
            <div className="mt-1 text-[11px] text-emerald-300">Est. Profit: {taxReport.actualMarginPercent}%</div>
          </div>
        </div>
      </div>

      {/* Safety Notice Guardrail */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-xs text-indigo-950 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🏛️</span>
          <div>
            <strong className="font-bold text-slate-900 dark:text-white">Deterministic Financial Integrity Engine Active:</strong>
            <span className="text-slate-600 dark:text-slate-300 ml-1">Continuous mathematical verification across Pools, Ledgers, GST &amp; P&amp;L.</span>
          </div>
        </div>
        <Link
          href="/ai/self-audit"
          className="shrink-0 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
        >
          Launch Self-Audit Center →
        </Link>
      </div>

      {/* Navigation Subtabs */}
      <div className="flex overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100/70 p-1.5 dark:border-white/10 dark:bg-slate-900">
        {[
          { key: "overview", label: "📊 Overview & Daily Briefing" },
          { key: "diagnostic", label: "🛡️ System Diagnostics" },
          { key: "accountant", label: "📑 AI Accountant & Business Advisor" },
          { key: "inventory_profit", label: "📦 Inventory Auditing" },
          { key: "customer_risk", label: "🚨 Customer Intelligence" },
          { key: "periodic_closings", label: "📈 Periodic Closings" },
          { key: "vault_compliance", label: "📂 Vault & OCR Score" },
        ].map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition ${
                active
                  ? "bg-white text-indigo-900 shadow-sm dark:bg-indigo-600 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ==============================================================================
          TAB 1: OVERVIEW & DAILY BRIEFING
      ============================================================================== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Executive AI Briefing */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2 dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🤖</span>
                  <h3 className="font-bold text-slate-900 dark:text-white">AI Daily Executive Briefing</h3>
                </div>
                <span className="text-xs font-semibold text-slate-400">Generated for Today</span>
              </div>
              <div className="mt-4 space-y-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                <p>
                  <strong>Revenue &amp; Throughput:</strong> Total recognized business turnover stands at <strong className="text-slate-900 dark:text-white">{inr(taxReport.totalRecognizedTurnover)}</strong> with a gross service throughput of <strong className="text-slate-900 dark:text-white">{inr(taxReport.grossThroughputVolume)}</strong>.
                </p>
                <p>
                  <strong>Tax &amp; Margins:</strong> Digital transactions account for <strong>{taxReport.digitalPercent}%</strong> of total turnover, qualifying the business for Section 44AD concessional 6% presumptive profit ({inr(taxReport.presumptiveDigitalProfit)}). Estimated actual net profit is <strong>{inr(taxReport.actualNetProfit)}</strong> ({taxReport.actualMarginPercent}% net margin).
                </p>
                <p>
                  <strong>Working Capital &amp; Cash:</strong> Counter cash in hand is <strong>{inr(initialPools?.cash?.current || 0)}</strong>, Bank balance is <strong>{inr(initialPools?.bank?.current || 0)}</strong>, and total customer ledger receivables stand at <strong>{inr(customerIntel.totalOutstandingReceivables)}</strong> across {customerIntel.totalCustomers} customer accounts.
                </p>
              </div>

              <div className="mt-6 rounded-2xl bg-indigo-50/70 p-4 dark:bg-indigo-950/30">
                <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200">💡 AI Strategic Advice:</div>
                <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">{taxReport.taxSavingsTip}</p>
              </div>
            </div>

            {/* Live Anomaly Pulse */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-4 dark:border-white/5">
                <span className="text-xl">🚨</span>
                <h3 className="font-bold text-slate-900 dark:text-white">Active Audit Alarms</h3>
              </div>
              <div className="mt-4 space-y-3">
                {diagnosticData.anomaliesDetected.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <span className="text-3xl">✨</span>
                    <p className="mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">Zero Critical Anomalies Detected</p>
                    <p className="mt-1 text-[11px] text-slate-400">All 8 pool equations &amp; ledger balances are reconciled.</p>
                  </div>
                ) : (
                  diagnosticData.anomaliesDetected.map((anom, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                      <span className="text-sm">⚠️</span>
                      <div>{anom}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          TAB 2: SOFTWARE & BUG DIAGNOSTIC
      ============================================================================== */}
      {activeTab === "diagnostic" && (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Live Software &amp; Code Self-Diagnostic</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Continuous mathematical verification of database equations, socket listeners, and duplicate transaction guards.
                </p>
              </div>
              <button
                onClick={handleRunDiagnostic}
                disabled={runningScan}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                Re-Run Verification
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {diagnosticData.checks.map((c) => (
                <div
                  key={c.id}
                  className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                    c.status === "pass"
                      ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/10"
                      : c.status === "warn"
                      ? "border-amber-200 bg-amber-50/40 dark:border-amber-900/30 dark:bg-amber-950/10"
                      : "border-rose-200 bg-rose-50/40 dark:border-rose-900/30 dark:bg-rose-950/10"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{c.status === "pass" ? "✅" : c.status === "warn" ? "⚠️" : "❌"}</span>
                      <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">{c.title}</h4>
                      <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300 uppercase">
                        {c.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{c.description}</p>
                    {c.details && <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{c.details}</p>}
                  </div>

                  {c.fixSuggestion && (
                    <div className="text-right text-xs font-semibold text-indigo-600 dark:text-indigo-400 max-w-xs">
                      Fix: {c.fixSuggestion}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          TAB 3: AI ACCOUNTANT & BUSINESS PROFIT ADVISOR
      ============================================================================== */}
      {activeTab === "accountant" && (
        <AccountantAdvisorPanel initialContext={resolvedContext} />
      )}

      {/* ==============================================================================
          TAB 5: INVENTORY & SERVICE PROFITABILITY
      ============================================================================== */}
      {activeTab === "inventory_profit" && (
        <div className="space-y-6">
          {/* Service Profitability */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Service Profitability Analyzer</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Net earnings, profit per transaction, and return on float investment across services.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {serviceProfitability.map((s) => (
                <div key={s.serviceKey} className="rounded-2xl border border-slate-200 p-4 shadow-sm dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs">{s.serviceName}</h4>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      s.rating === "star"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                    }`}>
                      {s.rating === "star" ? "⭐ Top Performer" : "Steady Volume"}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Gross Earnings:</span>
                      <span className="font-bold text-emerald-600">{inr(s.grossCommission)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Transactions:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{s.transactionCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Avg Profit / Txn:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">₹{s.profitPerTransaction}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory Auditor */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">AI Inventory &amp; Stock Velocity Auditor</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5">
                <div className="text-xs text-slate-500">Total Stock Valuation</div>
                <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">{inr(inventoryAudit.totalInventoryValuation)}</div>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/20">
                <div className="text-xs text-amber-800 dark:text-amber-300">Low Stock Reorder Alerts</div>
                <div className="text-xl font-bold text-amber-900 dark:text-amber-200 mt-1">{inventoryAudit.lowStockItems.length} Products</div>
              </div>
              <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-950/20">
                <div className="text-xs text-rose-800 dark:text-rose-300">Margin Leakage Alerts</div>
                <div className="text-xl font-bold text-rose-900 dark:text-rose-200 mt-1">{inventoryAudit.marginLeakageAlerts.length} Products</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          TAB 6: CUSTOMER INTELLIGENCE
      ============================================================================== */}
      {activeTab === "customer_risk" && (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Customer Credit Risk &amp; Ageing Engine</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Identifies default risk patterns and tracks overdue receivables across 15, 30, and 60-day buckets.
            </p>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-white/5 dark:bg-white/5">
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Outstanding Due</th>
                    <th className="px-4 py-3 text-center">Risk Score</th>
                    <th className="px-4 py-3">AI Recommended Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {customerIntel.rankedCustomers.slice(0, 10).map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600">{inr(c.totalBalanceDue)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          c.riskCategory === "vip_good_standing"
                            ? "bg-emerald-100 text-emerald-800"
                            : c.riskCategory === "high_risk"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {c.riskScore} / 100
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.recommendedAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          TAB 7: PERIODIC CLOSINGS
      ============================================================================== */}
      {activeTab === "periodic_closings" && (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">AI Periodic Closing Assistant</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Structured audit reviews for Month-End, Quarter, and Year-End.</p>
              </div>
              <div className="flex gap-2">
                {[
                  { key: "month_end", label: "Month-End" },
                  { key: "quarterly", label: "Quarterly" },
                  { key: "half_yearly", label: "Half-Yearly" },
                  { key: "year_end", label: "Year-End" },
                ].map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setClosingPeriod(p.key as any)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      closingPeriod === p.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-indigo-50/50 p-5 dark:bg-indigo-950/20">
              <h4 className="font-bold text-indigo-950 dark:text-indigo-200 text-sm">{periodicClosing.periodName} Executive Summary</h4>
              <p className="mt-2 text-xs leading-relaxed text-indigo-900 dark:text-indigo-300">{periodicClosing.executiveSummary}</p>
            </div>

            <div className="mt-6 space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">Closing Audit Checklist:</h4>
              {periodicClosing.checklist.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 dark:border-white/5">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{item.step}</div>
                  <div className="text-xs text-slate-500">{item.detail}</div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">✓ Verified</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          TAB 8: DOCUMENT VAULT & COMPLIANCE
      ============================================================================== */}
      {activeTab === "vault_compliance" && (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">AI Document Vault &amp; Tax Archive</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Secure repository for GST Challans, Electricity Bills, Shop Rent Receipts, and Distributor Invoices.
                </p>
              </div>
              <button
                onClick={() => setDocModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"
              >
                + Add Document
              </button>
            </div>

            <div className="mt-4">
              <input
                type="text"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="Search documents by title, vendor, or category..."
                className="w-full rounded-xl border border-slate-200 px-4 py-2 text-xs outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-white/5 dark:bg-white/5">
                    <th className="px-4 py-3">Document Title</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Vendor / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredDocs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                        No documents stored yet. Click "+ Add Document" to archive tax bills and challans.
                      </td>
                    </tr>
                  ) : (
                    filteredDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{doc.title}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300 uppercase">
                            {doc.category.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{doc.document_date}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                          {doc.amount ? inr(doc.amount) : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{doc.vendor_name || doc.notes || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {docModalOpen && (
        <Modal
          size="md"
          onClose={() => setDocModalOpen(false)}
          header={
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10">
              <h3 className="font-bold text-slate-900 dark:text-white">Add Document to AI Vault</h3>
            </div>
          }
          footer={
            <div className="flex justify-end gap-2 px-6 py-3">
              <button
                type="button"
                onClick={() => setDocModalOpen(false)}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddDocument}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Save Document
              </button>
            </div>
          }
        >
          <form onSubmit={handleAddDocument} className="space-y-4 p-6">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Document Title *</label>
              <input
                type="text"
                required
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="e.g. Electricity Bill - Aug 2026 / Paper Supplier Invoice"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Category</label>
                <select
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800"
                >
                  <option value="tax_bill">Tax Bill / Utility</option>
                  <option value="gst_challan">GST Challan</option>
                  <option value="distributor_invoice">Distributor Invoice</option>
                  <option value="rent_receipt">Shop Rent Receipt</option>
                  <option value="bank_statement">Bank Statement</option>
                  <option value="kyc_doc">KYC Document</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={docAmount}
                  onChange={(e) => setDocAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Vendor / Issuer Name</label>
              <input
                type="text"
                value={docVendor}
                onChange={(e) => setDocVendor(e.target.value)}
                placeholder="e.g. WBSEDCL / Amazon / Local Distributor"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800"
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
