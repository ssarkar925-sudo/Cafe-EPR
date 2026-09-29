import { createClient } from "@/lib/supabase/server";
import { createSaiEvidence } from "@/lib/sai/core/evidence";
import { registerSaiCapability } from "@/lib/sai/core/capabilities";
import type { SaiActor, SaiCapabilityResult } from "@/lib/sai/core/types";

type Row = Record<string, any>;
const MAX_ROWS = 100;
const AUTHORITY_NOTE = "Read-only POS observation from CafeERP invoices, invoice items, and payments under existing authenticated database policies. Sale creation remains owned by CafeERP POS and its create_sale RPC.";

function limitOf(value: unknown): number {
  const limit = Number(value ?? 30);
  return Number.isFinite(limit) ? Math.max(1, Math.min(MAX_ROWS, Math.floor(limit))) : 30;
}

function validDate(value: unknown, fallback: string): string {
  const date = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback;
}

function money(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
}

function lastFour(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.slice(-4) : null;
}

async function observeSales(actor: SaiActor, input: Record<string, unknown>): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const from = validDate(input.from, today);
  const to = validDate(input.to, today);
  const invoiceId = String(input.invoiceId ?? "").trim();
  const invoiceNumber = String(input.invoiceNumber ?? "").trim().toUpperCase().slice(0, 64);
  const limit = limitOf(input.limit);
  if (!invoiceId && !invoiceNumber && from > to) return { ok: false, error: "SAI_POS_INVALID_DATE_RANGE" };

  let invoiceQuery = supabase
    .from("invoices")
    .select("id,invoice_number,invoice_date,total,paid,due,status,created_at,customers(name,phone)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (invoiceId) invoiceQuery = invoiceQuery.eq("id", invoiceId);
  else if (invoiceNumber) invoiceQuery = invoiceQuery.eq("invoice_number", invoiceNumber);
  else invoiceQuery = invoiceQuery.gte("invoice_date", from).lte("invoice_date", to);

  const { data: invoices, error: invoiceError } = await invoiceQuery;
  if (invoiceError) return { ok: false, error: `SAI_POS_SALES_READ_FAILED:${invoiceError.message}` };

  const rows = (invoices ?? []) as Row[];
  const invoiceIds = rows.map((row) => String(row.id)).filter(Boolean);
  let itemRows: Row[] = [];
  let paymentRows: Row[] = [];

  if (invoiceIds.length) {
    const [{ data: items, error: itemError }, { data: payments, error: paymentError }] = await Promise.all([
      supabase.from("invoice_items").select("id,invoice_id,qty,amount").in("invoice_id", invoiceIds),
      supabase.from("payments").select("id,invoice_id,amount,method").in("invoice_id", invoiceIds),
    ]);
    if (itemError) return { ok: false, error: `SAI_POS_ITEMS_READ_FAILED:${itemError.message}` };
    if (paymentError) return { ok: false, error: `SAI_POS_PAYMENTS_READ_FAILED:${paymentError.message}` };
    itemRows = (items ?? []) as Row[];
    paymentRows = (payments ?? []) as Row[];
  }

  const itemCountByInvoice = new Map<string, number>();
  for (const item of itemRows) {
    const invoice = String(item.invoice_id);
    itemCountByInvoice.set(invoice, (itemCountByInvoice.get(invoice) ?? 0) + 1);
  }
  const paymentsByInvoice = new Map<string, Row[]>();
  for (const payment of paymentRows) {
    const invoice = String(payment.invoice_id);
    const current = paymentsByInvoice.get(invoice) ?? [];
    current.push(payment);
    paymentsByInvoice.set(invoice, current);
  }

  const sales = rows.map((invoice) => {
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    const payments = paymentsByInvoice.get(String(invoice.id)) ?? [];
    return {
      invoiceId: String(invoice.id),
      invoiceNumber: String(invoice.invoice_number ?? ""),
      invoiceDate: invoice.invoice_date ?? null,
      createdAt: invoice.created_at ?? null,
      total: money(invoice.total),
      paid: money(invoice.paid),
      due: money(invoice.due),
      status: String(invoice.status ?? "unknown"),
      customer: customer ? { name: customer.name ?? null, phoneLast4: lastFour(customer.phone) } : null,
      itemCount: itemCountByInvoice.get(String(invoice.id)) ?? 0,
      payments: payments.map((payment) => ({ amount: money(payment.amount), method: String(payment.method ?? "") })),
      paymentRowsTotal: money(payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)),
    };
  });

  const output = {
    observed: true,
    filters: { invoiceId: invoiceId || null, invoiceNumber: invoiceNumber || null, from: invoiceId || invoiceNumber ? null : from, to: invoiceId || invoiceNumber ? null : to },
    count: sales.length,
    summaryScope: invoiceId || invoiceNumber ? "matched_invoice" : "returned_rows",
    totalAmount: money(sales.reduce((sum, sale) => sum + sale.total, 0)),
    paidAmount: money(sales.reduce((sum, sale) => sum + sale.paid, 0)),
    dueAmount: money(sales.reduce((sum, sale) => sum + sale.due, 0)),
    limited: !invoiceId && !invoiceNumber && sales.length === limit,
    sales,
    sources: ["invoices", "invoice_items", "payments"],
    observedAt: new Date().toISOString(),
    authorityNote: AUTHORITY_NOTE,
  };

  const sourceRef = invoiceId || invoiceNumber || `invoices:${from}..${to}`;
  const evidenceId = `sai:pos:sales:${crypto.randomUUID()}`;
  await createSaiEvidence({
    evidenceId,
    actor,
    sourceType: "cafeerp.pos.sales_observation",
    sourceRef,
    data: output,
    confidence: 1,
  });
  return { ok: true, output, evidenceIds: [evidenceId] };
}

export function registerPosSalesIntelligence(): void {
  try {
    registerSaiCapability({
      id: "pos.observe_sales",
      description: "Read authoritative POS invoices, item counts, payment rows, totals, and customer context for a specific invoice or date range.",
      domain: "pos",
      kind: "observe",
      risk: "read",
      requiresApproval: false,
      mutates: false,
      verificationRequired: false,
      execute: async (input, ctx) => observeSales(ctx.command.actor, input),
    });
  } catch {
    // Repeated module initialization is safe.
  }
}

registerPosSalesIntelligence();
