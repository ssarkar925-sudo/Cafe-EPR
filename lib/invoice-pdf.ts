/**
 * Canonical client-side invoice PDF generator (Task 11).
 *
 * Single choke point for every "decorated A4 invoice" Blob in the app:
 *   - View -> Download PDF
 *   - List -> Download PDF
 *   - View/List -> WhatsApp -> Send PDF (exact same bytes)
 *
 * Always renders the ONE canonical component (components/pdf/invoice-pdf.tsx)
 * with the ONE data contract (InvoicePdfData) via @react-pdf/renderer, then
 * validates the result as a real PDF (non-empty, application/pdf,
 * %PDF- magic). Runs in the browser, where @react-pdf works reliably.
 */

import { createElement, type ReactElement } from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import InvoicePdf, { type InvoicePdfData } from "@/components/pdf/invoice-pdf";

export type { InvoicePdfData };
export type CanonicalInvoicePdfInput = InvoicePdfData;

export const CANONICAL_PDF_MIME = "application/pdf" as const;

function assertPdfMagic(bytes: Uint8Array): void {
  if (!bytes || bytes.length === 0) throw new Error("Generated invoice PDF is empty.");
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
  if (magic !== "%PDF-") throw new Error("Generated invoice payload is not a valid PDF.");
}

/** Render the canonical InvoicePdf to a validated Blob. */
export async function generateInvoicePdfBlob(input: CanonicalInvoicePdfInput): Promise<Blob> {
  // react-pdf's pdf() types accept only <Document>; the canonical InvoicePdf
  // renders a <Document> at runtime, so this narrow cast is safe.
  const element = createElement(InvoicePdf, input) as unknown as ReactElement<DocumentProps>;
  const blob = await pdf(element).toBlob();
  if (!blob || blob.size === 0) throw new Error("Generated invoice PDF is empty.");
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  assertPdfMagic(head);
  return new Blob([blob], { type: CANONICAL_PDF_MIME });
}

/** Render the canonical InvoicePdf and return validated base64 bytes. */
export async function generateInvoicePdfBase64(input: CanonicalInvoicePdfInput): Promise<{
  base64: string;
  mimeType: typeof CANONICAL_PDF_MIME;
  size: number;
}> {
  const blob = await generateInvoicePdfBlob(input);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assertPdfMagic(bytes);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  let base64 = "";
  try {
    base64 = btoa(binary);
  } catch {
    throw new Error("Unable to encode the invoice PDF for delivery.");
  }
  if (!base64) throw new Error("Generated invoice PDF is empty.");
  return { base64, mimeType: CANONICAL_PDF_MIME, size: bytes.length };
}

/** Trigger a Blob download in the browser. */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  const safeName = String(filename || "Invoice.pdf").trim() || "Invoice.pdf";
  const url = URL.createObjectURL(new Blob([blob], { type: CANONICAL_PDF_MIME }));
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
