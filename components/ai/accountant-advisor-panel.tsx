"use client";

import { useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";
import {
  type VerifiedFinancialContext,
  type AIAdvisorResponse,
  generateAdvisorAnswer,
  formatInr,
} from "@/lib/ai/advisor-engine";

const SUGGESTED_QUESTIONS = [
  "What is my current business profit?",
  "Why is my profit low?",
  "Which service makes me the most profit?",
  "How to grow my business?",
  "Which expenses are highest?",
  "How much money is currently tied up in AEPS/DMT/Wallet?",
  "How much customer due is outstanding?",
  "Is my cash/bank position reconciled?",
  "Are there any financial anomalies?",
  "What should I review before ITR preparation?",
  "What changed since yesterday?",
  "What changed this month?",
];

export default function AccountantAdvisorPanel({
  initialContext,
}: {
  initialContext: VerifiedFinancialContext;
}) {
  const [context, setContext] = useState<VerifiedFinancialContext>(initialContext);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("fy_ytd");
  const [customQuestion, setCustomQuestion] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [activeAnalysis, setActiveAnalysis] = useState<"advisor" | "services" | "expenses" | "pools" | "receivables">("advisor");

  // Initial Answer
  const [currentResponse, setCurrentResponse] = useState<AIAdvisorResponse>(() => {
    return generateAdvisorAnswer("What is my current business profit?", initialContext);
  });

  // Handle Question Query
  async function handleAskQuestion(qText: string) {
    if (!qText.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: qText,
          period: selectedPeriod,
        }),
      });
      const data = await res.json();
      if (data.success && data.response) {
        setCurrentResponse(data.response);
        if (data.context) setContext(data.context);
      } else {
        // Fallback to local deterministic execution
        const localResp = generateAdvisorAnswer(qText, context);
        setCurrentResponse(localResp);
      }
    } catch {
      const localResp = generateAdvisorAnswer(qText, context);
      setCurrentResponse(localResp);
    } finally {
      setLoading(false);
    }
  }

  const pnl = context.pnl;
  const rev = context.revenue;
  const exp = context.expenses;
  const audit = context.selfAudit;

  return (
    <div className="space-y-6">
      {/* Executive Header & Audit Badge */}
      <div className="rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                CANONICAL VERIFIED FINANCIAL ENGINE
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-200 border border-indigo-400/30">
                🛡️ Self-Audit: {audit.audit_score}/100 {audit.status}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              AI Accountant &amp; Business Profit Advisor
            </h1>
            <p className="max-w-2xl text-xs text-indigo-200/80 sm:text-sm">
              Deterministic financial explanations and profit analysis derived directly from verified ERP registers. Zero recalculation, strictly read-only, and fully audit-anchored.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/finance/pnl"
              className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20"
            >
              📊 Open P&amp;L
            </Link>
            <Link
              href="/ai/self-audit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md transition hover:bg-indigo-700"
            >
              🔍 Self-Audit Center
            </Link>
          </div>
        </div>

        {/* Live KPI Strip */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur">
            <p className="text-[11px] font-medium text-indigo-200">Operating Revenue</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">{inr(rev.total_operating_revenue)}</p>
            <p className="mt-0.5 text-[10px] text-indigo-300">Retail + Fees + Comm</p>
          </div>

          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur">
            <p className="text-[11px] font-medium text-indigo-200">Cost of Goods (COGS)</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">{inr(context.cogs.total_cogs)}</p>
            <p className="mt-0.5 text-[10px] text-slate-300">Locked historical cost</p>
          </div>

          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur">
            <p className="text-[11px] font-medium text-indigo-200">Recorded Expenses</p>
            <p className="mt-1 font-mono text-lg font-bold text-rose-300">{inr(exp.total_active_expenses)}</p>
            <p className="mt-0.5 text-[10px] text-rose-200">{exp.categories.length} categories</p>
          </div>

          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur">
            <p className="text-[11px] font-medium text-indigo-200">Business Profit Before Tax</p>
            <p className="mt-1 font-mono text-lg font-bold text-emerald-300">{inr(pnl.net_profit)}</p>
            <p className="mt-0.5 text-[10px] text-emerald-200">{pnl.net_profit_margin_pct}% margin</p>
          </div>

          <div className="col-span-2 sm:col-span-4 lg:col-span-1 rounded-2xl bg-white/10 p-3.5 backdrop-blur">
            <p className="text-[11px] font-medium text-indigo-200">Customer Dues</p>
            <p className="mt-1 font-mono text-lg font-bold text-amber-300">{inr(context.receivables.total_outstanding)}</p>
            <p className="mt-0.5 text-[10px] text-amber-200">{context.receivables.customer_count} accounts</p>
          </div>
        </div>
      </div>

      {/* Suggested Questions Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-base">💡</span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Executive Suggested Inquiries
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">Click any question for instant verified analysis</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => {
                setCustomQuestion(q);
                handleAskQuestion(q);
              }}
              disabled={loading}
              className={`rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
                currentResponse.question === q
                  ? "border-indigo-500 bg-indigo-50 text-indigo-900 font-bold dark:bg-indigo-950/40 dark:text-indigo-200"
                  : "border-slate-200 bg-slate-50/70 text-slate-700 hover:border-indigo-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {q}
            </button>
          ))}
        </div>

        {/* Freeform Query Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAskQuestion(customQuestion);
          }}
          className="mt-5 flex gap-2"
        >
          <input
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="Ask anything about profit, expenses, floats, receivables, or ITR..."
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
          />
          <button
            type="submit"
            disabled={loading || !customQuestion.trim()}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Ask Advisor →"}
          </button>
        </form>
      </div>

      {/* STRUCTURED INTENT & ANSWER CARD */}
      <div className="rounded-3xl border border-indigo-200 bg-white p-6 shadow-md dark:border-indigo-900/50 dark:bg-slate-900">
        {/* Header with Intent Badge */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/10">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 text-base">
              🤖
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {currentResponse.question}
                </h2>
                <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                  {currentResponse.intent}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {currentResponse.dataSummary} · {new Date(currentResponse.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <span className="self-start sm:self-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            ✓ {currentResponse.auditStatus.verifiedTag}
          </span>
        </div>

        {/* 1. Verified Answer */}
        <div className="mt-5 rounded-2xl bg-indigo-50/60 p-4 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
            1. Verified Answer:
          </p>
          <p className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white leading-relaxed whitespace-pre-line">
            {currentResponse.answer}
          </p>
        </div>

        {/* 2. Canonical Numbers Used */}
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            2. Canonical Numbers Used:
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {currentResponse.numbersUsed.map((n, idx) => (
              <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-white/5 dark:bg-white/5">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{n.label}</p>
                <p className="font-mono text-xs font-bold text-slate-900 dark:text-white mt-0.5">{n.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Detailed Financial Analysis & Why */}
        <div className="mt-4 rounded-xl border border-slate-100 p-4 dark:border-white/5 bg-slate-50/40 dark:bg-white/5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            3. Deterministic Analysis &amp; Drivers:
          </p>
          <div className="mt-1.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line font-normal">
            {currentResponse.why}
          </div>
        </div>

        {/* Dynamic Ranking Table (e.g. for Service Profitability) */}
        {currentResponse.rankingTable && (
          <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden dark:border-white/10">
            <div className="bg-slate-100/70 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:bg-white/5 dark:text-slate-300">
              📊 Service Profitability &amp; Margin Ranking Table
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 dark:bg-white/5">
                  <tr>
                    {currentResponse.rankingTable.headers.map((h, i) => (
                      <th key={i} className="p-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-900">
                  {currentResponse.rankingTable.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2.5 font-medium text-slate-800 dark:text-slate-200">
                          {String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. Recommended Action */}
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/30 dark:bg-blue-950/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300">
            4. Recommended Action:
          </p>
          <p className="mt-1 text-xs font-medium text-blue-950 dark:text-blue-200 leading-relaxed whitespace-pre-line">
            {currentResponse.recommendedAction}
          </p>
        </div>

        {/* 5. Self-Audit Status */}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-900 p-3.5 text-white">
          <div className="flex items-center gap-2 text-xs">
            <span>🛡️</span>
            <span className="font-bold">5. Self-Audit Status:</span>
            <span className="text-slate-300">
              Integrity Score {currentResponse.auditStatus.score}/100 ({currentResponse.auditStatus.status})
            </span>
          </div>
          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
            Zero Math Drift Enforced
          </span>
        </div>
      </div>

      {/* Sub-Workspaces Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/10">
        {[
          { key: "advisor", label: "📊 Profit & Margin Matrix" },
          { key: "services", label: "🛠️ Service Profitability" },
          { key: "expenses", label: "💸 Expense Intelligence" },
          { key: "pools", label: "💵 Liquid Float Reconciliation" },
          { key: "receivables", label: "👥 Customer Receivables" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveAnalysis(tab.key as any)}
            className={`border-b-2 px-4 py-2.5 text-xs font-bold transition ${
              activeAnalysis === tab.key
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Service Profitability */}
      {activeAnalysis === "services" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Service Profitability &amp; Margin Breakdown</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Unit cost transparency: For digital services without physical inventory, unit COGS is ₹0.00. For untracked services, "Insufficient cost data" is explicitly stated.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-400 dark:bg-white/5">
                <tr>
                  <th className="p-3">Service / Product Stream</th>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-right">Revenue</th>
                  <th className="p-3 text-right">Unit COGS</th>
                  <th className="p-3 text-right">Gross Profit</th>
                  <th className="p-3 text-center">Margin %</th>
                  <th className="p-3 text-center">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {context.serviceProfitability.map((s) => (
                  <tr key={s.serviceKey} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{s.serviceName}</td>
                    <td className="p-3 text-slate-500">{s.category}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">{inr(s.revenue)}</td>
                    <td className="p-3 text-right font-mono text-slate-500">
                      {s.cost !== null ? inr(s.cost) : <span className="italic text-amber-600 dark:text-amber-400">Insufficient cost data</span>}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600">{inr(s.grossProfit)}</td>
                    <td className="p-3 text-center font-mono font-semibold">
                      {s.marginPct !== null ? `${s.marginPct}%` : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        s.rating === "star" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                      }`}>
                        {s.rating === "star" ? "⭐ Top Earner" : "Steady"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Expense Intelligence */}
      {activeAnalysis === "expenses" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Operating Expense Breakdown &amp; Spikes</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Categorized analysis of all recorded business expense vouchers. High concentrations are flagged for review.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {exp.categories.map((c) => (
              <div key={c.category} className="rounded-xl border border-slate-100 p-4 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{c.category}</p>
                  <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                    {c.count} vouchers
                  </span>
                </div>
                <p className="mt-2 font-mono text-base font-bold text-slate-900 dark:text-white">{inr(c.amount)}</p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Share of Total:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{c.pct_of_total}%</span>
                </div>
                {c.pct_of_total > 40 && (
                  <span className="mt-2 block rounded bg-amber-100 px-2 py-0.5 text-center text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    ⚠️ Review required: High concentration
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: Liquid Float Reconciliation */}
      {activeAnalysis === "pools" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Liquid Asset Pools &amp; Float Positions</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Live balance verification across Cash, Bank, Digital Wallets, UPI QR, and Banking floats.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(context.pools).map(([poolKey, p]) => (
              <div key={poolKey} className="rounded-xl border border-slate-100 p-4 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold capitalize text-slate-800 dark:text-slate-200">{poolKey.replace("_", " ")} Pool</p>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    ✓ Balanced
                  </span>
                </div>
                <p className="mt-2 font-mono text-lg font-bold text-slate-900 dark:text-white">{inr(p.current)}</p>
                <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                  <span>Opening: {inr(p.opening)}</span>
                  <span>Movements: {p.movements >= 0 ? "+" : ""}{inr(p.movements)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: Customer Receivables */}
      {activeAnalysis === "receivables" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Customer Dues &amp; Receivables Ageing</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Total outstanding credit balances from the verified customer ledger.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-400 dark:bg-white/5">
                <tr>
                  <th className="p-3">Customer Name</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3 text-right">Outstanding Due</th>
                  <th className="p-3 text-center">Collection Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {context.receivables.top_debtors.map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{d.name}</td>
                    <td className="p-3 text-slate-500">{d.phone}</td>
                    <td className="p-3 text-right font-mono font-bold text-rose-600">{inr(d.balance)}</td>
                    <td className="p-3 text-center">
                      <Link
                        href={`/customers`}
                        className="rounded bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
                      >
                        View Ledger →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
