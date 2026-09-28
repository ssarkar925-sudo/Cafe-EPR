import { createClient } from "@/lib/supabase/server";
import { createSaiEvidence } from "@/lib/sai/core/evidence";
import { registerSaiCapability } from "@/lib/sai/core/capabilities";
import type { SaiCapabilityResult } from "@/lib/sai/core/types";

const MAX_RESULTS = 25;

function maskPhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length >= 6 ? `${digits.slice(0, 2)}••••${digits.slice(-2)}` : "••••";
}

function limitOf(input: Record<string, unknown>): number {
  const n = Number(input.limit ?? 10);
  return Number.isFinite(n)
    ? Math.max(1, Math.min(MAX_RESULTS, Math.floor(n)))
    : 10;
}

async function observeTransactions(
  actor: { userId: string; businessId: string },
  input: Record<string, unknown>,
): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const limit = limitOf(input);

  let query = supabase
    .from("transactions")
    .select(
      "id,transaction_number,service_type,direction,transaction_date,transaction_timestamp,customer_id,customer_mobile,reference,remarks,status,bank_id,portal_id,aadhaar_last4,transfer_method,amount,service_fee,portal_commission,fee_source,customer_pay_method,customers(name,phone),banks(name),portals(name)",
    )
    .eq("service_type", "aeps")
    .order("transaction_timestamp", { ascending: false })
    .limit(limit);

  const customerId = String(input.customerId ?? "").trim();
  const portalId = String(input.portalId ?? "").trim();
  const status = String(input.status ?? "").trim();

  if (customerId) query = query.eq("customer_id", customerId);
  if (portalId) query = query.eq("portal_id", portalId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    return { ok: false, error: `AEPS_TRANSACTIONS_READ_FAILED:${error.message}` };
  }

  const transactions = (data ?? []).map((t: any) => ({
    transactionId: t.id,
    transactionNumber: t.transaction_number,
    date: t.transaction_timestamp || t.transaction_date,
    status: t.status,
    direction: t.direction,
    transactionType: t.transfer_method,
    amount: Number(t.amount ?? 0),
    customer: t.customers
      ? {
          name: t.customers.name,
          mobile: maskPhone(t.customers.phone || t.customer_mobile),
        }
      : { name: null, mobile: maskPhone(t.customer_mobile) },
    aadhaarLast4: t.aadhaar_last4
      ? String(t.aadhaar_last4).slice(-4)
      : null,
    bank: t.banks?.name || null,
    portal: t.portals?.name || null,
    reference: t.reference || null,
    fee: Number(t.service_fee ?? 0),
    commission: Number(t.portal_commission ?? 0),
    feeSource: t.fee_source || null,
    customerPayMethod: t.customer_pay_method || null,
  }));

  const evidenceId = `sai:aeps:transactions:${crypto.randomUUID()}`;
  await createSaiEvidence({
    evidenceId,
    actor,
    sourceType: "cafeerp.aeps.transactions",
    sourceRef: "transactions:service_type=aeps",
    data: {
      filters: {
        customerId: customerId || null,
        portalId: portalId || null,
        status: status || null,
      },
      count: transactions.length,
      transactions,
    },
    confidence: 1,
  });

  return {
    ok: true,
    output: {
      observed: true,
      filters: {
        customerId: customerId || null,
        portalId: portalId || null,
        status: status || null,
      },
      count: transactions.length,
      transactions,
      source: "CafeERP authoritative AEPS transaction register",
    },
    evidenceIds: [evidenceId],
  };
}

async function observeImportQueue(
  actor: { userId: string; businessId: string },
  input: Record<string, unknown>,
): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const limit = limitOf(input);

  const { data, error } = await supabase
    .from("ai_transaction_imports")
    .select(
      "id,provider_name,source_type,external_transaction_id,external_reference,status,transaction_type,amount,fee,commission,occurred_at,customer_name,customer_mobile,raw_data,state,review_note,created_at,updated_at",
    )
    .eq("created_by", actor.userId)
    .in("state", ["pending", "needs_review"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { ok: false, error: `AEPS_IMPORT_QUEUE_READ_FAILED:${error.message}` };
  }

  const items = (data ?? []).map((item: any) => ({
    id: item.id,
    provider: item.provider_name,
    sourceType: item.source_type,
    externalTransactionId: item.external_transaction_id,
    externalReference: item.external_reference,
    status: item.status,
    transactionType: item.transaction_type,
    amount: Number(item.amount ?? 0),
    fee: item.fee == null ? null : Number(item.fee),
    commission:
      item.commission == null ? null : Number(item.commission),
    occurredAt: item.occurred_at,
    customerName: item.customer_name || null,
    customerMobile: maskPhone(item.customer_mobile),
    bankName: item.raw_data?.bankName || null,
    aadhaarLast4: item.raw_data?.aadhaarLast4
      ? String(item.raw_data.aadhaarLast4).slice(-4)
      : null,
    rrn: item.raw_data?.rrn || null,
    state: item.state,
    reviewNote: item.review_note,
  }));

  const evidenceId = `sai:aeps:imports:${crypto.randomUUID()}`;
  await createSaiEvidence({
    evidenceId,
    actor,
    sourceType: "cafeerp.aeps.import_queue",
    sourceRef: "ai_transaction_imports",
    data: { count: items.length, items },
    confidence: 1,
  });

  return {
    ok: true,
    output: {
      observed: true,
      count: items.length,
      items,
      source: "CafeERP authenticated external-intake queue",
    },
    evidenceIds: [evidenceId],
  };
}

