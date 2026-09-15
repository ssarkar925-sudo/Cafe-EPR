/**
 * Minimal ASCII invoice PDF builder + WhatsApp document caption builder.
 *
 * The PDF writer emits REAL newline bytes (0x0A) between PDF tokens — literal
 * backslash-n sequences are not valid PDF syntax and strict viewers (e.g. the
 * Android PDF viewer) reject such files as "invalid format". All content is
 * constrained to printable ASCII so JS string lengths always equal UTF-8 byte
 * lengths for xref offsets and stream /Length values.
 */

export function pdfSafe(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/[\\()]/g, (m) => `\\${m}`)
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

export function makePdf(lines: string[]): Uint8Array {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 42;
  const lineHeight = 15;
  const maxLinesPerPage = 48;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += maxLinesPerPage) pages.push(lines.slice(i, i + maxLinesPerPage));
  if (!pages.length) pages.push([]);

  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("PLACEHOLDER_PAGES");

  for (const pageLines of pages) {
    const contentCommands: string[] = ["BT", "/F1 10 Tf", `${margin} ${pageHeight - margin} Td`];
    pageLines.forEach((line, index) => {
      if (index > 0) contentCommands.push(`0 -${lineHeight} Td`);
      contentCommands.push(`(${pdfSafe(line)}) Tj`);
    });
    contentCommands.push("ET");
    const content = contentCommands.join("\n");
    const contentObjectNumber = objects.length + 1;
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageObjectNumber = objects.length + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 FONT_OBJECT >> >> /Contents ${contentObjectNumber} 0 R >>`);
    pageObjectNumbers.push(pageObjectNumber);
  }

  const fontObjectNumber = objects.length + 1;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (let i = 0; i < objects.length; i++) objects[i] = objects[i].replace(/FONT_OBJECT/g, `${fontObjectNumber} 0 R`);
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

export function buildInvoicePdf(invoice: any, items: any[], payments: any[], settings: any): Uint8Array {
  const lines: string[] = [];
  const storeName = settings?.shop_name || settings?.business_name || settings?.company_name || "CafeERP";
  const customer = invoice?.customers?.name || "Walk-in Customer";
  const phone = invoice?.customers?.phone || "";
  lines.push(storeName, "INVOICE", `Invoice No: ${invoice?.invoice_number || ""}`, `Date: ${invoice?.invoice_date || invoice?.created_at || ""}`, `Customer: ${customer}${phone ? ` (${phone})` : ""}`, "", "Item                         Qty      Rate       Amount", "---------------------------------------------------------");
  for (const item of items || []) {
    const name = String(item?.description || item?.products?.name || item?.services?.name || "Item").slice(0, 28).padEnd(28);
    lines.push(`${name} ${Number(item?.qty || 0).toFixed(2).padStart(6)} ${Number(item?.rate || 0).toFixed(2).padStart(10)} ${Number(item?.amount || 0).toFixed(2).padStart(11)}`);
  }
  lines.push("", `Subtotal: INR ${Number(invoice?.subtotal || 0).toFixed(2)}`, `Discount: INR ${Number(invoice?.discount || 0).toFixed(2)}`, `Tax: INR ${Number(invoice?.tax || 0).toFixed(2)}`, `TOTAL: INR ${Number(invoice?.total || 0).toFixed(2)}`, `PAID: INR ${Number(invoice?.paid || 0).toFixed(2)}`, `DUE: INR ${Number(invoice?.due || 0).toFixed(2)}`, `Status: ${invoice?.status || ""}`);
  if ((payments || []).length) {
    lines.push("", "Payments");
    for (const payment of payments) lines.push(`${payment?.method || "payment"}: INR ${Number(payment?.amount || 0).toFixed(2)}`);
  }
  lines.push("", "Generated securely by CafeERP");
  return makePdf(lines);
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
