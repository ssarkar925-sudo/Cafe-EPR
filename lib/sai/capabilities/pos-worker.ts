import { createClient } from "@/lib/supabase/server";
import { subscribeSaiEvent } from "@/lib/sai/cognition/dispatcher";
import { handlePosSaleCreated } from "./pos-observe";
import { persistSaiEvidence } from "@/lib/sai/core/persistence";
import { createSaiAttention } from "@/lib/sai/core/attention";
import { diagnosePosVerificationFailure } from "@/lib/sai/core/diagnosis";
import { recoverSaiAttention } from "@/lib/sai/core/recovery";
import type { SaiEvent } from "@/lib/sai/core/types";

let started = false;

export async function verifyPosSale(event: SaiEvent) {
  const saleId = String(event.payload.saleId || event.entityId || "");
  if (!saleId) return { ok: false, reason: "Missing saleId" };

  const supabase = await createClient();
  const [{ data: invoice, error: invoiceError }, { data: items, error: itemsError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase.from("invoices").select("id,invoice_number,total,paid,due,status,customer_id").eq("id", saleId).maybeSingle(),
      supabase.from("invoice_items").select("id,qty,amount").eq("invoice_id", saleId),
      supabase.from("payments").select("id,amount,method").eq("invoice_id", saleId),
    ]);

  if (invoiceError) return { ok: false, reason: invoiceError.message };
  if (itemsError) return { ok: false, reason: itemsError.message };
  if (paymentsError) return { ok: false, reason: paymentsError.message };
  if (!invoice) return { ok: false, reason: "Invoice not found after POS commit" };

  const expectedTotal = Number(event.payload.totalAmount);
  const paymentRowsTotal = (payments ?? []).reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0);
  const paid = Number(invoice.paid ?? 0);

  const checks = {
    invoiceExists: true,
    invoiceNumberMatches: !event.payload.invoiceNumber || String(invoice.invoice_number) === String(event.payload.invoiceNumber),
    totalMatches: !Number.isFinite(expectedTotal) || Math.abs(Number(invoice.total) - expectedTotal) < 0.01,
    itemsPresent: (items ?? []).length > 0,
    paymentLedgerMatches: Math.abs(paymentRowsTotal - paid) < 0.01,
    paymentStatusConsistent: !event.payload.paymentStatus ||
      String(event.payload.paymentStatus).toLowerCase() === String(invoice.status ?? "").toLowerCase() ||
      (String(event.payload.paymentStatus).toLowerCase() === "paid" && Number(invoice.due ?? 0) <= 0.01),
  };

  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    evidence: { invoiceId: invoice.id, itemCount: (items ?? []).length, paymentCount: (payments ?? []).length },
  };
}

export function startSaiPosWorker(): void {
  if (started) return;
  started = true;

  subscribeSaiEvent("sale.created", async (event: SaiEvent) => {
    const observed = await handlePosSaleCreated(event);
    if (!observed.ok) return;

    const verification = await verifyPosSale(event);
    const evidenceId = `pos-verification:${event.eventId}`;
    await persistSaiEvidence({
      evidenceId,
      actor: event.actor,
      sourceType: "pos.authoritative_verification",
      sourceRef: event.entityId ?? event.eventId,
      observedAt: new Date().toISOString(),
      data: { eventId: event.eventId, ok: verification.ok, reason: verification.ok ? null : verification.reason, checks: verification.checks ?? null, evidence: verification.evidence ?? null },
      confidence: verification.ok ? 1 : 0,
    });
    if (!verification.ok && event.actor) {
      const attention = await createSaiAttention({
        actor: event.actor,
        type: "pos.verification_failed",
        severity: "critical",
        title: "POS sale verification failed",
        detail: verification.reason ?? JSON.stringify(verification.checks ?? {}),
        evidenceIds: [evidenceId],
        sourceType: "pos.sale",
        sourceRef: event.entityId ?? event.eventId,
      });
      const diagnosis = await diagnosePosVerificationFailure({
        actor: event.actor,
        attentionId: attention.id,
        sourceRef: event.entityId ?? event.eventId,
        evidenceIds: [evidenceId],
        reason: verification.reason,
        checks: verification.checks,
        evidence: verification.evidence,
      });

      if (diagnosis.nextAction === "retry_verification") {
        await recoverSaiAttention({
          actor: event.actor,
          attentionId: attention.id,
          sourceRef: event.entityId ?? event.eventId,
          strategy: "retry_verification",
          verify: () => verifyPosSale(event),
        });
      }
      return;
    }
  });
}
