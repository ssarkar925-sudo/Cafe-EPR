import { createClient } from "@/lib/supabase/server";
import { createSaiEvidence } from "@/lib/sai/core/evidence";
import { registerSaiCapability } from "@/lib/sai/core/capabilities";
import type { SaiCapabilityResult } from "@/lib/sai/core/types";

const SERVICE_TYPES = ["dmt", "upi", "recharge", "bbps"] as const;
type ServiceType = (typeof SERVICE_TYPES)[number];

const MAX_RESULTS = 50;

function getLimit(input: Record<string, unknown>): number {
  const value = Number(input.limit ?? 20);
  return Number.isFinite(value) ? Math.max(1, Math.min(MAX_RESULTS, Math.floor(value))) : 20;
}

function normalizeServiceType(input: unknown): ServiceType | null {
  const value = String(input ?? "").trim().toLowerCase();
  return (SERVICE_TYPES as readonly string[]).includes(value) ? (value as ServiceType) : null;
}

function maskMobile(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `${digits.slice(0, 2)}••••••${digits.slice(-2)}`;
  return `${digits.slice(0, 2)}•••${digits.slice(-2)}`;
}

function summarizeTransactions(rows: any[]) {
  let amount = 0;
  let fees = 0;
  let commission = 0;
  const statuses: Record<string, number> = {};

  for (const row of rows) {
    amount += Number(row.amount ?? row.total_amount ?? 0);
    fees += Number(row.service_fee ?? 0);
    commission += Number(row.commission ?? row.portal_commission ?? 0);
    const status = String(row.status ?? "unknown");
    statuses[status] = (statuses[status] ?? 0) + 1;
  }

  return {
    count: rows.length,
    grossAmount: Number(amount.toFixed(2)),
    feeAmount: Number(fees.toFixed(2)),
    commissionAmount: Number(commission.toFixed(2)),
    statuses,
  };
}

