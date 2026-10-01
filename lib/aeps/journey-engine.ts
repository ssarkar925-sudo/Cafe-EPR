// SAI AEPS Transaction Journey Engine - Session Memory, Stages, Correlation, and Reconciliation
// Pure domain engine without DOM dependencies so it runs in Node, Electron, Web Worker, and Browser.

export type JourneyStage = "ENTRY" | "INTERMEDIATE" | "FINAL" | "PASSBOOK";

export type JourneyReconciliationStatus =
  | "COLLECTING"
  | "FINAL_CONFIRMED"
  | "PASSBOOK_WAITING"
  | "RECONCILED"
  | "CONFLICT"
  | "EXPIRED";

export interface JourneyObservationFields {
  customerName?: string | null;
  customerMobile?: string | null;
  aadhaarLast4?: string | null;
  bank?: string | null;
  bankId?: string | null;
  portal?: string | null;
  portalId?: string | null;
  transactionType?: string | null;
  amount?: number | null;
  fee?: number | null;
  commission?: number | null;
  transactionId?: string | null;
  rrn?: string | null;
  utr?: string | null;
  reference?: string | null;
  status?: string | null;
  timestamp?: string | null;
}

export interface JourneyObservation {
  id: string;
  sessionId?: string;
  portalId: string;
  portalName: string;
  sourceId?: string;
  sourceUrl?: string;
  stage: JourneyStage;
  capturedAt: string;
  fields: JourneyObservationFields;
  evidence: {
    rawTextSnippet?: string;
    selectorOrMethod?: string;
    url?: string;
    title?: string;
    metadata?: Record<string, any>;
  };
}

export interface JourneyConflict {
  field: string;
  message: string;
  entryValue?: any;
  finalValue?: any;
  passbookValue?: any;
  sourceVariants?: { sourceUrl?: string; value: any; stage: JourneyStage }[];
}

export interface JourneyVerificationChecklist {
  customer: boolean;
  amount: boolean;
  bank: boolean;
  reference: boolean;
  transactionType: boolean;
  passbook: boolean;
}

export interface AepsTransactionJourneySession {
  sessionId: string;
  portalId: string;
  portalName: string;
  createdAt: string;
  updatedAt: string;
  status: JourneyReconciliationStatus;
  currentStage: JourneyStage;
  // Accumulated unified fields merged across stages
  fields: JourneyObservationFields;
  observations: JourneyObservation[];
  conflicts: JourneyConflict[];
  verification: JourneyVerificationChecklist;
  // Identity keys used for deduplication & matching
  primaryReference?: string | null;
  fallbackKey?: string | null;
  // Passbook specific match info
  passbookRecord?: JourneyObservationFields | null;
  passbookMatchedAt?: string | null;
}

// ---------------------------------------------------------------------------
// Security & Sanitization: Never capture OTP/PIN/Password/Biometrics
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_PATTERNS = [
  /\botp\b/i,
  /\bpin\b/i,
  /pass(?:word|code)?/i,
  /biometric/i,
  /finger(?:print)?/i,
  /secret/i,
  /cvv/i,
  /card_number/i,
  /aadhaar_full/i,
];

export function sanitizeFieldKey(key: string): boolean {
  return !SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function sanitizeFields(raw: Record<string, any>): JourneyObservationFields {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (!sanitizeFieldKey(k)) continue;
    if (typeof v === "string") {
      // Check if value looks like a full 12-digit Aadhaar
      const aadhaarFull = v.replace(/\D/g, "");
      if (aadhaarFull.length === 12 && k.toLowerCase().includes("aadhaar")) {
        clean.aadhaarLast4 = aadhaarFull.slice(-4);
        continue;
      }
    }
    clean[k] = v;
  }

  // Normalize reference
  const ref = clean.reference || clean.rrn || clean.transactionId || clean.utr || null;
  if (ref) {
    clean.reference = String(ref).trim();
    if (!clean.rrn) clean.rrn = clean.reference;
    if (!clean.transactionId) clean.transactionId = clean.reference;
  }

  // Normalize amount
  if (clean.amount != null) {
    const num = Number(clean.amount);
    clean.amount = Number.isFinite(num) && num > 0 ? num : null;
  }

  // Normalize mobile
  if (clean.customerMobile) {
    const m = String(clean.customerMobile).replace(/\D/g, "").slice(-10);
    clean.customerMobile = m.length === 10 ? m : null;
  }

  // Normalize Aadhaar last 4
  if (clean.aadhaarLast4) {
    const a = String(clean.aadhaarLast4).replace(/\D/g, "").slice(-4);
    clean.aadhaarLast4 = a.length === 4 ? a : null;
  }

  return clean as JourneyObservationFields;
}

