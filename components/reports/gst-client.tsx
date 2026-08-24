"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inr } from "@/lib/format";
import Link from "next/link";

interface GstReportClientProps {
  initialData: any;
  startDate: string;
  endDate: string;
  period: string;
  settings: any;
  error: string | null;
}

export default function GstReportClient({
  initialData,
  startDate,
  endDate,
  period,
  settings,
  error,
}: GstReportClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"sales" | "b2b" | "b2c" | "cn" | "hsn" | "gstr3b" | "export">("sales");
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);

  const summary = initialData?.summary || {
    total_taxable_value: 0,
    total_cgst: 0,
    total_sgst: 0,
    total_igst: 0,
    total_output_tax: 0,
    total_invoice_value: 0,
    credit_notes_taxable_reversed: 0,
    credit_notes_tax_reversed: 0,
    net_taxable_value: 0,
    net_output_tax_liability: 0,
  };

  const b2bSupplies = initialData?.b2b_supplies || [];
  const b2cSupplies = initialData?.b2c_supplies || [];
  const creditNotes = initialData?.credit_notes || [];
  const hsnSummary = initialData?.hsn_summary || [];

  function handlePeriodChange(p: string) {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;

    let start = "";
    let end = "";

    if (p === "fy-current") {
      start = `${fyStartYear}-04-01`;
      end = `${fyStartYear + 1}-03-31`;
    } else if (p === "fy-prev") {
      start = `${fyStartYear - 1}-04-01`;
      end = `${fyStartYear}-03-31`;
    } else if (p === "this-month") {
      const ym = today.toISOString().slice(0, 7);
      start = `${ym}-01`;
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
    } else if (p === "custom") {
      start = customStart;
      end = customEnd;
    }

    router.push(`/reports/gst?start=${start}&end=${end}&period=${p}`);
  }

  function downloadCsv(data: any[], filename: string, headers: string[], rowMapper: (item: any) => (string | number)[]) {
    const csvRows = [
      headers.join(","),
      ...data.map((item) =>
        rowMapper(item)
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header & GST Profile Card */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
              GST COMPLIANCE ENGINE
            </span>
            <span className="text-xs text-slate-500 font-medium">GSTR-1 &amp; GSTR-3B Ready</span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
            GST Tax &amp; Outward Supplies Report
          </h1>
          <p className="text-sm text-slate-500">
            Deterministic statutory tax reconciliation and outward supply schedules for accounting audit.
          </p>
        </div>

        {/* GSTIN Profile Badge */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Supplier GSTIN</p>
            <p className="font-mono text-xs font-bold text-slate-900">
              {settings?.gstin || "NOT CONFIGURED"}
            </p>
          </div>
        </div>
      </div>

      {/* Warning / Error Alert */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span className="font-bold">Error generating GST report:</span> {error}
        </div>
      )}

      {/* Statutory Disclaimer Banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex items-start gap-3">
        <svg className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p>
          <span className="font-bold">Statutory Accounting Note:</span> This report aggregates recorded taxable turnover, output tax liabilities, and credit notes from ERP transaction records. Final GST liability determination and monthly GSTR-3B / GSTR-1 filings must be audited and submitted by your authorized tax practitioner on the official GST portal.
        </p>
      </div>

      {/* Date / Period Filter Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => handlePeriodChange("fy-current")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              period === "fy-current" || period === "fy"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            FY 2026-27 (YTD)
          </button>
          <button
            onClick={() => handlePeriodChange("this-month")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              period === "this-month"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => handlePeriodChange("fy-prev")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              period === "fy-prev"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            FY 2025-26
          </button>
        </div>

        <div className="h-5 w-px bg-slate-200 hidden sm:block" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">From:</span>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
          />
          <span className="text-xs text-slate-500 font-medium">To:</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={() => handlePeriodChange("custom")}
            className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white hover:bg-slate-800 transition-all"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Metric KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Taxable Turnover</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{inr(summary.total_taxable_value)}</p>
          <p className="mt-1 text-[11px] text-slate-500">Gross taxable outward base</p>
        </div>

        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">Central Tax (CGST)</p>
          <p className="mt-1 text-2xl font-black text-indigo-900">{inr(summary.total_cgst)}</p>
          <p className="mt-1 text-[11px] text-indigo-700">Intra-state Central component</p>
        </div>

        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-purple-500">State Tax (SGST)</p>
          <p className="mt-1 text-2xl font-black text-purple-900">{inr(summary.total_sgst)}</p>
          <p className="mt-1 text-[11px] text-purple-700">Intra-state State component</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Total Output Tax Liability</p>
          <p className="mt-1 text-2xl font-black text-emerald-900">{inr(summary.total_output_tax)}</p>
          <p className="mt-1 text-[11px] text-emerald-700">CGST + SGST + IGST liability</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-4 overflow-x-auto">
          {[
            { id: "sales", label: "Sales Register" },
            { id: "b2b", label: `B2B Supplies (${b2bSupplies.length})` },
            { id: "b2c", label: `B2C Supplies (${b2cSupplies.length})` },
            { id: "cn", label: `Credit Notes (${creditNotes.length})` },
            { id: "hsn", label: `HSN/SAC Summary (${hsnSummary.length})` },
            { id: "gstr3b", label: "GSTR-3B Tax Summary" },
            { id: "export", label: "📥 Accountant Export Center" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-xs font-bold transition-all ${
                activeTab === t.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab 1: Sales Register */}
      {activeTab === "sales" && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Outward Sales Register</h3>
              <p className="text-xs text-slate-500">Itemized invoice ledger with taxable value and tax breakdowns.</p>
            </div>
            <div className="text-xs font-medium text-slate-600">
              Total Invoices: <span className="font-bold text-slate-900">{b2bSupplies.length + (b2cSupplies.reduce((s: number, r: any) => s + Number(r.invoice_count || 0), 0) || 0)}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold">
                <tr>
                  <th className="py-2.5 px-3">Tax Metric</th>
                  <th className="py-2.5 px-3 text-right">Taxable Turnover</th>
                  <th className="py-2.5 px-3 text-right">CGST</th>
                  <th className="py-2.5 px-3 text-right">SGST</th>
                  <th className="py-2.5 px-3 text-right">IGST</th>
                  <th className="py-2.5 px-3 text-right">Total Output Tax</th>
                  <th className="py-2.5 px-3 text-right">Total Invoice Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-bold text-slate-900">Gross Outward Supplies</td>
                  <td className="py-2.5 px-3 text-right font-medium">{inr(summary.total_taxable_value)}</td>
                  <td className="py-2.5 px-3 text-right text-indigo-700 font-semibold">{inr(summary.total_cgst)}</td>
                  <td className="py-2.5 px-3 text-right text-purple-700 font-semibold">{inr(summary.total_sgst)}</td>
                  <td className="py-2.5 px-3 text-right text-amber-700 font-semibold">{inr(summary.total_igst)}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">{inr(summary.total_output_tax)}</td>
                  <td className="py-2.5 px-3 text-right font-black text-slate-900">{inr(summary.total_invoice_value)}</td>
                </tr>
                <tr className="hover:bg-slate-50 bg-rose-50/30">
                  <td className="py-2.5 px-3 font-bold text-rose-700">Less: Credit Notes (Returns)</td>
                  <td className="py-2.5 px-3 text-right text-rose-700">- {inr(summary.credit_notes_taxable_reversed)}</td>
                  <td className="py-2.5 px-3 text-right text-rose-700">- {inr(0)}</td>
                  <td className="py-2.5 px-3 text-right text-rose-700">- {inr(0)}</td>
                  <td className="py-2.5 px-3 text-right text-rose-700">- {inr(0)}</td>
                  <td className="py-2.5 px-3 text-right text-rose-700 font-bold">- {inr(summary.credit_notes_tax_reversed)}</td>
                  <td className="py-2.5 px-3 text-right text-rose-700 font-bold">- {inr(summary.credit_notes_taxable_reversed + summary.credit_notes_tax_reversed)}</td>
                </tr>
                <tr className="bg-slate-900 text-white font-bold">
                  <td className="py-3 px-3">Net Outward Tax Base</td>
                  <td className="py-3 px-3 text-right">{inr(summary.net_taxable_value)}</td>
                  <td className="py-3 px-3 text-right text-indigo-300">{inr(summary.total_cgst)}</td>
                  <td className="py-3 px-3 text-right text-purple-300">{inr(summary.total_sgst)}</td>
                  <td className="py-3 px-3 text-right text-amber-300">{inr(summary.total_igst)}</td>
                  <td className="py-3 px-3 text-right text-emerald-300 font-black">{inr(summary.net_output_tax_liability)}</td>
                  <td className="py-3 px-3 text-right font-black">{inr(summary.net_taxable_value + summary.net_output_tax_liability)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: B2B Supplies (GSTR-1 Table 4A) */}
      {activeTab === "b2b" && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">GSTR-1 Table 4A: B2B Invoices</h3>
              <p className="text-xs text-slate-500">Taxable supplies made to registered persons holding a valid GSTIN.</p>
            </div>
            <button
              onClick={() =>
                downloadCsv(
                  b2bSupplies,
                  "GSTR1_Table4A_B2B",
                  ["Invoice No", "Date", "Customer Name", "Customer GSTIN", "Place of Supply", "Taxable Value", "CGST", "SGST", "IGST", "Invoice Total"],
                  (r) => [r.invoice_number, r.invoice_date, r.customer_name, r.customer_gstin, r.place_of_supply, r.total_taxable_value, r.total_cgst, r.total_sgst, r.total_igst, r.invoice_value]
                )
              }
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              📥 Download CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold">
                <tr>
                  <th className="py-2.5 px-3">Invoice No</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Customer / Buyer</th>
                  <th className="py-2.5 px-3">Recipient GSTIN</th>
                  <th className="py-2.5 px-3">Place of Supply</th>
                  <th className="py-2.5 px-3 text-right">Taxable Value</th>
                  <th className="py-2.5 px-3 text-right">CGST</th>
                  <th className="py-2.5 px-3 text-right">SGST</th>
                  <th className="py-2.5 px-3 text-right">Total Tax</th>
                  <th className="py-2.5 px-3 text-right">Invoice Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {b2bSupplies.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-bold text-slate-900">{r.invoice_number}</td>
                    <td className="py-2 px-3 text-slate-600">{r.invoice_date}</td>
                    <td className="py-2 px-3 font-medium text-slate-800">{r.customer_name || "B2B Customer"}</td>
                    <td className="py-2 px-3 font-mono text-indigo-700 font-bold">{r.customer_gstin}</td>
                    <td className="py-2 px-3 text-slate-600">{r.place_of_supply}</td>
                    <td className="py-2 px-3 text-right font-medium">{inr(r.total_taxable_value)}</td>
                    <td className="py-2 px-3 text-right text-indigo-600">{inr(r.total_cgst)}</td>
                    <td className="py-2 px-3 text-right text-purple-600">{inr(r.total_sgst)}</td>
                    <td className="py-2 px-3 text-right text-emerald-700 font-bold">{inr(r.total_tax)}</td>
                    <td className="py-2 px-3 text-right font-black text-slate-900">{inr(r.invoice_value)}</td>
                  </tr>
                ))}
                {b2bSupplies.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      No B2B invoices recorded in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: B2C Supplies (GSTR-1 Table 7) */}
      {activeTab === "b2c" && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">GSTR-1 Table 7: B2C Small Supplies</h3>
              <p className="text-xs text-slate-500">Retail counter supplies to unregistered consumers grouped by GST rate.</p>
            </div>
            <button
              onClick={() =>
                downloadCsv(
                  b2cSupplies,
                  "GSTR1_Table7_B2C",
                  ["Place of Supply", "Supply Type", "GST Rate %", "Taxable Value", "CGST", "SGST", "IGST", "Total Tax", "Invoice Count"],
                  (r) => [r.place_of_supply, r.supply_type, r.gst_rate, r.taxable_value, r.total_cgst, r.total_sgst, r.total_igst, r.total_tax, r.invoice_count]
                )
              }
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              📥 Download CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold">
                <tr>
                  <th className="py-2.5 px-3">Place of Supply</th>
                  <th className="py-2.5 px-3">Supply Type</th>
                  <th className="py-2.5 px-3 text-center">GST Rate</th>
                  <th className="py-2.5 px-3 text-right">Taxable Value</th>
                  <th className="py-2.5 px-3 text-right">CGST</th>
                  <th className="py-2.5 px-3 text-right">SGST</th>
                  <th className="py-2.5 px-3 text-right">IGST</th>
                  <th className="py-2.5 px-3 text-right">Total Output Tax</th>
                  <th className="py-2.5 px-3 text-center">Invoices</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {b2cSupplies.map((r: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-semibold text-slate-900">{r.place_of_supply}</td>
                    <td className="py-2 px-3 uppercase text-slate-600">{r.supply_type?.replace('_', ' ')}</td>
                    <td className="py-2 px-3 text-center font-bold text-indigo-700">{r.gst_rate}%</td>
                    <td className="py-2 px-3 text-right font-medium">{inr(r.taxable_value)}</td>
                    <td className="py-2 px-3 text-right text-indigo-600">{inr(r.total_cgst)}</td>
                    <td className="py-2 px-3 text-right text-purple-600">{inr(r.total_sgst)}</td>
                    <td className="py-2 px-3 text-right text-amber-600">{inr(r.total_igst)}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700">{inr(r.total_tax)}</td>
                    <td className="py-2 px-3 text-center font-mono text-slate-700">{r.invoice_count}</td>
                  </tr>
                ))}
                {b2cSupplies.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      No B2C supplies recorded in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Credit Notes (GSTR-1 Table 9B) */}
      {activeTab === "cn" && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">GSTR-1 Table 9B: Credit &amp; Debit Notes</h3>
              <p className="text-xs text-slate-500">Sales returns and credit notes issued against original tax invoices.</p>
            </div>
            <button
              onClick={() =>
                downloadCsv(
                  creditNotes,
                  "GSTR1_Table9B_CreditNotes",
                  ["Credit Note No", "Date", "Original Invoice No", "Original Invoice Date", "Customer Name", "Customer GSTIN", "Taxable Reversed", "CGST Reversed", "SGST Reversed", "IGST Reversed", "Refund Amount"],
                  (r) => [r.credit_note_number, r.credit_note_date, r.original_invoice_number, r.original_invoice_date, r.customer_name, r.customer_gstin, r.taxable_value_reversed, r.cgst_reversed, r.sgst_reversed, r.igst_reversed, r.total_refund_amount]
                )
              }
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              📥 Download CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold">
                <tr>
                  <th className="py-2.5 px-3">Credit Note No</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Original Invoice</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3 text-right">Taxable Reversed</th>
                  <th className="py-2.5 px-3 text-right">Tax Reversed</th>
                  <th className="py-2.5 px-3 text-right">Refund Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {creditNotes.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-bold text-rose-700">{r.credit_note_number}</td>
                    <td className="py-2 px-3 text-slate-600">{r.credit_note_date}</td>
                    <td className="py-2 px-3 font-mono text-slate-800">
                      {r.original_invoice_number} ({r.original_invoice_date})
                    </td>
                    <td className="py-2 px-3 text-slate-700">{r.customer_name || "Walk-in"}</td>
                    <td className="py-2 px-3 text-right text-rose-700 font-medium">- {inr(r.taxable_value_reversed)}</td>
                    <td className="py-2 px-3 text-right text-rose-700 font-bold">- {inr(r.total_tax_reversed)}</td>
                    <td className="py-2 px-3 text-right font-black text-slate-900">{inr(r.total_refund_amount)}</td>
                  </tr>
                ))}
                {creditNotes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No credit notes issued in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: HSN/SAC Summary (GSTR-1 Table 12) */}
      {activeTab === "hsn" && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">GSTR-1 Table 12: HSN / SAC Summary</h3>
              <p className="text-xs text-slate-500">Summary of outward supplies grouped by Harmonized System Nomenclature (HSN) and Service Accounting Codes (SAC).</p>
            </div>
            <button
              onClick={() =>
                downloadCsv(
                  hsnSummary,
                  "GSTR1_Table12_HSN_SAC",
                  ["HSN/SAC Code", "Description", "UQC", "Total Qty", "GST Rate %", "Total Taxable Value", "CGST", "SGST", "IGST", "Total Tax"],
                  (r) => [r.hsn_sac, r.description, r.uqc, r.total_qty, r.gst_rate, r.total_taxable_value, r.total_cgst, r.total_sgst, r.total_igst, r.total_tax]
                )
              }
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              📥 Download CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold">
                <tr>
                  <th className="py-2.5 px-3">HSN / SAC</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3 text-center">UQC</th>
                  <th className="py-2.5 px-3 text-center">Total Qty</th>
                  <th className="py-2.5 px-3 text-center">Rate</th>
                  <th className="py-2.5 px-3 text-right">Taxable Value</th>
                  <th className="py-2.5 px-3 text-right">CGST</th>
                  <th className="py-2.5 px-3 text-right">SGST</th>
                  <th className="py-2.5 px-3 text-right">Total Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hsnSummary.map((r: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-bold text-slate-900">{r.hsn_sac || "OTHER"}</td>
                    <td className="py-2 px-3 font-medium text-slate-800">{r.description}</td>
                    <td className="py-2 px-3 text-center text-slate-500 font-mono">{r.uqc}</td>
                    <td className="py-2 px-3 text-center font-bold text-slate-700">{Number(r.total_qty)}</td>
                    <td className="py-2 px-3 text-center font-bold text-indigo-700">{r.gst_rate}%</td>
                    <td className="py-2 px-3 text-right font-medium">{inr(r.total_taxable_value)}</td>
                    <td className="py-2 px-3 text-right text-indigo-600">{inr(r.total_cgst)}</td>
                    <td className="py-2 px-3 text-right text-purple-600">{inr(r.total_sgst)}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700">{inr(r.total_tax)}</td>
                  </tr>
                ))}
                {hsnSummary.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      No HSN items recorded in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: GSTR-3B Tax Summary */}
      {activeTab === "gstr3b" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">GSTR-3B Box 3.1: Details of Outward Supplies</h3>
            <p className="text-xs text-slate-500 mt-0.5">Summary tax liability computation for monthly return filing.</p>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold">
                  <tr>
                    <th className="py-3 px-4">Nature of Supplies</th>
                    <th className="py-3 px-4 text-right">Total Taxable Value</th>
                    <th className="py-3 px-4 text-right">Integrated Tax (IGST)</th>
                    <th className="py-3 px-4 text-right">Central Tax (CGST)</th>
                    <th className="py-3 px-4 text-right">State Tax (SGST)</th>
                    <th className="py-3 px-4 text-right">Cess</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      (a) Outward taxable supplies (other than zero rated, nil rated and exempted)
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">{inr(summary.net_taxable_value)}</td>
                    <td className="py-3 px-4 text-right font-medium text-amber-700">{inr(summary.total_igst)}</td>
                    <td className="py-3 px-4 text-right font-medium text-indigo-700">{inr(summary.total_cgst)}</td>
                    <td className="py-3 px-4 text-right font-medium text-purple-700">{inr(summary.total_sgst)}</td>
                    <td className="py-3 px-4 text-right text-slate-400">₹0.00</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-600">(b) Outward taxable supplies (zero rated)</td>
                    <td className="py-3 px-4 text-right text-slate-400">₹0.00</td>
                    <td className="py-3 px-4 text-right text-slate-400">₹0.00</td>
                    <td className="py-3 px-4 text-right text-slate-400">₹0.00</td>
                    <td className="py-3 px-4 text-right text-slate-400">₹0.00</td>
                    <td className="py-3 px-4 text-right text-slate-400">₹0.00</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-600">(c) Other outward supplies (Nil rated, exempted)</td>
                    <td className="py-3 px-4 text-right text-slate-400">₹0.00</td>
                    <td className="py-3 px-4 text-right text-slate-400">-</td>
                    <td className="py-3 px-4 text-right text-slate-400">-</td>
                    <td className="py-3 px-4 text-right text-slate-400">-</td>
                    <td className="py-3 px-4 text-right text-slate-400">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: Accountant Export Center */}
      {activeTab === "export" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h4 className="text-sm font-bold text-slate-900">GSTR-1 Outward Supplies Package</h4>
            <p className="text-xs text-slate-500">
              Download separate statutory CSV files for B2B, B2C, Credit Notes, and HSN Summaries.
            </p>
            <div className="space-y-2 pt-2">
              <button
                onClick={() =>
                  downloadCsv(
                    b2bSupplies,
                    "GSTR1_Table4A_B2B",
                    ["Invoice No", "Date", "Customer Name", "Customer GSTIN", "Place of Supply", "Taxable Value", "CGST", "SGST", "IGST", "Invoice Total"],
                    (r) => [r.invoice_number, r.invoice_date, r.customer_name, r.customer_gstin, r.place_of_supply, r.total_taxable_value, r.total_cgst, r.total_sgst, r.total_igst, r.invoice_value]
                  )
                }
                className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all"
              >
                <span>📄 Table 4A: B2B Invoices CSV</span>
                <span>Download</span>
              </button>
              <button
                onClick={() =>
                  downloadCsv(
                    b2cSupplies,
                    "GSTR1_Table7_B2C",
                    ["Place of Supply", "Supply Type", "GST Rate %", "Taxable Value", "CGST", "SGST", "IGST", "Total Tax", "Invoice Count"],
                    (r) => [r.place_of_supply, r.supply_type, r.gst_rate, r.taxable_value, r.total_cgst, r.total_sgst, r.total_igst, r.total_tax, r.invoice_count]
                  )
                }
                className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all"
              >
                <span>📄 Table 7: B2C Small Supplies CSV</span>
                <span>Download</span>
              </button>
              <button
                onClick={() =>
                  downloadCsv(
                    hsnSummary,
                    "GSTR1_Table12_HSN_SAC",
                    ["HSN/SAC Code", "Description", "UQC", "Total Qty", "GST Rate %", "Total Taxable Value", "CGST", "SGST", "IGST", "Total Tax"],
                    (r) => [r.hsn_sac, r.description, r.uqc, r.total_qty, r.gst_rate, r.total_taxable_value, r.total_cgst, r.total_sgst, r.total_igst, r.total_tax]
                  )
                }
                className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all"
              >
                <span>📄 Table 12: HSN / SAC Summary CSV</span>
                <span>Download</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h4 className="text-sm font-bold text-slate-900">Income Tax &amp; P&L Cross-Reconciliation</h4>
            <p className="text-xs text-slate-500">
              Cross-verify with Income Tax preparation reports to ensure GST liability is excluded from business turnover.
            </p>
            <div className="pt-2">
              <Link
                href="/reports/tax-preparation"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition-all"
              >
                <span>📑 Open Tax Preparation / ITR Workspace</span>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

