"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import InvoicePdf, { type InvoicePdfData } from "./invoice-pdf";
import BusinessPdf, { type BusinessPdfData } from "./business-pdf";
import DayClosePdf, { type DayClosePdfData } from "./day-close-pdf";

export default function A4Actions({
  variant,
  data,
  filename,
  showFees = false,
  receiptUrl,
}: {
  variant: "invoice" | "business" | "day_close";
  data: InvoicePdfData | BusinessPdfData | DayClosePdfData;
  filename: string;
  showFees?: boolean;
  receiptUrl?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function downloadPdf() {
    setBusy(true);
    try {
      const el =
        variant === "invoice" ? (
          <InvoicePdf {...(data as InvoicePdfData)} />
        ) : variant === "day_close" ? (
          <DayClosePdf {...(data as DayClosePdfData)} />
        ) : (
          <BusinessPdf {...(data as BusinessPdfData)} showFees={showFees} />
        );
      const blob = await pdf(el).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {receiptUrl && (
        <a
          href={receiptUrl}
          target="_blank"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          🧾 View Receipt (80mm)
        </a>
      )}
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800"
      >
        🖨️ Print Invoice (A4)
      </button>
      <button
        onClick={downloadPdf}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? "Generating PDF…" : "📥 Download PDF"}
      </button>
    </div>
  );
}
