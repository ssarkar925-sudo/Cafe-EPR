/**
 * Scheduled ingestion processor core (Phase 17).
 *
 * Shared by the CRON_SECRET HTTP route and the Cloudflare scheduled handler.
 * For each pending event: reconcile against ERP snapshot rows, update the
 * event, and stage drafts for suggestions. Writes ONLY to the ingestion
 * tables — never to financial tables. Bounded batches, no endless loops.
 */

import { reconcileEvent } from "@/lib/ai/reconciliation-engine";
import { HIGH_RISK_DRAFT_ACTIONS } from "@/lib/ai/ingestion-types";

export interface IngestionProcessSummary {
  processed: number;
  reconciled: number;
  needsReview: number;
  failed: number;
  draftsCreated: number;
}

type SupabaseAdmin = {
  from: (table: string) => any;
};

const BATCH_LIMIT = 25;

async function buildErpSnapshot(db: SupabaseAdmin) {
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const [txRes, invRes, payRes, setRes, cashRes] = await Promise.all([
    db.from("transactions").select("id, transaction_number, amount, transaction_date, status").gte("transaction_date", since).limit(300),
    db.from("invoices").select("id, invoice_number, total, paid, due, invoice_date, status, customer_id").gte("invoice_date", since).neq("status", "cancelled").limit(300),
    db.from("payments").select("id, invoice_id, amount, received_at, method").gte("received_at", since).limit(300),
    db.from("settlements").select("id, amount, settlement_date, status").gte("settlement_date", since).limit(100),
    db.from("cash_entries").select("id, amount, entry_date, direction, ref_type").gte("entry_date", since).limit(300),
  ]);
  return [
    ...((txRes.data || []) as any[]).map((t) => ({
      id: t.id, kind: "transaction" as const,
      reference: t.transaction_number, externalId: t.transaction_number,
      amount: Number(t.amount) || 0, occurredAt: t.transaction_date, status: t.status,
    })),
    ...((invRes.data || []) as any[]).map((i) => ({
      id: i.id, kind: "invoice" as const,
      reference: i.invoice_number, externalId: i.invoice_number,
      amount: Number(i.total) || 0, occurredAt: i.invoice_date, status: i.status,
      customerId: i.customer_id, customerDue: Number(i.due) || 0,
    })),
    ...((payRes.data || []) as any[]).map((p) => ({
      id: p.id, kind: "payment" as const,
      reference: null, externalId: null,
      amount: Number(p.amount) || 0, occurredAt: p.received_at, status: "paid",
    })),
    ...((setRes.data || []) as any[]).map((s) => ({
      id: s.id, kind: "settlement" as const,
      reference: null, externalId: null,
      amount: Number(s.amount) || 0, occurredAt: s.settlement_date, status: s.status,
    })),
    ...((cashRes.data || []) as any[]).map((c) => ({
      id: c.id, kind: "cash_entry" as const,
      reference: null, externalId: null,
      amount: Number(c.amount) || 0, occurredAt: c.entry_date, status: "posted",
    })),
  ];
}

export async function processPendingIngestionEvents(db: SupabaseAdmin): Promise<IngestionProcessSummary> {
  const summary: IngestionProcessSummary = { processed: 0, reconciled: 0, needsReview: 0, failed: 0, draftsCreated: 0 };
  const { data: pending } = await db
    .from("ai_ingestion_events")
    .select("*")
    .eq("state", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  for (const event of pending || []) {
    summary.processed++;
    try {
      const businessId = event.business_id || "default";
      const snapshot = await buildErpSnapshot(db);
      const result = reconcileEvent(
        {
          provider: String(event.source_provider || ""),
          eventType: String(event.event_type || ""),
          externalReference: event.external_reference,
          externalEventId: event.external_event_id,
          amount: event.amount === null ? null : Number(event.amount),
          occurredAt: event.occurred_at,
          status: String(event.status || ""),
          contentHash: String(event.content_hash || ""),
          customerId: event.matched_customer_id,
          existingEventIds: [],
        },
        snapshot as any,
      );

      if (result.verdict === "exact_match" || result.verdict === "duplicate") {
        await db.from("ai_ingestion_events").update({
          state: result.verdict === "duplicate" ? "duplicate" : "reconciled",
          matched_transaction_id: result.matchedRowId,
          processed_at: new Date().toISOString(),
          metadata: { ...(event.metadata || {}), reconcile_verdict: result.verdict, reconcile_confidence: result.confidence },
        }).eq("id", event.id);
        summary.reconciled++;
      } else if (result.verdict === "conflict" || result.verdict === "needs_review") {
        await db.from("ai_ingestion_events").update({
          state: "needs_review",
          processed_at: new Date().toISOString(),
          metadata: { ...(event.metadata || {}), reconcile_verdict: result.verdict, reconcile_confidence: result.confidence, evidence: result.evidence },
        }).eq("id", event.id);
        summary.needsReview++;
      } else {
        if (result.suggestion) {
          const risk = HIGH_RISK_DRAFT_ACTIONS.has(result.suggestion.action as any) ? "high" : "medium";
          await db.from("ai_reconciliation_drafts").insert({
            business_id: businessId,
            source_event_id: event.id,
            action_type: result.suggestion.action,
            target_entity: result.suggestion.targetEntity,
            target_id: result.suggestion.targetId,
            proposed_payload: { event_id: event.id, verdict: result.verdict },
            evidence: { ...(result.evidence || {}), reason: result.suggestion.reason },
            confidence: result.confidence,
            risk_level: risk,
            state: "pending",
          });
          summary.draftsCreated++;
        }
        await db.from("ai_ingestion_events").update({
          state: "needs_review",
          processed_at: new Date().toISOString(),
          metadata: { ...(event.metadata || {}), reconcile_verdict: result.verdict, reconcile_confidence: result.confidence },
        }).eq("id", event.id);
        summary.needsReview++;
      }
    } catch (err: any) {
      await db.from("ai_ingestion_events").update({
        state: "failed",
        processed_at: new Date().toISOString(),
        metadata: { error: String(err?.message || "processing failed").slice(0, 300) },
      }).eq("id", (event as any).id);
      summary.failed++;
    }
  }
  return summary;
}
