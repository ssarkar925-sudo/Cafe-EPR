/**
 * Decorated A4 invoice PDF builder + WhatsApp document caption builder.
 *
 * Pure dependency-free PDF graphics (no WASM/layout engines) so it runs on
 * Cloudflare Workers, Node, and the test harness. Mirrors the content blocks
 * of the app's decorated A4 invoice: shop header, bill-to/status cards, dark
 * item table, totals summary, amount in words, footer.
 *
 * The writer emits REAL newline bytes (0x0A) between PDF tokens — literal
 * backslash-n sequences are not valid PDF syntax and strict viewers reject
 * such files as "invalid format". All content is constrained to printable
 * ASCII so JS string lengths always equal UTF-8 byte lengths for xref offsets
 * and stream /Length values.
 */

import { numberToWordsInr } from "@/lib/format";

export function pdfSafe(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/[\\()]/g, (m) => `\\${m}`)
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

type RGB = [number, number, number];

const INK: RGB = [0.059, 0.09, 0.165];
const SLATE: RGB = [0.278, 0.333, 0.412];
const MUTED: RGB = [0.392, 0.455, 0.545];
const FAINT: RGB = [0.973, 0.98, 0.988];
const BORDER: RGB = [0.886, 0.91, 0.941];
const RULE: RGB = [0.796, 0.839, 0.882];
const GREEN: RGB = [0.082, 0.502, 0.239];
const AMBER: RGB = [0.706, 0.325, 0.035];
const WHITE: RGB = [1, 1, 1];

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const RIGHT = PAGE_W - MARGIN;

// Average Helvetica advance widths (1/1000 em) for alignment math.
const WIDTHS: Record<string, number> = {
  " ": 278, ".": 278, ",": 278, ":": 278, "-": 333, "/": 278, "#": 556,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  "(": 333, ")": 333, "%": 889, "+": 556,
};
function charWidth(ch: string, bold: boolean): number {
  if (WIDTHS[ch] !== undefined) return WIDTHS[ch];
  if (ch >= "A" && ch <= "Z") return bold ? 700 : 667;
  if (ch >= "a" && ch <= "z") return bold ? 550 : 500;
  return 500;
}
function textWidth(text: string, size: number, bold: boolean): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, bold);
  return (w / 1000) * size;
}

function rgb(c: RGB): string {
  return `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`;
}

type TextOpts = { font?: "F1" | "F2"; size?: number; color?: RGB; align?: "left" | "center" | "right"; right?: number; maxChars?: number };

class PdfPage {
  ops: string[] = [];

  rect(x: number, y: number, w: number, h: number, fill?: RGB, stroke?: RGB, lineWidth = 0.5) {
    if (fill) this.ops.push(`${rgb(fill)} rg`, `${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re`, "f");
    if (stroke) this.ops.push(`${rgb(stroke)} RG`, `${fmt(lineWidth)} w`, `${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re`, "S");
  }

  hline(x1: number, x2: number, y: number, color: RGB, lineWidth = 0.5) {
    this.ops.push(`${rgb(color)} RG`, `${fmt(lineWidth)} w`, `${fmt(x1)} ${fmt(y)} m`, `${fmt(x2)} ${fmt(y)} l`, "S");
  }

