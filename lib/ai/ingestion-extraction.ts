/**
 * AI extraction layer contract (Phase 5).
 *
 * When the LLM interprets notification text, SMS text, portal tables, PDF
 * text, supplied OCR output, or website content, its output MUST be structured
 * JSON matching this schema. The LLM never issues SQL and never writes to the
 * ERP; extraction output feeds normalization + validation, then human review
 * or the approval gate.
 *
 * Every extraction requires: confidence, evidence (source + excerpts), and an
 * explicit ambiguity list. Missing evidence is itself a review signal.
 */

export const AI_EXTRACTION_REQUIRED_TOP_LEVEL = [
  "confidence",
  "evidence",
  "ambiguity",
] as const;

export const AI_EXTRACTION_KNOWN_FIELDS = new Set([
  "event_type",
  "status",
  "amount",
  "fee",
  "commission",
  "currency",
  "occurred_at",
  "external_reference",
  "external_event_id",
  "customer_name",
  "customer_mobile",
  "account_last4",
  "bank_name",
  "beneficiary",
  "confidence",
  "evidence",
  "ambiguity",
]);

export interface AiExtractionEvidence {
  source: string;
  excerpts: string[];
}

export interface AiExtraction {
  event_type?: string;
  status?: string;
  amount?: number | null;
  fee?: number | null;
  commission?: number | null;
  currency?: string;
  occurred_at?: string | null;
  external_reference?: string | null;
  external_event_id?: string | null;
  customer_name?: string | null;
  customer_mobile?: string | null;
  account_last4?: string | null;
  bank_name?: string | null;
  beneficiary?: string | null;
  confidence: number;
  evidence: AiExtractionEvidence;
  ambiguity: string[];
}

export interface ExtractionValidation {
  ok: boolean;
  issues: string[];
}

export function validateExtraction(input: unknown): ExtractionValidation {
  const issues: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, issues: ["extraction_must_be_object"] };
  }
  const obj = input as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!AI_EXTRACTION_KNOWN_FIELDS.has(key)) {
      issues.push(`unknown_field:${key}`);
    }
  }

  const confidence = obj.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    issues.push("confidence_required_0_to_1");
  }

  const evidence = obj.evidence as AiExtractionEvidence | undefined;
  if (!evidence || typeof evidence !== "object") {
    issues.push("evidence_required");
  } else {
    if (!String(evidence.source || "").trim()) issues.push("evidence_source_required");
    if (!Array.isArray(evidence.excerpts) || evidence.excerpts.length === 0) {
      issues.push("evidence_excerpts_required");
    } else if (evidence.excerpts.some((e) => typeof e !== "string" || !e.trim())) {
      issues.push("evidence_excerpts_must_be_text");
    }
  }

  if (!Array.isArray(obj.ambiguity)) {
    issues.push("ambiguity_list_required");
  }

  for (const numeric of ["amount", "fee", "commission"] as const) {
    const value = obj[numeric];
    if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      issues.push(`${numeric}_must_be_non_negative_number`);
    }
  }

  const last4 = obj.account_last4;
  if (last4 !== undefined && last4 !== null && !/^[0-9]{4}$/.test(String(last4))) {
    issues.push("account_last4_must_be_4_digits");
  }

  return { ok: issues.length === 0, issues };
}

/** System-prompt fragment constraining LLM extraction output. */
export const AI_EXTRACTION_PROMPT_CONTRACT = [
  "Return ONLY a single JSON object matching the ingestion extraction schema.",
  "Required keys: confidence (0-1), evidence {source, excerpts[]}, ambiguity [].",
  "Copy values verbatim from the source; never invent IDs, amounts, or names.",
  "List every doubt in ambiguity; missing evidence means human review.",
  "Never emit SQL, never call tools, never approve anything.",
].join("\n");