// ---------------------------------------------------------------------------
// Identity & Key Helpers
// ---------------------------------------------------------------------------

export function computePrimaryReference(fields: JourneyObservationFields): string | null {
  const ref = fields.rrn || fields.transactionId || fields.reference || fields.utr;
  if (!ref) return null;
  const s = String(ref).trim();
  return s.length >= 4 ? s : null;
}

export function computeFallbackKey(portalId: string, fields: JourneyObservationFields): string | null {
  const mobile = fields.customerMobile || "";
  const aadhaar = fields.aadhaarLast4 || "";
  const amount = fields.amount != null ? Number(fields.amount).toFixed(2) : "";
  const txnType = fields.transactionType || "cash_out";

  if (!mobile && !aadhaar && !amount) return null;
  return `${portalId}|${mobile}|${aadhaar}|${amount}|${txnType}`.toLowerCase();
}

// ---------------------------------------------------------------------------
// Stage Detection Helpers
// ---------------------------------------------------------------------------

export function detectStageFromPage(meta: {
  url?: string;
  title?: string;
  heading?: string;
  hasInputControls?: boolean;
  hasSuccessStatus?: boolean;
  isTableOrReport?: boolean;
}): JourneyStage {
  const url = (meta.url || "").toLowerCase();
  const title = (meta.title || "").toLowerCase();
  const heading = (meta.heading || "").toLowerCase();
  const combined = `${url} ${title} ${heading}`;

  // Passbook / History check first
  const isPassbookSignal =
    /\b(passbook|history|statement|report|ledger|txn[-_ ]history|mini[-_ ]statement)\b/i.test(combined);
  if (isPassbookSignal && meta.isTableOrReport) {
    return "PASSBOOK";
  }

  // Final check: explicit success on a completion view or receipt
  if (meta.hasSuccessStatus || /\b(receipt|success|completed|txn[-_ ]success|confirmation)\b/i.test(combined)) {
    return "FINAL";
  }

  // Entry check: page contains input controls and user is entering mobile/aadhaar/amount
  if (meta.hasInputControls) {
    return "ENTRY";
  }

  // Intermediate: between entry and final
  return "INTERMEDIATE";
}

// ---------------------------------------------------------------------------
// Journey Correlation & Reconciliation Engine
// ---------------------------------------------------------------------------

export class AepsJourneyEngine {
  private sessions: Map<string, AepsTransactionJourneySession> = new Map();
  private maxSessions: number = 200;
  private sessionTtlMs: number = 2 * 60 * 60 * 1000; // 2 hours

