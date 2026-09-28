import { createClient } from "@/lib/supabase/server";
import type { SaiActor } from "./types";
import { isTransientVerificationFailure } from "./recovery-policy";

export type SaiDiagnosisFinding = {
  code: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  expected?: unknown;
  actual?: unknown;
};

export type SaiDiagnosis = {
  diagnosisId: string;
  attentionId?: string;
  category: string;
  confidence: number;
  summary: string;
  findings: SaiDiagnosisFinding[];
  nextAction: "review" | "retry_verification" | "reconcile" | "manual_check";
  evidenceIds: string[];
};

export async function diagnosePosVerificationFailure(input: {
  actor: SaiActor;
  attentionId?: string;
  sourceRef: string;
  evidenceIds: string[];
  reason?: string;
  checks?: unknown;
  evidence?: unknown;
}): Promise<SaiDiagnosis> {
  const findings: SaiDiagnosisFinding[] = [];
  const checksRecord =
    input.checks && typeof input.checks === "object" && !Array.isArray(input.checks)
      ? (input.checks as Record<string, unknown>)
      : null;

  if (checksRecord) {
    for (const [name, value] of Object.entries(checksRecord)) {
      if (value === true) continue;
      findings.push({
        code: name,
        severity: "critical",
        title: name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
        detail: input.reason ?? "Authoritative verification check failed.",
        actual: value,
      });
    }
  } else if (Array.isArray(input.checks)) {
    for (const raw of input.checks) {
      if (!raw || typeof raw !== "object") continue;
      const check = raw as Record<string, unknown>;
      if (check.ok === true) continue;
      findings.push({
        code: String(check.code ?? "verification_mismatch"),
        severity: "critical",
        title: String(check.title ?? check.name ?? "Verification check failed"),
        detail: String(check.reason ?? input.reason ?? "Authoritative verification did not match the observed POS event."),
        expected: check.expected,
        actual: check.actual,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      code: "verification_failed",
      severity: "critical",
      title: "Authoritative verification failed",
      detail: input.reason ?? "The POS transaction could not be verified against authoritative accounting state.",
    });
  }

  const hasPayment = findings.some((f) => /payment|paid/i.test(f.code + " " + f.title));
  const hasInventory = findings.some((f) => /stock|inventory|item/i.test(f.code + " " + f.title));
  const hasInvoice = findings.some((f) => /invoice|total/i.test(f.code + " " + f.title));

  const category = hasPayment ? "payment_mismatch" : hasInventory ? "inventory_mismatch" : hasInvoice ? "invoice_mismatch" : "verification_failure";
  const nextAction = hasPayment || hasInventory || hasInvoice
    ? "reconcile"
    : isTransientVerificationFailure({ reason: input.reason, checks: input.checks })
      ? "retry_verification"
      : "manual_check";
  const confidence = findings.length === 1 && findings[0].code !== "verification_failed" ? 0.95 : 0.7;
  const summary = findings.length === 1
    ? findings[0].title + "."
    : `${findings.length} authoritative POS verification checks failed.`;

  const diagnosis: SaiDiagnosis = {
    diagnosisId: crypto.randomUUID(),
    attentionId: input.attentionId,
    category,
    confidence,
    summary,
    findings,
    nextAction,
    evidenceIds: input.evidenceIds,
  };

  const supabase = await createClient();
  if (input.attentionId) {
    const { error: attentionError } = await supabase.from("sai_attention").update({
      diagnosis_category: diagnosis.category,
      diagnosis_explanation: diagnosis.summary,
      recommended_action: diagnosis.nextAction,
      auto_recovery_allowed: diagnosis.nextAction === "retry_verification",
      diagnosis_status: diagnosis.nextAction === "retry_verification" ? "recovery_ready" : "diagnosed",
    }).eq("attention_id", input.attentionId);
    if (attentionError) throw new Error(`SAI_ATTENTION_DIAGNOSIS_UPDATE_FAILED: ${attentionError.message}`);
  }

  const { error } = await supabase.from("sai_diagnoses").insert({
    diagnosis_id: diagnosis.diagnosisId,
    attention_id: input.attentionId ?? null,
    business_id: input.actor.businessId,
    actor_user_id: input.actor.userId,
    source_type: "pos.verification",
    source_ref: input.sourceRef,
    category: diagnosis.category,
    confidence: diagnosis.confidence,
    summary: diagnosis.summary,
    findings: diagnosis.findings,
    next_action: diagnosis.nextAction,
    evidence_ids: diagnosis.evidenceIds,
    status: "open",
  });
  if (error) throw new Error(`SAI_DIAGNOSIS_CREATE_FAILED: ${error.message}`);

  return diagnosis;
}
