import { createClient } from "@/lib/supabase/server";
import { normalizePhone, normalizeSearchText, rankCustomerResults } from "@/lib/customer-search";
import { createSaiEvidence } from "@/lib/sai/core/evidence";
import { registerSaiCapability } from "@/lib/sai/core/capabilities";
import type { SaiCapabilityResult } from "@/lib/sai/core/types";

const MAX_RESULTS = 20;
const RESULT_FIELDS = "id,code,name,phone,balance,credit_limit,is_active";

function safeQuery(input: unknown): string {
  return normalizeSearchText(String(input ?? "")).replace(/[%(),\\]/g, "").slice(0, 60);
}

function maskPhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 2)}••••••${digits.slice(-2)}`;
  return digits ? `${digits.slice(0, 2)}•••${digits.slice(-2)}` : null;
}

async function searchCustomers(
  actor: { userId: string; businessId: string },
  query: string,
): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const normalized = safeQuery(query);
  if (normalized.length < 2) return { ok: false, error: "CUSTOMER_QUERY_REQUIRED" };

  const digits = normalizePhone(query).slice(0, 20);
  const ors = [`name.ilike.%${normalized}%`, `code.ilike.%${normalized}%`];
  if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`);

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized);
  if (isUuid) ors.push(`id.eq.${normalized}`);

  const custMatch = normalized.match(/^cust-?(\\d+)$/i);
  if (custMatch) {
    ors.push(`code.ilike.%CUST-${custMatch[1]}%`);
    ors.push(`code.ilike.%${custMatch[1]}%`);
  }

  let aadhaarCustomerIds: string[] = [];
  if (digits.length === 4) {
    const { data: aadhaarRows } = await supabase
      .from("transactions")
      .select("customer_id")
      .eq("aadhaar_last4", digits)
      .not("customer_id", "is", null)
      .limit(20);
    aadhaarCustomerIds = Array.from(
      new Set((aadhaarRows ?? []).map((row: any) => String(row.customer_id))),
    );
    if (aadhaarCustomerIds.length) ors.push(`id.in.(${aadhaarCustomerIds.join(",")})`);
  }

  const { data, error } = await supabase
    .from("customers")
    .select(RESULT_FIELDS)
    .eq("is_active", true)
    .or(ors.join(","))
    .order("name", { ascending: true })
    .limit(MAX_RESULTS * 3);

  if (error) return { ok: false, error: `CUSTOMER_SEARCH_FAILED:${error.message}` };

  const rows = (data ?? []).map((c: any) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    phone: c.phone,
    balance: Number(c.balance ?? 0),
    credit_limit: c.credit_limit == null ? null : Number(c.credit_limit),
    is_active: c.is_active,
    aadhaarLast4: aadhaarCustomerIds.includes(String(c.id)) ? digits : null,
  }));

  const ranked = rankCustomerResults(rows as any[], query, MAX_RESULTS);
  const matches = ranked.map(({ record, match }: any) => ({
    customerId: record.code || record.id,
    customerRecordId: record.id,
    name: record.name,
    mobile: maskPhone(record.phone),
    aadhaarLast4: record.aadhaarLast4 || null,
    currentBalanceDue: Number(record.balance || 0),
    creditLimit: record.credit_limit,
    matchTier: match.tier,
    matchField: match.field,
  }));

  const evidenceId = `sai:customer:search:${crypto.randomUUID()}`;
  await createSaiEvidence({
    evidenceId,
    actor,
    sourceType: "cafeerp.customer.directory",
    sourceRef: "customers",
    data: { query, resultCount: matches.length, matches },
    confidence: matches.length ? 1 : 0.8,
  });

  return {
    ok: true,
    output: {
      observed: true,
      query,
      matches,
      source: "CafeERP customer directory",
    },
    evidenceIds: [evidenceId],
  };
}

