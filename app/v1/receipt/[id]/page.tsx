import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext } from "@/lib/v1/v1-auth-context";
import V1Forbidden from "@/components/v1/v1-forbidden";
import PrintButton from "@/components/receipt/print-button";
import AutoPrint from "@/components/receipt/auto-print";
import V1Receipt from "@/components/v1/receipt/v1-receipt";
import styles from "@/components/v1/receipt/v1-receipt-print.module.css";
import type { V1ReceiptModel } from "@/components/v1/receipt/v1-receipt-model";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface InvoiceRow {
  canonical_number: string;
  invoice_date: string;
  subtotal: number;
  discount: number;
  total: number;
  customer_id: string | null;
  approver_profile_id: string | null;
  discount_approved_at: string | null;
  status: string;
  edited_from: string | null;
  recreated_by: string | null;
}

/**
 * Canonical V1 receipt / reprint (server). Every figure comes from
 * server-authoritative rows for this invoice id: the invoice row, its
 * lines joined to product names, the customer row, payment claims with
 * allocation detail and instrument labels, the approver display name, and
 * current dues for khata sales. Nothing is reconstructed from masters,
 * carts, or estimates. Reprint loads the same rows fresh on every visit.
 */
export default async function V1ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const session = await getV1SessionContext();
  if (!session || !session.isActive) return <V1Forbidden surface="Receipt" />;

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const width = (await searchParams).w === "58" ? 58 : 80;
  const tenantId = session.tenantId;

  const supabase = await createClient();
  const { data: invoiceData, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "canonical_number, invoice_date, subtotal, discount, total, customer_id, approver_profile_id, discount_approved_at, status, edited_from, recreated_by",
    )
    .eq("tenant_id", session.tenantId)
    .eq("id", id)
    .single();
  if (invoiceError || !invoiceData) notFound();
  const invoice = invoiceData as InvoiceRow;

  const [tenantRes, linesRes, customerRes, claimsRes] = await Promise.all([
    supabase.from("tenants").select("name").eq("id", session.tenantId).single(),
    supabase
      .from("invoice_lines")
      .select("product_id, qty, rate, amount")
      .eq("tenant_id", session.tenantId)
      .eq("invoice_id", id)
      .order("created_at"),
    invoice.customer_id
      ? supabase
          .from("customers")
          .select("name, phone")
          .eq("tenant_id", session.tenantId)
          .eq("id", invoice.customer_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("payment_claims")
      .select("id, method, amount, instrument_id")
      .eq("tenant_id", session.tenantId)
      .eq("invoice_id", id)
      .order("recorded_at"),
  ]);

  const lineRows = ((linesRes.data ?? []) as { product_id: string; qty: number; rate: number; amount: number }[]);
  const productIds = [...new Set(lineRows.map((l) => l.product_id))];
  const { data: productData } = productIds.length
    ? await supabase.from("products").select("id, name").eq("tenant_id", session.tenantId).in("id", productIds)
    : { data: [] };
  const productNames = new Map<string, string>(
    (((productData ?? []) as { id: string; name: string }[]) ?? []).map((p) => [p.id, p.name]),
  );

  const claimRows = ((claimsRes.data ?? []) as { id: string; method: string; amount: number; instrument_id: string | null }[]);
  const claimIds = claimRows.map((c) => c.id);
  const { data: allocData } = claimIds.length
    ? await supabase
        .from("collection_allocations")
        .select("claim_id, method, amount, instrument_id")
        .eq("tenant_id", session.tenantId)
        .in("claim_id", claimIds)
        .order("created_at")
    : { data: [] };
  const allocRows = ((allocData ?? []) as { claim_id: string; method: string; amount: number; instrument_id: string }[]);
  const instrumentIds = [...new Set([...claimRows.map((c) => c.instrument_id), ...allocRows.map((a) => a.instrument_id)].filter(Boolean))] as string[];
  const { data: instrumentData } = instrumentIds.length
    ? await supabase.from("payment_instruments").select("id, name").eq("tenant_id", session.tenantId).in("id", instrumentIds)
    : { data: [] };
  const instrumentNames = new Map<string, string>(
    (((instrumentData ?? []) as { id: string; name: string }[]) ?? []).map((i) => [i.id, i.name]),
  );

  const customer = (customerRes.data ?? null) as { name: string; phone: string | null } | null;
  const hasCredit = claimRows.some((c) => c.method === "credit") || allocRows.some((a) => a.method === "credit");
  let khataBalance: number | null = null;
  if (customer && invoice.customer_id && hasCredit) {
    const { data: dues, error: duesError } = await supabase.rpc("dues_of", { p_customer_id: invoice.customer_id });
    if (!duesError && typeof dues === "number") khataBalance = dues;
  }

  let approverName: string | null = null;
  if (invoice.approver_profile_id) {
    const { data: approver } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", invoice.approver_profile_id)
      .single();
    if (approver && typeof (approver as { display_name: string }).display_name === "string") {
      approverName = (approver as { display_name: string }).display_name;
    }
  }

  async function refNumber(refId: string | null): Promise<string | null> {
    if (!refId) return null;
    const { data } = await supabase
      .from("invoices")
      .select("canonical_number")
      .eq("tenant_id", tenantId)
      .eq("id", refId)
      .single();
    const row = data as { canonical_number: string } | null;
    return row ? row.canonical_number : null;
  }
  const [editedFromNumber, recreatedByNumber] = await Promise.all([
    refNumber(invoice.edited_from),
    refNumber(invoice.recreated_by),
  ]);

  const allocsByClaim = new Map<string, typeof allocRows>();
  for (const a of allocRows) {
    const arr = allocsByClaim.get(a.claim_id) ?? [];
    arr.push(a);
    allocsByClaim.set(a.claim_id, arr);
  }
  const payments = claimRows.flatMap((c) => {
    const allocs = allocsByClaim.get(c.id) ?? [];
    if (allocs.length === 0) {
      return [
        {
          method: c.method,
          amount: Number(c.amount),
          instrument: c.instrument_id ? (instrumentNames.get(c.instrument_id) ?? null) : null,
        },
      ];
    }
    return allocs.map((a) => ({
      method: a.method,
      amount: Number(a.amount),
      instrument: instrumentNames.get(a.instrument_id) ?? null,
    }));
  });

  const model: V1ReceiptModel = {
    businessName: ((tenantRes.data ?? null) as { name: string } | null)?.name ?? "Sale Receipt",
    canonicalNumber: invoice.canonical_number,
    provisionalNumber: null,
    provisional: false,
    invoiceDate: invoice.invoice_date,
    serverTimestamp: invoice.discount_approved_at,
    customer,
    khataBalance,
    lines: lineRows.map((l) => ({
      name: productNames.get(l.product_id) ?? "Item",
      qty: Number(l.qty),
      rate: Number(l.rate),
      amount: Number(l.amount),
    })),
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    approverName,
    total: Number(invoice.total),
    payments,
    status: invoice.status,
    editedFromNumber,
    recreatedByNumber,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className={`${styles.screenOnly} flex flex-wrap items-center gap-2`}>
        <Link href="/v1/pos" className="text-xs font-bold text-slate-500 underline dark:text-slate-400">
          ← POS
        </Link>
        <span className="text-xs font-bold">Width:</span>
        <Link
          href={`/v1/receipt/${id}?w=58`}
          aria-current={width === 58 ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${width === 58 ? "bg-slate-900 text-white" : "border border-slate-200 dark:border-white/10"}`}
        >
          58mm
        </Link>
        <Link
          href={`/v1/receipt/${id}?w=80`}
          aria-current={width === 80 ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${width === 80 ? "bg-slate-900 text-white" : "border border-slate-200 dark:border-white/10"}`}
        >
          80mm
        </Link>
        <PrintButton label="Print receipt" />
      </div>
      <AutoPrint />
      <V1Receipt receipt={model} width={width} />
    </div>
  );
}