async function observeContext(
  actor: { userId: string; businessId: string },
  input: Record<string, unknown>,
): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const portalId = String(input.portalId ?? "").trim();

  const [portals, rules, sources] = await Promise.all([
    supabase
      .from("aeps_portals")
      .select("id,name,is_active,code,remarks")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("aeps_pricing_rules")
      .select(
        "id,rule_type,transaction_type,portal_id,bank_id,min_amount,max_amount,value,priority,is_active,created_at,updated_at",
      )
      .eq("service_type", "aeps")
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(100),
    (() => {
      let q = supabase
        .from("aeps_portal_sources")
        .select(
          "id,portal_id,portal_name,url,source_type,purpose,is_enabled,priority,last_checked,last_status,last_message,http_status,extraction_confidence,last_successful_check,current_published_value",
        )
        .eq("is_archived", false)
        .order("priority")
        .order("created_at");
      return portalId ? q.eq("portal_id", portalId) : q;
    })(),
  ]);

  if (portals.error) {
    return { ok: false, error: `AEPS_PORTALS_READ_FAILED:${portals.error.message}` };
  }
  if (rules.error) {
    return { ok: false, error: `AEPS_RULES_READ_FAILED:${rules.error.message}` };
  }
  if (sources.error) {
    return { ok: false, error: `AEPS_SOURCES_READ_FAILED:${sources.error.message}` };
  }

  const output = {
    observed: true,
    portals: portals.data ?? [],
    pricingRules: rules.data ?? [],
    watcherSources: (sources.data ?? []).map((s: any) => ({
      id: s.id,
      portalId: s.portal_id,
      portalName: s.portal_name,
      url: s.url,
      sourceType: s.source_type,
      purpose: s.purpose,
      enabled: s.is_enabled,
      priority: s.priority,
      lastChecked: s.last_checked,
      lastSuccessfulCheck: s.last_successful_check,
      lastStatus: s.last_status,
      httpStatus: s.http_status,
      extractionConfidence: s.extraction_confidence,
      publishedValue: s.current_published_value || {},
    })),
    authorityNote:
      "Watcher observations and published rules are read-only here; SAI does not change AEPS pricing or commission.",
  };

  const evidenceId = `sai:aeps:context:${crypto.randomUUID()}`;
  await createSaiEvidence({
    evidenceId,
    actor,
    sourceType: "cafeerp.aeps.configuration",
    sourceRef: portalId || "all-portals",
    data: output,
    confidence: 1,
  });

  return { ok: true, output, evidenceIds: [evidenceId] };
}

export function registerAepsIntelligenceCapabilities(): void {
  const defs = [
    {
      id: "aeps.observe_transactions",
      description:
        "Observe authoritative AEPS transaction records with customer, bank, portal, Aadhaar-last-4, fee, commission, and status context.",
      fn: observeTransactions,
    },
    {
      id: "aeps.observe_import_queue",
      description:
        "Observe authenticated mobile/external AEPS transaction candidates awaiting review; never posts them.",
      fn: observeImportQueue,
    },
    {
      id: "aeps.observe_context",
      description:
        "Observe active AEPS portals, pricing rules, and watcher source configuration without mutating them.",
      fn: observeContext,
    },
  ] as const;

  for (const def of defs) {
    try {
      registerSaiCapability({
        id: def.id,
        description: def.description,
        domain: "aeps",
        kind: "observe",
        risk: "read",
        requiresApproval: false,
        mutates: false,
        verificationRequired: false,
        execute: def.fn,
      });
    } catch {
      // Idempotent module initialization.
    }
  }
}

registerAepsIntelligenceCapabilities();