async function customerLedger(
  actor: { userId: string; businessId: string },
  input: Record<string, unknown>,
): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const query = String(input.query ?? "").trim();
  const customerId = String(input.customerId ?? "").trim();

  let customer: any = null;

  if (customerId) {
    const { data, error } = await supabase
      .from("customers")
      .select(RESULT_FIELDS)
      .eq("id", customerId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) return { ok: false, error: `CUSTOMER_LEDGER_FAILED:${error.message}` };
    customer = data;
  } else {
    const normalized = safeQuery(query);
    if (normalized.length < 2) return { ok: false, error: "CUSTOMER_QUERY_REQUIRED" };

    const digits = normalizePhone(query).slice(0, 20);
    const ors = [
      `name.ilike.%${normalized}%`,
      `code.ilike.%${normalized}%`,
    ];
    if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`);

    const { data, error } = await supabase
      .from("customers")
      .select(RESULT_FIELDS)
      .eq("is_active", true)
      .or(ors.join(","))
      .order("name", { ascending: true })
      .limit(5);

    if (error) return { ok: false, error: `CUSTOMER_LEDGER_SEARCH_FAILED:${error.message}` };
    const ranked = rankCustomerResults((data ?? []) as any[], query, 5);
    customer = ranked[0]?.record ?? null;
    if (!customer) {
      return { ok: true, output: { found: false, query, matches: [] } };
    }
  }

  const [{ data: sales, error: salesError }, { data: txns, error: txnsError }] =
    await Promise.all([
      supabase
        .from("sales")
        .select("id,invoice_number,total_amount,payment_status,invoice_date")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("transactions")
        .select(
          "id,service_type,transaction_number,amount,status,reference,transaction_date",
        )
        .eq("customer_id", customer.id)
        .order("transaction_date", { ascending: false })
        .limit(10),
    ]);

  if (salesError) {
    return { ok: false, error: `CUSTOMER_LEDGER_SALES_FAILED:${salesError.message}` };
  }
  if (txnsError) {
    return { ok: false, error: `CUSTOMER_LEDGER_TXNS_FAILED:${txnsError.message}` };
  }

  const output = {
    found: true,
    customer: {
      customerId: customer.code || customer.id,
      customerRecordId: customer.id,
      name: customer.name,
      mobile: maskPhone(customer.phone),
      currentBalanceDue: Number(customer.balance ?? 0),
      creditLimit:
        customer.credit_limit == null ? null : Number(customer.credit_limit),
    },
    recentInvoices: sales ?? [],
    recentServiceTransactions: txns ?? [],
    source: "CafeERP authoritative customer ledger",
  };

  const evidenceId = `sai:customer:ledger:${customer.id}:${crypto.randomUUID()}`;
  await createSaiEvidence({
    evidenceId,
    actor,
    sourceType: "cafeerp.customer.ledger",
    sourceRef: customer.id,
    data: output,
    confidence: 1,
  });

  return { ok: true, output, evidenceIds: [evidenceId] };
}

export function registerCustomerIntelligenceCapabilities(): void {
  const defs = [
    {
      id: "customer.search",
      description:
        "Search the authoritative CafeERP customer directory by name, mobile, customer code/ID, or Aadhaar last-4 without mutation.",
      execute: async (input: Record<string, unknown>, ctx: any) =>
        searchCustomers(ctx.command.actor, String(input.query ?? "")),
    },
    {
      id: "customer.ledger",
      description:
        "Read one customer's authoritative Khata, current balance, recent invoices, and recent service transactions without mutation.",
      execute: async (input: Record<string, unknown>, ctx: any) =>
        customerLedger(ctx.command.actor, input),
    },
  ] as const;

  for (const def of defs) {
    try {
      registerSaiCapability({
        id: def.id,
        description: def.description,
        domain: "customer",
        kind: "query",
        risk: "read",
        requiresApproval: false,
        mutates: false,
        verificationRequired: false,
        execute: def.execute,
      });
    } catch {
      // Idempotent module initialization.
    }
  }
}

registerCustomerIntelligenceCapabilities();