async function observeServiceTransactions(
  actor: { userId: string; businessId: string },
  input: Record<string, unknown>,
  serviceType: ServiceType,
): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const limit = getLimit(input);
  const status = String(input.status ?? "").trim();
  const customerId = String(input.customerId ?? "").trim();
  const query = String(input.query ?? "").trim().toLowerCase();

  let builder = supabase
    .from("transactions")
    .select(
      "id,transaction_number,service_type,direction,transaction_date,transaction_timestamp,customer_id,customer_name,phone,customer_mobile,reference,amount,total_amount,commission,portal_commission,service_fee,upi_fee,status,created_by,provider_id,instrument_id,pay_from_instrument_id,transfer_method,sender_name,sender_mobile,beneficiary_name,beneficiary_mobile,beneficiary_bank,beneficiary_ifsc,beneficiary_account,upi_id,receiver_name,provider_ref,remarks,customer_pay_method,customer_collection_method,customer_collected_amount,customer_due_amount,customer_payment_allocations,biller_ref,consumer_number,bill_amount"
    )
    .eq("service_type", serviceType)
    .order("transaction_timestamp", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) builder = builder.eq("status", status);
  if (customerId) builder = builder.eq("customer_id", customerId);

  if (query) {
    const sanitized = query.replace(/[(),]/g, " ").slice(0, 80);
    builder = builder.or(
      `transaction_number.ilike.%${sanitized}%,customer_name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,customer_mobile.ilike.%${sanitized}%,reference.ilike.%${sanitized}%,remarks.ilike.%${sanitized}%`,
    );
  }

  const { data, error } = await builder;
  if (error) return { ok: false, error: `SAI_${serviceType.toUpperCase()}_READ_FAILED:${error.message}` };

  const transactions = (data ?? []).map((row: any) => ({
    transactionId: row.id,
    transactionNumber: row.transaction_number,
    serviceType: row.service_type,
    date: row.transaction_timestamp || row.transaction_date,
    status: row.status,
    amount: Number(row.amount ?? row.total_amount ?? 0),
    totalAmount: Number(row.total_amount ?? row.amount ?? 0),
    commission: Number(row.commission ?? row.portal_commission ?? 0),
    fee: Number(row.service_fee ?? 0),
    upiFee: Number(row.upi_fee ?? 0),
    direction: row.direction ?? null,
    transferMethod: row.transfer_method ?? null,
    customer: row.customer_name || row.phone || row.customer_mobile
      ? {
          name: row.customer_name || row.sender_name || null,
          mobile: maskMobile(row.phone || row.customer_mobile || row.sender_mobile),
          customerId: row.customer_id || null,
        }
      : null,
    beneficiary:
      row.beneficiary_name || row.beneficiary_mobile || row.beneficiary_bank || row.beneficiary_account || row.upi_id
        ? {
            name: row.beneficiary_name || row.receiver_name || null,
            mobile: maskMobile(row.beneficiary_mobile),
            bank: row.beneficiary_bank || null,
            ifsc: row.beneficiary_ifsc || null,
            accountLast4: row.beneficiary_account ? String(row.beneficiary_account).slice(-4) : null,
            upiId: row.upi_id || null,
          }
        : null,
    providerRef: row.provider_ref || null,
    reference: row.reference || null,
    billerRef: row.biller_ref || null,
    consumerNumber: row.consumer_number || null,
    billAmount: row.bill_amount == null ? null : Number(row.bill_amount),
    customerCollection: {
      method: row.customer_pay_method || row.customer_collection_method || null,
      collected: Number(row.customer_collected_amount ?? 0),
      due: Number(row.customer_due_amount ?? 0),
      allocations: Array.isArray(row.customer_payment_allocations)
        ? row.customer_payment_allocations
        : [],
    },
    remarks: row.remarks || null,
  }));

  const summary = summarizeTransactions(data ?? []);
  const evidenceId = `sai:service:${serviceType}:${crypto.randomUUID()}`;

  await createSaiEvidence({
    evidenceId,
    actor,
    sourceType: `cafeerp.service.${serviceType}.transactions`,
    sourceRef: `transactions:service_type=${serviceType}`,
    data: {
      filters: {
        serviceType,
        status: status || null,
        customerId: customerId || null,
        query: query || null,
      },
      summary,
      transactions,
    },
    confidence: 1,
  });

  return {
    ok: true,
    output: {
      observed: true,
      serviceType,
      filters: {
        status: status || null,
        customerId: customerId || null,
        query: query || null,
      },
      summary,
      transactions,
      source: "CafeERP authoritative transaction register",
      authorityNote: "Observation only. SAI does not execute provider transactions or mutate financial records.",
    },
    evidenceIds: [evidenceId],
  };
}

async function observeUpiContext(actor: { userId: string; businessId: string }, input: Record<string, unknown>): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("upi_merchant_qrs")
    .select("id,display_name,upi_id,is_active,created_at,payment_instrument_id")
    .order("display_name")
    .limit(100);

  if (error) return { ok: false, error: `SAI_UPI_CONTEXT_READ_FAILED:${error.message}` };

  const evidenceId = `sai:upi:context:${crypto.randomUUID()}`;
  const output = {
    observed: true,
    merchantQrs: data ?? [],
    requestedScope: input.scope ?? "all",
    source: "CafeERP merchant UPI QR configuration",
  };

  await createSaiEvidence({
    evidenceId,
    actor,
    sourceType: "cafeerp.upi.configuration",
    sourceRef: "upi_merchant_qrs",
    data: output,
    confidence: 1,
  });

  return { ok: true, output, evidenceIds: [evidenceId] };
}

async function observeRechargeContext(actor: { userId: string; businessId: string }, input: Record<string, unknown>): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const [providers, plans] = await Promise.all([
    supabase
      .from("recharge_providers")
      .select("id,name,is_active,sort_order,created_at")
      .order("sort_order")
      .order("name"),
    supabase
      .from("recharge_plan_catalog")
      .select("id,provider_id,category,amount,validity,data,voice,sms,description,badge,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order")
      .order("amount")
      .limit(200),
  ]);

  if (providers.error) return { ok: false, error: `SAI_RECHARGE_PROVIDERS_READ_FAILED:${providers.error.message}` };
  if (plans.error) return { ok: false, error: `SAI_RECHARGE_PLANS_READ_FAILED:${plans.error.message}` };

  const category = String(input.category ?? "").trim().toLowerCase();
  const amount = Number(input.amount ?? 0);

  const filteredPlans = (plans.data ?? []).filter((plan: any) => {
    if (category && String(plan.category ?? "").toLowerCase() !== category) return false;
    if (amount > 0 && Number(plan.amount ?? 0) !== amount) return false;
    return true;
  });

  const evidenceId = `sai:recharge:context:${crypto.randomUUID()}`;
  const output = {
    observed: true,
    providers: providers.data ?? [],
    plans: filteredPlans,
    filters: { category: category || null, amount: amount || null },
    source: "CafeERP recharge catalog",
    authorityNote: "Catalog observation only. No recharge is executed.",
  };

  await createSaiEvidence({
    evidenceId,
    actor,
    sourceType: "cafeerp.recharge.configuration",
    sourceRef: "recharge_providers + recharge_plan_catalog",
    data: output,
    confidence: 1,
  });

  return { ok: true, output, evidenceIds: [evidenceId] };
}