  /**
   * Find existing matching session or create a new one.
   */
  public findOrCreateSession(
    portalId: string,
    portalName: string,
    fields: JourneyObservationFields,
    stage: JourneyStage
  ): AepsTransactionJourneySession {
    const clean = sanitizeFields(fields);
    const primaryRef = computePrimaryReference(clean);
    const fallback = computeFallbackKey(portalId, clean);

    // 1. Try to find by primary reference
    if (primaryRef) {
      for (const s of this.sessions.values()) {
        if (s.portalId === portalId && s.primaryReference === primaryRef) {
          return s;
        }
      }
    }

    // 2. Try to find active session by fallback key or active session in COLLECTING state
    if (fallback) {
      for (const s of this.sessions.values()) {
        if (s.portalId === portalId && s.status !== "EXPIRED") {
          // If neither has reference yet or matches fallback
          if (s.fallbackKey === fallback) {
            return s;
          }
          // Partial correlation: same mobile and amount within same portal if session is active
          if (
            clean.customerMobile &&
            s.fields.customerMobile === clean.customerMobile &&
            clean.amount != null &&
            s.fields.amount === clean.amount
          ) {
            return s;
          }
        }
      }
    }

    // 2b. If this is a FINAL or PASSBOOK observation without customer mobile (e.g. raw gateway response),
    // correlate with an active session in the same portal that is currently awaiting confirmation for this amount.
    for (const s of this.sessions.values()) {
      if (s.portalId === portalId && (s.status === "COLLECTING" || s.status === "FINAL_CONFIRMED")) {
        if (clean.amount != null && s.fields.amount != null) {
          if (Math.abs(Number(s.fields.amount) - Number(clean.amount)) < 0.01) {
            return s;
          }
        }
      }
    }

    // 3. Create brand new session
    const sessionId = `aeps-journey-${portalId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const session: AepsTransactionJourneySession = {
      sessionId,
      portalId,
      portalName,
      createdAt: now,
      updatedAt: now,
      status: "COLLECTING",
      currentStage: stage,
      fields: { ...clean },
      observations: [],
      conflicts: [],
      verification: {
        customer: false,
        amount: false,
        bank: false,
        reference: false,
        transactionType: false,
        passbook: false,
      },
      primaryReference: primaryRef,
      fallbackKey: fallback,
      passbookRecord: null,
      passbookMatchedAt: null,
    };

    this.sessions.set(sessionId, session);
    this.pruneOldSessions();
    return session;
  }

  /**
   * Ingest a new observation into the journey session, performing safe merging,
   * conflict detection, and reconciliation updates.
   */
  public ingestObservation(obs: Omit<JourneyObservation, "id">): {
    session: AepsTransactionJourneySession;
    observation: JourneyObservation;
    hasConflict: boolean;
    reconciled: boolean;
  } {
    const sanitizedFields = sanitizeFields(obs.fields);
    const observation: JourneyObservation = {
      ...obs,
      id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fields: sanitizedFields,
    };

    const session = this.findOrCreateSession(
      obs.portalId,
      obs.portalName,
      sanitizedFields,
      obs.stage
    );

    observation.sessionId = session.sessionId;
    session.observations.push(observation);
    session.updatedAt = new Date().toISOString();
    session.currentStage = obs.stage;

    // Detect Conflicts with existing fields
    this.detectConflicts(session, observation);

    // Merge non-conflicting fields (monotonic memory expansion)
    this.mergeFields(session, sanitizedFields, obs.stage);

    // Update primaryReference & fallbackKey if discovered
    const ref = computePrimaryReference(session.fields);
    if (ref && !session.primaryReference) {
      session.primaryReference = ref;
    }
    const fb = computeFallbackKey(session.portalId, session.fields);
    if (fb && !session.fallbackKey) {
      session.fallbackKey = fb;
    }

    // Evaluate verification checklist and reconciliation state
    this.evaluateReconciliation(session);

    const hasConflict = session.status === "CONFLICT";
    const reconciled = session.status === "RECONCILED";

    return { session, observation, hasConflict, reconciled };
  }

  private detectConflicts(
    session: AepsTransactionJourneySession,
    obs: JourneyObservation
  ) {
    const existing = session.fields;
    const incoming = obs.fields;

    // Check Amount conflict
    if (existing.amount != null && incoming.amount != null) {
      if (Math.abs(Number(existing.amount) - Number(incoming.amount)) >= 0.01) {
        this.addConflict(session, {
          field: "amount",
          message: `Amount mismatch: previously ₹${existing.amount}, now ₹${incoming.amount} in ${obs.stage}`,
          entryValue: existing.amount,
          finalValue: obs.stage === "FINAL" ? incoming.amount : undefined,
          passbookValue: obs.stage === "PASSBOOK" ? incoming.amount : undefined,
          sourceVariants: [
            { sourceUrl: obs.sourceUrl, value: incoming.amount, stage: obs.stage },
          ],
        });
      }
    }

    // Check Reference conflict
    const existRef = computePrimaryReference(existing);
    const inRef = computePrimaryReference(incoming);
    if (existRef && inRef && existRef !== inRef) {
      this.addConflict(session, {
        field: "reference",
        message: `Reference/RRN mismatch: previously ${existRef}, now ${inRef} in ${obs.stage}`,
        entryValue: existRef,
        sourceVariants: [
          { sourceUrl: obs.sourceUrl, value: inRef, stage: obs.stage },
        ],
      });
    }

    // Check Customer Mobile conflict
    if (existing.customerMobile && incoming.customerMobile) {
      if (existing.customerMobile !== incoming.customerMobile) {
        this.addConflict(session, {
          field: "customerMobile",
          message: `Mobile mismatch: previously ${existing.customerMobile}, now ${incoming.customerMobile}`,
          entryValue: existing.customerMobile,
          sourceVariants: [
            { sourceUrl: obs.sourceUrl, value: incoming.customerMobile, stage: obs.stage },
          ],
        });
      }
    }

    // Check Bank conflict if both explicitly provided
    if (
      existing.bank &&
      incoming.bank &&
      existing.bank.toLowerCase().trim() !== incoming.bank.toLowerCase().trim()
    ) {
      this.addConflict(session, {
        field: "bank",
        message: `Bank mismatch: previously ${existing.bank}, now ${incoming.bank}`,
        entryValue: existing.bank,
        sourceVariants: [
          { sourceUrl: obs.sourceUrl, value: incoming.bank, stage: obs.stage },
        ],
      });
    }

    // Check Transaction Type conflict
    if (
      existing.transactionType &&
      incoming.transactionType &&
      existing.transactionType !== incoming.transactionType
    ) {
      this.addConflict(session, {
        field: "transactionType",
        message: `Transaction type mismatch: previously ${existing.transactionType}, now ${incoming.transactionType}`,
        entryValue: existing.transactionType,
        sourceVariants: [
          { sourceUrl: obs.sourceUrl, value: incoming.transactionType, stage: obs.stage },
        ],
      });
    }
  }

  private addConflict(session: AepsTransactionJourneySession, conflict: JourneyConflict) {
    const existing = session.conflicts.find((c) => c.field === conflict.field);
    if (!existing) {
      session.conflicts.push(conflict);
    } else {
      existing.message = conflict.message;
      if (conflict.sourceVariants) {
        existing.sourceVariants = [
          ...(existing.sourceVariants || []),
          ...conflict.sourceVariants,
        ];
      }
    }
    session.status = "CONFLICT";
  }

  private mergeFields(
    session: AepsTransactionJourneySession,
    incoming: JourneyObservationFields,
    stage: JourneyStage
  ) {
    // Stage-specific handling
    if (stage === "PASSBOOK") {
      session.passbookRecord = { ...incoming };
      session.passbookMatchedAt = new Date().toISOString();
    }

    for (const [key, val] of Object.entries(incoming)) {
      if (val == null || val === "") continue;
      // Do not overwrite existing verified field with empty
      const existingVal = (session.fields as any)[key];
      if (existingVal == null || existingVal === "") {
        (session.fields as any)[key] = val;
      } else {
        // If conflict on this field, keep existing or note it
        const hasFieldConflict = session.conflicts.some((c) => c.field === key);
        if (!hasFieldConflict) {
          (session.fields as any)[key] = val;
        }
      }
    }
  }

  private evaluateReconciliation(session: AepsTransactionJourneySession) {
    if (session.conflicts.length > 0) {
      session.status = "CONFLICT";
      return;
    }

    const f = session.fields;
    const stagesSeen = new Set(session.observations.map((o) => o.stage));

    // Verification checklist
    session.verification.customer = Boolean(f.customerMobile || f.customerName || f.aadhaarLast4);
    session.verification.amount = Boolean(f.amount != null && Number(f.amount) > 0);
    session.verification.bank = Boolean(f.bank);
    session.verification.reference = Boolean(f.rrn || f.reference || f.transactionId);
    session.verification.transactionType = Boolean(f.transactionType);
    session.verification.passbook = Boolean(stagesSeen.has("PASSBOOK") && session.passbookRecord);

    const hasFinal = stagesSeen.has("FINAL");
    const hasPassbook = stagesSeen.has("PASSBOOK");
    const isSuccess = /success|completed|approved/i.test(f.status || "success");

    if (hasFinal && isSuccess) {
      if (hasPassbook) {
        // Check if passbook matches final reference or amount
        const pb = session.passbookRecord;
        const refMatch =
          !pb?.reference ||
          !f.reference ||
          pb.reference.toLowerCase() === f.reference.toLowerCase();
        const amtMatch =
          pb?.amount == null ||
          f.amount == null ||
          Math.abs(Number(pb.amount) - Number(f.amount)) < 0.01;

        if (refMatch && amtMatch) {
          session.status = "RECONCILED";
        } else {
          session.status = "CONFLICT";
        }
      } else {
        session.status = "FINAL_CONFIRMED";
      }
    } else if (hasFinal && !isSuccess) {
      session.status = "CONFLICT";
    } else {
      session.status = "COLLECTING";
    }
  }

  public getSession(sessionId: string): AepsTransactionJourneySession | undefined {
    return this.sessions.get(sessionId);
  }

  public getAllSessions(): AepsTransactionJourneySession[] {
    return Array.from(this.sessions.values());
  }

  public clearSessions() {
    this.sessions.clear();
  }

  private pruneOldSessions() {
    const now = Date.now();
    for (const [id, s] of this.sessions.entries()) {
      const updated = new Date(s.updatedAt).getTime();
      if (now - updated > this.sessionTtlMs) {
        this.sessions.delete(id);
      }
    }
    while (this.sessions.size > this.maxSessions) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey) this.sessions.delete(oldestKey);
      else break;
    }
  }
}

// Global engine instance for shared application lifecycle
export const globalJourneyEngine = new AepsJourneyEngine();