  text(x: number, y: number, raw: string, opts: TextOpts = {}) {
    const font = opts.font || "F1";
    const size = opts.size || 9;
    const bold = font === "F2";
    let str = pdfSafe(raw);
    if (opts.maxChars && str.length > opts.maxChars) str = `${str.slice(0, opts.maxChars - 1)}.`;
    const color = opts.color || INK;
    let tx = x;
    if (opts.align === "right") tx = (opts.right ?? RIGHT) - textWidth(str, size, bold);
    else if (opts.align === "center") tx = x - textWidth(str, size, bold) / 2;
    this.ops.push("BT", `/${font} ${size} Tf`, `${rgb(color)} rg`, `${fmt(tx)} ${fmt(y)} Td`, `(${str}) Tj`, "ET");
  }
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function emitPdf(pageOps: string[][]): Uint8Array {
  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("PLACEHOLDER_PAGES");

  for (const ops of pageOps) {
    const content = ops.join("\n");
    const contentObjectNumber = objects.length + 1;
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageObjectNumber = objects.length + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 FONT_BODY /F2 FONT_BOLD >> >> /Contents ${contentObjectNumber} 0 R >>`
    );
    pageObjectNumbers.push(pageObjectNumber);
  }

  const bodyFont = objects.length + 1;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFont = objects.length + 1;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  for (let i = 0; i < objects.length; i++) {
    objects[i] = objects[i].replace(/FONT_BODY/g, `${bodyFont} 0 R`).replace(/FONT_BOLD/g, `${boldFont} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageObjectNumbers.length} >>`;

  const chunks: string[] = ["%PDF-1.4\n% CafeERP\n"];
  const offsets: number[] = [0];
  let currentOffset = chunks[0].length;
  objects.forEach((object, index) => {
    const objectText = `${index + 1} 0 obj\n${object}\nendobj\n`;
    offsets.push(currentOffset);
    chunks.push(objectText);
    currentOffset += objectText.length;
  });
  const xrefOffset = currentOffset;
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++) chunks.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return new TextEncoder().encode(chunks.join(""));
}

// Legacy monospace builder (kept exported for compatibility).
export function makePdf(lines: string[]): Uint8Array {
  const lineHeight = 15;
  const maxLinesPerPage = 48;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += maxLinesPerPage) pages.push(lines.slice(i, i + maxLinesPerPage));
  if (!pages.length) pages.push([]);
  const pageOps: string[][] = pages.map((pageLines) => {
    const ops: string[] = ["BT", "/F1 10 Tf", `${MARGIN} ${PAGE_H - MARGIN} Td`];
    pageLines.forEach((line, index) => {
      if (index > 0) ops.push(`0 -${lineHeight} Td`);
      ops.push(`(${pdfSafe(line)}) Tj`);
    });
    ops.push("ET");
    return ops;
  });
  return emitPdf(pageOps);
}

type Totals = { total: number; paid: number; due: number };

function currencyOf(settings: any): string {
  const symbol = String(settings?.currency_symbol || "Rs.");
  return symbol === "₹" ? "Rs. " : `${symbol} `;
}

function moneyOf(cur: string, n: any): string {
  return pdfSafe(`${cur}${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}

export function buildInvoicePdf(invoice: any, items: any[], payments: any[], settings: any): Uint8Array {
  const cur = currencyOf(settings);
  const shopName = pdfSafe(settings?.shop_name || settings?.business_name || settings?.company_name || "Sarkar Communication") || "Shop";
  const customer = invoice?.customers || {};
  const custName = pdfSafe(customer?.name || "Walk-in Customer") || "Walk-in Customer";
  const hasDue = Number(invoice?.due || 0) > 0 && invoice?.status !== "cancelled";
  const statusColor = hasDue ? AMBER : GREEN;
  const statusText = hasDue ? `BALANCE DUE: ${moneyOf(cur, invoice?.due)}` : "FULLY PAID";
  const modes = (payments || []).map((p: any) => String(p?.method || "").toUpperCase()).filter(Boolean);
  const uniqModes = [...new Set(modes)];

  const colNo: [number, number] = [MARGIN, 68];
  const colDesc: [number, number] = [72, 330];
  const colQty: [number, number] = [330, 375];
  const colRate: [number, number] = [375, 460];
  const colAmt: [number, number] = [460, RIGHT];

  const pages: PdfPage[] = [];
  let page = new PdfPage();
  pages.push(page);
  let y = PAGE_H - MARGIN;

  const rule = () => page.hline(MARGIN, RIGHT, y, RULE, 1.5);

  // Header: shop block left, invoice block right.
  page.text(MARGIN, y, shopName, { font: "F2", size: 17 });
  page.text(RIGHT, y, "TAX INVOICE", { font: "F2", size: 16, align: "right", right: RIGHT });
  y -= 14;
  const shopLines = [
    settings?.address ? String(settings.address) : "",
    settings?.phone ? `Ph: ${settings.phone}` : "",
    settings?.email ? `Email: ${settings.email}` : "",
    settings?.tax_id ? `GSTIN / Tax ID: ${settings.tax_id}` : "",
  ].filter(Boolean);
  page.text(RIGHT, y, `#${invoice?.invoice_number || ""}`, { size: 9, color: SLATE, align: "right", right: RIGHT });
  y -= 11;
  page.text(RIGHT, y, `Date: ${invoice?.invoice_date || invoice?.created_at || ""}`, { size: 8, color: SLATE, align: "right", right: RIGHT });
  y -= 11;
  page.text(RIGHT, y, statusText, { font: "F2", size: 9, color: statusColor, align: "right", right: RIGHT });
  let shopY = PAGE_H - MARGIN - 14;
  for (const line of shopLines.slice(0, 4)) {
    page.text(MARGIN, shopY, line, { size: 8, color: SLATE, maxChars: 64 });
    shopY -= 11;
  }
  y = Math.min(y, shopY) - 8;
  rule();
  y -= 14;

  // Info cards.
  const cardH = 62;
  const cardW = (RIGHT - MARGIN - 10) / 2;
  page.rect(MARGIN, y - cardH, cardW, cardH, FAINT, BORDER, 0.5);
  page.rect(MARGIN + cardW + 10, y - cardH, cardW, cardH, FAINT, BORDER, 0.5);
  page.text(MARGIN + 9, y - 13, "BILLED TO", { font: "F2", size: 7, color: MUTED });
  page.text(MARGIN + 9, y - 26, custName, { font: "F2", size: 9, maxChars: 34 });
  let cy = y - 37;
  if (customer?.phone) { page.text(MARGIN + 9, cy, `Phone: ${customer.phone}`, { size: 8, color: SLATE, maxChars: 34 }); cy -= 10; }
  if (customer?.address) { page.text(MARGIN + 9, cy, String(customer.address), { size: 8, color: SLATE, maxChars: 36 }); }
  const cx = MARGIN + cardW + 19;
  page.text(cx, y - 13, "INVOICE STATUS", { font: "F2", size: 7, color: MUTED });
  page.text(cx, y - 26, String(invoice?.status || "completed").toUpperCase(), { font: "F2", size: 9, maxChars: 22 });
  page.text(cx, y - 37, `Payment Mode: ${uniqModes.length ? uniqModes.join(", ") : "-"}`, { size: 8, color: SLATE, maxChars: 30 });
  y -= cardH + 14;

  // Item table header (repeated on every page).
  const tableHeader = (pg: PdfPage, hy: number) => {
    pg.rect(MARGIN, hy - 18, RIGHT - MARGIN, 18, INK);
    pg.text((colNo[0] + colNo[1]) / 2, hy - 13, "#", { font: "F2", size: 8, color: WHITE, align: "center" });
    pg.text(colDesc[0], hy - 13, "Item Description", { font: "F2", size: 8, color: WHITE });
    pg.text((colQty[0] + colQty[1]) / 2, hy - 13, "Qty", { font: "F2", size: 8, color: WHITE, align: "center" });
    pg.text(colRate[1], hy - 13, "Rate", { font: "F2", size: 8, color: WHITE, align: "right", right: colRate[1] });
    pg.text(colAmt[1], hy - 13, "Amount", { font: "F2", size: 8, color: WHITE, align: "right", right: colAmt[1] });
  };
  tableHeader(page, y);
  y -= 18;

  const rowH = 16;
  const rows = items || [];
  rows.forEach((it: any, index: number) => {
    if (y < 150) {
      page = new PdfPage();
      pages.push(page);
      y = PAGE_H - MARGIN;
      tableHeader(page, y);
      y -= 18;
    }
    if (index % 2 === 1) page.rect(MARGIN, y - rowH, RIGHT - MARGIN, rowH, FAINT);
    const name = String(it?.products?.name || it?.services?.name || it?.description || it?.item_name || "Item");
    page.text((colNo[0] + colNo[1]) / 2, y - 12, String(index + 1), { size: 8, align: "center" });
    page.text(colDesc[0], y - 12, name, { size: 8, maxChars: 52 });
    page.text((colQty[0] + colQty[1]) / 2, y - 12, String(Number(it?.qty || 0)), { size: 8, align: "center" });
    page.text(colRate[1], y - 12, moneyOf(cur, it?.rate), { size: 8, align: "right", right: colRate[1] });
    page.text(colAmt[1], y - 12, moneyOf(cur, it?.amount), { font: "F2", size: 8, align: "right", right: colAmt[1] });
    page.hline(MARGIN, RIGHT, y - rowH, BORDER, 0.5);
    y -= rowH;
  });
  y -= 12;

  // Totals summary (right box).
  const boxX = 305;
  const boxW = RIGHT - boxX;
  const summaryRow = (label: string, value: string, bold = false) => {
    page.text(boxX + 10, y, label, { size: 8.5, font: bold ? "F2" : "F1" });
    page.text(boxX + boxW - 10, y, value, { size: 8.5, font: bold ? "F2" : "F1", align: "right", right: boxX + boxW - 10 });
    y -= 14;
  };
  if (y < 190) {
    page = new PdfPage();
    pages.push(page);
    y = PAGE_H - MARGIN;
  }
  const boxRows = 2 + (Number(invoice?.discount || 0) > 0 ? 1 : 0) + (hasDue ? 1 : 0);
  page.rect(boxX, y - 20 - boxRows * 14 - 6, boxW, 20 + boxRows * 14 + 12, FAINT, RULE, 0.5);
  summaryRow("Subtotal", moneyOf(cur, invoice?.subtotal));
  if (Number(invoice?.discount || 0) > 0) summaryRow("Discount", `- ${moneyOf(cur, invoice?.discount)}`);
  page.rect(boxX, y - 20, boxW, 20, INK);
  page.text(boxX + 10, y - 14, "Grand Total", { font: "F2", size: 10, color: WHITE });
  page.text(boxX + boxW - 10, y - 14, moneyOf(cur, invoice?.total), { font: "F2", size: 10, color: WHITE, align: "right", right: boxX + boxW - 10 });
  y -= 26;
  summaryRow("Amount Paid", moneyOf(cur, invoice?.paid));
  if (hasDue) {
    page.text(boxX + 10, y, "Balance Outstanding", { font: "F2", size: 9, color: AMBER });
    page.text(boxX + boxW - 10, y, moneyOf(cur, invoice?.due), { font: "F2", size: 9, color: AMBER, align: "right", right: boxX + boxW - 10 });
    y -= 14;
  }
  y -= 12;

  // Amount in words + footer.
  if (y < 110) {
    page = new PdfPage();
    pages.push(page);
    y = PAGE_H - MARGIN;
  }
  const words = pdfSafe(`Amount in Words: ${numberToWordsInr(Number(invoice?.total || 0))}`);
  page.text(MARGIN, y, words.slice(0, 100), { size: 8, color: SLATE });
  if (words.length > 100) page.text(MARGIN, y - 11, words.slice(100, 200), { size: 8, color: SLATE });
  y -= 30;
  page.hline(MARGIN, RIGHT, y, BORDER, 0.5);
  y -= 12;
  const footer = pdfSafe((settings as any)?.receipt_footer || "Thank you for your business.");
  page.text((MARGIN + RIGHT) / 2, y, footer.slice(0, 90), { size: 7.5, color: MUTED, align: "center" });

  return emitPdf(pages.map((pg) => pg.ops));
}

/**
 * Greeting caption attached to the WhatsApp DOCUMENT message (the PDF itself
 * is still delivered as a document — never downgraded to text-only).
 * Contains no URLs: signed links expire and do not belong in persistent chat.
 */
export function buildInvoiceCaption(args: {
  invoiceNumber?: unknown;
  invoiceDate?: unknown;
  customerName?: unknown;
  shopName?: unknown;
  total?: unknown;
  paid?: unknown;
  due?: unknown;
}): string {
  const num = String(args?.invoiceNumber || "").trim() || "N/A";
  const date = String(args?.invoiceDate || "").trim();
  const customer = String(args?.customerName || "").trim() || "Customer";
  const shop = String(args?.shopName || "").trim() || "CafeERP";
  const money = (v: unknown) => `Rs.${Number(v || 0).toFixed(2)}`;
  const lines = [
    `Greetings from ${shop}!`,
    `TAX INVOICE: ${num}`,
    date ? `Date: ${date}` : "",
    `Customer: ${customer}`,
    `Total: ${money(args?.total)} | Paid: ${money(args?.paid)} | Due: ${money(args?.due)}`,
    "Your invoice PDF is attached.",
    `Thank you for choosing ${shop}!`,
  ].filter(Boolean);
  return lines.join("\n").slice(0, 800);
}