async function observeBbpsContext(actor: { userId: string; businessId: string }, input: Record<string, unknown>): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  let builder = supabase
    .from("bill_payment_commission_config")
    .select("id,service_type,category_id,category_name,biller_id,biller_name,commission_type,commission_value,is_active,created_at,updated_at")
    .eq("is_active", true)
    .order("category_name")
    .order("biller_name")
    .limit(200);

  const biller = String(input.biller ?? "").trim().toLowerCase();
  if (biller) builder = builder.ilike("biller_name", `%${biller}%`);

  const { data, error } = await builder;
  if (error) return { ok: false, error: `SAI_BBPS_CONTEXT_READ_FAILED:${error.message}` };

  const evidenceId = `sai:bbps:context:${crypto.randomUUID()}`;
  const output = {
    observed: true,
    commissionRules: data ?? [],
    source: "CafeERP BBPS commission configuration",
    authorityNote: "Configuration observation only. SAI does not alter commission rules.",
  };

  await createSaiEvidence({
    evidenceId,
    actor,
    sourceType: "cafeerp.bbps.configuration",
    sourceRef: "bill_payment_commission_config",
    data: output,
    confidence: 1,
  });

  return { ok: true, output, evidenceIds: [evidenceId] };
}

export function registerServiceIntelligenceCapabilities(): void {
  const defs = [
    { id: "dmt.observe_transactions", domain: "dmt" as const, description: "Observe authoritative DMT transaction records." , fn: (input: Record<string, unknown>, ctx: any) => observeServiceTransactions(ctx.command.actor, input, "dmt") },
    { id: "upi.observe_transactions", domain: "payments" as const, description: "Observe authoritative UPI transaction records.", fn: (input: Record<string, unknown>, ctx: any) => observeServiceTransactions(ctx.command.actor, input, "upi") },
    { id: "recharge.observe_transactions", domain: "recharge" as const, description: "Observe authoritative recharge transaction records.", fn: (input: Record<string, unknown>, ctx: any) => observeServiceTransactions(ctx.command.actor, input, "recharge") },
    { id: "bbps.observe_transactions", domain: "payments" as const, description: "Observe authoritative BBPS transaction records.", fn: (input: Record<string, unknown>, ctx: any) => observeServiceTransactions(ctx.command.actor, input, "bbps") },
    { id: "upi.observe_context", domain: "payments" as const, description: "Observe active merchant UPI QR configuration.", fn: (input: Record<string, unknown>, ctx: any) => observeUpiContext(ctx.command.actor, input) },
    { id: "recharge.observe_context", domain: "recharge" as const, description: "Observe recharge providers and active plan catalog.", fn: (input: Record<string, unknown>, ctx: any) => observeRechargeContext(ctx.command.actor, input) },
    { id: "bbps.observe_context", domain: "payments" as const, description: "Observe active BBPS commission configuration.", fn: (input: Record<string, unknown>, ctx: any) => observeBbpsContext(ctx.command.actor, input) },
  ] as const;

  for (const def of defs) {
    try {
      registerSaiCapability({
        id: def.id,
        description: def.description,
        domain: def.domain,
        kind: "observe",
        risk: "read",
        requiresApproval: false,
        mutates: false,
        verificationRequired: false,
        execute: def.fn,
      });
    } catch {
      // Idempotent registration for repeated server imports.
    }
  }
}

registerServiceIntelligenceCapabilities();
