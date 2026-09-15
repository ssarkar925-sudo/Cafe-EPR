import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { getUserRole, hasRole } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  INGESTION_SOURCE_TYPES,
  type IngestionSourceType,
} from "@/lib/ai/ingestion-types";
import {
  normalizeSmsEvent,
  normalizePortalText,
  normalizePortalItem,
  normalizeManualUpload,
  type NormalizedIngestion,
} from "@/lib/ai/ingestion-normalizer";
import { validateNormalizedEvent } from "@/lib/ai/ingestion-validation";
import { buildDedupeKeys, findDuplicate } from "@/lib/ai/ingestion-dedupe";
import { matchCustomer } from "@/lib/ai/customer-matcher";
import { validateExtraction } from "@/lib/ai/ingestion-extraction";
import { findSecretFields, redactSecrets } from "@/lib/ai/secret-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

function workerKeyValid(request: Request): boolean {
  const configured = String(process.env.AI_INGESTION_WORKER_KEY || "").trim();
  if (!configured) return false;
  const presented = String(request.headers.get("x-ingestion-worker-key") || "").trim();
  if (!presented || presented.length !== configured.length) return false;
  try {
    return timingSafeEqual(Buffer.from(presented), Buffer.from(configured));
  } catch {
    return false;
  }
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function POST(request: Request) {
  try {
    const isWorker = workerKeyValid(request);
    let userId: string | null = null;
    if (!isWorker) {
      const role = await getUserRole();
      if (!hasRole(role, ["admin", "manager", "staff"])) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const supabase = await createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      userId = auth.user.id;
    }

    const rawBody = await request.text();
    if (!rawBody) return NextResponse.json({ error: "Request body is required." }, { status: 400 });
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload exceeds the 64 KB ingestion limit." }, { status: 413 });
    }
    const body = JSON.parse(rawBody);

    // Hard secret boundary: reject anything carrying credentials material.
    const secretFindings = findSecretFields(body);
    if (secretFindings.length > 0) {
      return NextResponse.json(
        {
          error: "Payload contains forbidden secret material and was rejected.",
          kinds: [...new Set(secretFindings.map((f) => f.kind))],
        },
        { status: 400 },
      );
    }

    const businessId = String(body?.business_id || "default").trim().slice(0, 64) || "default";
    const sourceType = String(body?.source_type || "").trim() as IngestionSourceType;
    if (!(INGESTION_SOURCE_TYPES as readonly string[]).includes(sourceType)) {
      return NextResponse.json({ error: "Valid source_type is required (portal, phone_notification, sms, email, manual_upload, api)." }, { status: 400 });
    }
    const sourceProvider = String(body?.source_provider || "").trim().slice(0, 120);
    if (!sourceProvider) return NextResponse.json({ error: "source_provider is required." }, { status: 400 });
    const sourceInstance = String(body?.source_instance || "").trim().slice(0, 120) || null;

    // Normalize exactly one payload variant.
    let normalized: NormalizedIngestion;
    const variants = [
      body?.sms_text !== undefined ? "sms_text" : null,
      body?.portal_text !== undefined ? "portal_text" : null,
      body?.portal_items !== undefined ? "portal_items" : null,
      body?.manual !== undefined ? "manual" : null,
      body?.api_event !== undefined ? "api_event" : null,
    ].filter(Boolean);
    if (variants.length !== 1) {
      return NextResponse.json({ error: "Exactly one payload variant is required: sms_text, portal_text, portal_items, manual, or api_event." }, { status: 400 });
    }

    let providerKnown = true;
    if (variants[0] === "sms_text") {
      normalized = normalizeSmsEvent(String(body.sms_text || ""), { provider: sourceProvider, instance: sourceInstance || undefined });
    } else if (variants[0] === "portal_text") {
      const parsed = normalizePortalText(String(body.portal_text || ""), sourceProvider);
      if (parsed.items.length === 0) {
        return NextResponse.json({ error: "No transactions could be parsed from portal_text.", state: "failed" }, { status: 422 });
      }
      if (parsed.items.length > 1) {
        return NextResponse.json({ error: "portal_text yielded multiple transactions; send portal_items instead.", state: "failed", count: parsed.items.length }, { status: 422 });
      }
      if (parsed.portalName === "Online Service Portal") providerKnown = false;
      normalized = parsed.items[0];
    } else if (variants[0] === "portal_items") {
      const items = Array.isArray(body.portal_items) ? body.portal_items.slice(0, 50) : [];
      if (items.length !== 1) {
        return NextResponse.json({ error: "portal_items must contain exactly one transaction per event.", state: "failed" }, { status: 422 });
      }
      normalized = normalizePortalItem(items[0] || {}, sourceProvider);
    } else {
      const manual = variants[0] === "manual" ? body.manual : body.api_event;
      if (!manual || typeof manual !== "object") {
        return NextResponse.json({ error: "manual/api_event must be an object.", state: "failed" }, { status: 400 });
      }
      normalized = normalizeManualUpload(manual);
    }

    // Optional AI extraction: validated strictly, merged conservatively.
    let extractionConfidence: number | null = null;
    if (body?.ai_extraction !== undefined) {
      const check = validateExtraction(body.ai_extraction);
      if (!check.ok) {
        return NextResponse.json({ error: "AI extraction failed schema validation.", issues: check.issues, state: "failed" }, { status: 422 });
      }
      extractionConfidence = body.ai_extraction.confidence;
      normalized.confidence = Math.min(normalized.confidence, body.ai_extraction.confidence);
      normalized.ambiguity = [...new Set([...normalized.ambiguity, ...(body.ai_extraction.ambiguity || [])])];
      normalized.metadata = {
        ...normalized.metadata,
        ai_evidence: {
          source: body.ai_extraction.evidence.source,
          excerpts: (body.ai_extraction.evidence.excerpts || []).map((e: unknown) => String(e).slice(0, 500)),
        },
      };
    }

    // Duplicate detection across three independent keys.
    const keys = buildDedupeKeys({
      businessId,
      sourceProvider,
      externalEventId: normalized.external_event_id,
      externalReference: normalized.external_reference,
      amount: normalized.amount,
      occurredAt: normalized.occurred_at,
      normalizedPayload: {
        provider: sourceProvider,
        type: normalized.event_type,
        amount: normalized.amount,
        ref: normalized.external_reference,
        date: normalized.occurred_at,
      },
    });

    const db = isWorker ? createAdminClient() : await createClient();
    if (keys.primary) {
      const { data: primaryHit } = await db
        .from("ai_ingestion_events")
        .select("id, state")
        .eq("business_id", businessId)
        .eq("source_provider", sourceProvider.toLowerCase())
        .or(
          `external_event_id.eq.${encodeURIComponent(normalized.external_event_id || "")},external_reference.eq.${encodeURIComponent(normalized.external_reference || "")}`,
        )
        .limit(1)
        .maybeSingle();
      if (primaryHit) {
        return NextResponse.json({ state: "duplicate", eventId: primaryHit.id, duplicateKind: "primary", existingState: (primaryHit as any).state });
      }
    }
    {
      const { data: hashHit } = await db
        .from("ai_ingestion_events")
        .select("id, state")
        .eq("business_id", businessId)
        .eq("content_hash", keys.contentHash)
        .limit(1)
        .maybeSingle();
      if (hashHit) {
        return NextResponse.json({ state: "duplicate", eventId: hashHit.id, duplicateKind: "content_hash", existingState: (hashHit as any).state });
      }
    }
    {
      // Third independent key: provider + amount + occurred date + reference.
      const { data: recent } = await db
        .from("ai_ingestion_events")
        .select("id, business_id, source_provider, external_event_id, external_reference, content_hash, amount, occurred_at")
        .eq("business_id", businessId)
        .eq("source_provider", sourceProvider.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(200);
      const tripleHit = findDuplicate(
        keys,
        ((recent || []) as any[]).map((r) => ({
          id: r.id,
          businessId: r.business_id,
          sourceProvider: r.source_provider,
          externalEventId: r.external_event_id,
          externalReference: r.external_reference,
          contentHash: r.content_hash,
          amount: r.amount === null ? null : Number(r.amount),
          occurredAt: r.occurred_at,
        })),
        businessId,
      );
      if (tripleHit && tripleHit.kind === "triple") {
        return NextResponse.json({ state: "duplicate", eventId: tripleHit.event.id, duplicateKind: "triple" });
      }
    }

    // Read-only customer matching (never invents identity).
    let matchedCustomerId: string | null = null;
    let customerMatchConfidence: number | null = null;
    try {
      const { data: candidates } = await db
        .from("customers")
        .select("id, name, phone")
        .eq("is_active", true)
        .limit(50);
      const match = matchCustomer(
        { phone: normalized.customer_mobile, name: normalized.customer_name },
        (candidates || []) as { id: string; phone?: string | null; name?: string | null }[],
      );
      customerMatchConfidence = match.confidence;
      if (match.outcome === "matched" && match.customerId) {
        matchedCustomerId = match.customerId;
      }
    } catch {
      // Matching is best-effort; validation still runs.
    }

    const validation = validateNormalizedEvent({
      event: normalized,
      providerKnown,
      providerConfidence: extractionConfidence,
      customerMatchConfidence,
    });
    if (validation.state === "rejected") {
      return NextResponse.json({ error: "Event failed deterministic validation.", issues: validation.issues, state: "failed" }, { status: 422 });
    }

    const insertPayload = {
      business_id: businessId,
      source_type: sourceType,
      source_provider: sourceProvider.toLowerCase(),
      source_instance: sourceInstance,
      external_event_id: normalized.external_event_id,
      external_reference: normalized.external_reference,
      event_type: normalized.event_type,
      status: normalized.status,
      occurred_at: normalized.occurred_at,
      amount: normalized.amount,
      fee: normalized.fee,
      commission: normalized.commission,
      currency: normalized.currency,
      customer_name: normalized.customer_name,
      customer_mobile: normalized.customer_mobile,
      account_last4: normalized.account_last4,
      bank_name: normalized.bank_name,
      beneficiary: normalized.beneficiary,
      metadata: redactSecrets({
        ...normalized.metadata,
        ambiguity: normalized.ambiguity,
        validation_issues: validation.issues,
        collected_via: isWorker ? "worker" : "user",
        collected_by: userId,
      }),
      raw_payload: null as Record<string, unknown> | null,
      content_hash: sha256Hex(`${businessId}|${sourceProvider.toLowerCase()}|${normalized.external_event_id || ""}|${normalized.external_reference || ""}|${normalized.amount ?? ""}|${normalized.occurred_at || ""}`),
      confidence: normalized.confidence,
      validation_state: validation.state === "valid" ? "valid" : "needs_review",
      matched_customer_id: matchedCustomerId,
      matched_transaction_id: null,
      state: validation.state === "valid" ? "pending" : "needs_review",
    };

    const { data: inserted, error: insertError } = await db
      .from("ai_ingestion_events")
      .insert(insertPayload)
      .select("id, state, validation_state")
      .single();

    if (insertError) {
      const msg = String(insertError.message || "");
      if ((insertError as any).code === "23505" || /duplicate|unique/i.test(msg)) {
        return NextResponse.json({ state: "duplicate", message: "Event already exists in the inbox." });
      }
      return NextResponse.json({ error: "Unable to store ingestion event." }, { status: 500 });
    }

    return NextResponse.json(
      {
        state: (inserted as any).state,
        eventId: (inserted as any).id,
        validationState: (inserted as any).validation_state,
        validationIssues: validation.issues,
        matchedCustomerId,
        duplicateKind: null,
      },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Ingestion failed." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(request.url);
    const businessId = (url.searchParams.get("business_id") || "default").trim().slice(0, 64) || "default";
    const state = url.searchParams.get("state") || "";
    const sourceType = url.searchParams.get("source_type") || "";
    const provider = url.searchParams.get("provider") || "";
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);

    const supabase = await createClient();
    let query = supabase
      .from("ai_ingestion_events")
      .select(
        "id, business_id, source_type, source_provider, source_instance, external_event_id, external_reference, event_type, status, occurred_at, amount, fee, commission, currency, customer_name, customer_mobile, account_last4, bank_name, beneficiary, metadata, content_hash, confidence, validation_state, matched_customer_id, matched_transaction_id, state, created_at, processed_at",
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (state) query = query.eq("state", state);
    if (sourceType) query = query.eq("source_type", sourceType);
    if (provider) query = query.ilike("source_provider", `%${provider.replace(/[%_]/g, "")}%`);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ events: data || [], count: (data || []).length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to list ingestion events." }, { status: 500 });
  }
}
