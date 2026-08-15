"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import InvoicePdf, { type InvoicePdfData } from "./invoice-pdf";
import BusinessPdf, { type BusinessPdfData } from "./business-pdf";

export default function A4Actions({
  variant,
  data,
  filename,
}: {
  variant: "invoice" | "business";
  data: InvoicePdfData | BusinessPdfData;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);

  async function downloadPdf() {
    setBusy(true);
    try {
      const el =
        variant === "invoice" ? (
          <InvoicePdf {...(data as InvoicePdfData)} />
        ) : (
          <BusinessPdf {...(data as BusinessPdfData)} />
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
    <div className="flex flex-wrap gap-2 print:hidden">
      <button
        onClick={() => window.print()}
        className="rounded-lg bg-[#0f172a] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1e293b]"
      >
        Print A4
      </button>
      <button
        onClick={downloadPdf}
        disabled={busy}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? "Generating…" : "Download PDF"}
      </button>
    </div>
  );
}
