/**
 * AEPS transaction journey memory.
 *
 * Keeps transaction-scoped observations from entry -> intermediate -> final
 * -> passbook, correlates them without storing authentication secrets, and
 * produces a normalized candidate only after a successful final observation.
 *
 * This module is intentionally in-memory. It never persists OTPs, PINs,
 * passwords, biometrics, or other authentication material.
 */

const STAGES = ["entry", "intermediate", "final", "passbook"];

function clean(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeMobile(value) {
  const match = clean(value).match(/(?:^|\D)([6-9]\d{9})(?:\D|$)/);
  return match ? match[1] : "";
}

function normalizeAadhaarLast4(value) {
  const digits = clean(value).replace(/\D/g, "");
  return digits.length === 4 ? digits : "";
}

function normalizeAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[,₹RsINR\s]/gi, ""));
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : null;
}

function normalizeReference(value) {
  const ref = clean(value).replace(/^[:#=\-\s]+/, "");
  return ref.length >= 6 ? ref.slice(0, 64) : "";
}

function normalizeStatus(value) {
  const s = clean(value).toLowerCase();
  if (/failed|rejected|declined|cancelled|reversed|refunded/.test(s)) return "failed";
  if (/pending|processing|initiated|in progress/.test(s)) return "pending";
  if (/success|successful|completed|approved|confirmed/.test(s)) return "success";
  return "";
}

function normalizeType(value) {
  const s = clean(value).toLowerCase().replace(/[-_]/g, " ");
  if (/payment\s*collection|cash\s*collection|aadhaar\s*pay|merchant\s*pay/.test(s)) return "payment_collection";
  if (/balance\s*(enquiry|inquiry)/.test(s)) return "balance_enquiry";
  if (/mini\s*statement/.test(s)) return "mini_statement";
  if (/cash\s*(withdrawal|out)|withdrawal|cashout|biometric\s*withdrawal/.test(s)) return "cash_out";
  return "";
}

function normalizeFields(fields = {}) {
  return {
    customerName: clean(fields.customerName),
    customerMobile: normalizeMobile(fields.customerMobile || fields.mobile),
    aadhaarLast4: normalizeAadhaarLast4(fields.aadhaarLast4 || fields.aadhaar),
    bankName: clean(fields.bankName || fields.bank),
    transactionType: normalizeType(fields.transactionType || fields.type),
    amount: normalizeAmount(fields.amount),
    fee: fields.fee == null ? null : normalizeAmount(fields.fee),
    commission: fields.commission == null ? null : normalizeAmount(fields.commission),
    reference: normalizeReference(fields.reference || fields.externalReference || fields.externalTransactionId || fields.rrn || fields.utr),
    status: normalizeStatus(fields.status),
    occurredAt: clean(fields.occurredAt || fields.timestamp || fields.dateTime),
  };
}

function fieldAgreement(a, b) {
  if (a === null || a === undefined || a === "") return true;
  if (b === null || b === undefined || b === "") return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.01;
  return String(a).toLowerCase().trim() === String(b).toLowerCase().trim();
}

function mergeFields(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined || value === "") continue;
    if (target[key] === null || target[key] === undefined || target[key] === "") {
      target[key] = value;
    }
  }
  return target;
}

function observationFingerprint(obs) {
  const f = obs.fields;
  return [
    obs.stage,
    obs.sourceId,
    f.reference,
    f.amount,
    f.customerMobile,
    f.aadhaarLast4,
    f.transactionType,
  ].join("|").toLowerCase();
}

function correlationScore(session, fields, capturedAtMs) {
  let score = 0;
  const current = session.fields;
  const ageMinutes = Math.abs(capturedAtMs - session.updatedAtMs) / 60000;

  if (fields.reference && current.reference && fields.reference === current.reference) score += 10;
  if (fields.customerMobile && current.customerMobile && fields.customerMobile === current.customerMobile) score += 4;
  if (fields.aadhaarLast4 && current.aadhaarLast4 && fields.aadhaarLast4 === current.aadhaarLast4) score += 4;
  if (fields.amount != null && current.amount != null && fieldAgreement(fields.amount, current.amount)) score += 3;
  if (fields.transactionType && current.transactionType && fields.transactionType === current.transactionType) score += 2;
  if (fields.bankName && current.bankName && fields.bankName.toLowerCase() === current.bankName.toLowerCase()) score += 2;
  if (ageMinutes <= 3) score += 2;
  else if (ageMinutes <= 10) score += 1;

  return score;
}

function buildVerification(session) {
  const finalObs = session.observations.find((o) => o.stage === "final" && o.fields.status === "success");
  const passbookObs = session.observations.find((o) => o.stage === "passbook");
  const entryObs = session.observations.find((o) => o.stage === "entry");

  if (!finalObs) {
    return {
      status: "COLLECTING",
      finalCaptured: false,
      passbookCaptured: Boolean(passbookObs),
      conflicts: [],
      reason: "Waiting for final successful transaction data.",
    };
  }

  const conflicts = [];
  const stages = [entryObs, passbookObs].filter(Boolean);

  for (const obs of stages) {
    for (const key of ["reference", "amount", "customerMobile", "aadhaarLast4", "bankName", "transactionType"]) {
      const a = finalObs.fields[key];
      const b = obs.fields[key];
      if (!fieldAgreement(a, b)) conflicts.push({
        field: key,
        finalValue: a,
        observedValue: b,
        stage: obs.stage,
        sourceId: obs.sourceId,
      });
    }
  }

  const finalFields = finalObs.fields;
  const hasMinimumFinal =
    Boolean(finalFields.reference) &&
    finalFields.amount != null &&
    finalFields.amount > 0;

  if (!hasMinimumFinal) {
    return {
      status: "FINAL_INCOMPLETE",
      finalCaptured: true,
      passbookCaptured: Boolean(passbookObs),
      conflicts,
      reason: "Final page found, but transaction reference/amount is incomplete.",
    };
  }

  if (conflicts.length > 0) {
    return {
      status: "CONFLICT",
      finalCaptured: true,
      passbookCaptured: Boolean(passbookObs),
      conflicts,
      reason: "Journey observations disagree with the final transaction.",
    };
  }

  if (passbookObs) {
    return {
      status: "RECONCILED",
      finalCaptured: true,
      passbookCaptured: true,
      conflicts: [],
      reason: "Final transaction agrees with passbook observation.",
    };
  }

  return {
    status: "FINAL_CONFIRMED",
    finalCaptured: true,
    passbookCaptured: false,
    conflicts: [],
    reason: "Final successful transaction confirmed; passbook has not been observed yet.",
  };
}

class AepsTransactionJourneyMemory {
  constructor({ maxSessions = 25, sessionTtlMs = 20 * 60 * 1000 } = {}) {
    this.maxSessions = maxSessions;
    this.sessionTtlMs = sessionTtlMs;
    this.sessions = new Map();
  }

  cleanup(nowMs = Date.now()) {
    for (const [id, session] of this.sessions.entries()) {
      if (nowMs - session.updatedAtMs > this.sessionTtlMs) this.sessions.delete(id);
    }
    while (this.sessions.size > this.maxSessions) {
      const oldest = Array.from(this.sessions.values()).sort((a, b) => a.updatedAtMs - b.updatedAtMs)[0];
      if (!oldest) break;
      this.sessions.delete(oldest.id);
    }
  }

  findOrCreate({ portalId, sourceId, fields, capturedAtMs }) {
    const normalizedPortalId = clean(portalId);
    const candidates = Array.from(this.sessions.values())
      .filter((s) => s.portalId === normalizedPortalId && s.status !== "RECONCILED" && capturedAtMs - s.updatedAtMs <= this.sessionTtlMs)
      .map((session) => ({ session, score: correlationScore(session, fields, capturedAtMs) }))
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (best && best.score >= 3) return best.session;

    const id = [
      "aeps",
      normalizedPortalId || "portal",
      clean(sourceId) || "source",
      capturedAtMs,
      Math.random().toString(36).slice(2, 8),
    ].join("-");

    const session = {
      id,
      portalId: normalizedPortalId,
      createdAt: new Date(capturedAtMs).toISOString(),
      updatedAtMs: capturedAtMs,
      fields: {},
      observations: [],
      status: "COLLECTING",
    };

    this.sessions.set(id, session);
    return session;
  }

  record({ portalId, portalName, sourceId, sourceUrl, stage, fields, capturedAt = new Date().toISOString(), evidence = "" }) {
    if (!STAGES.includes(stage)) throw new Error("Invalid AEPS journey stage: " + stage);

    const capturedAtMs = Date.parse(capturedAt) || Date.now();
    this.cleanup(capturedAtMs);

    const normalizedFields = normalizeFields(fields);
    const session = this.findOrCreate({ portalId, sourceId, fields: normalizedFields, capturedAtMs });

    const observation = {
      stage,
      sourceId: clean(sourceId),
      sourceUrl: clean(sourceUrl),
      capturedAt: new Date(capturedAtMs).toISOString(),
      fields: normalizedFields,
      evidence: clean(evidence).slice(0, 2000),
    };

    const fp = observationFingerprint({ ...observation, stage });
    if (!session.observations.some((o) => observationFingerprint(o) === fp)) {
      session.observations.push(observation);
      if (session.observations.length > 40) session.observations.shift();
    }

    session.portalName = clean(portalName);
    session.updatedAtMs = capturedAtMs;
    mergeFields(session.fields, normalizedFields);

    const verification = buildVerification(session);
    session.status = verification.status;

    return this.snapshot(session);
  }

  snapshot(sessionOrId) {
    const session = typeof sessionOrId === "string" ? this.sessions.get(sessionOrId) : sessionOrId;
    if (!session) return null;

    const verification = buildVerification(session);
    const finalObs = [...session.observations]
      .reverse()
      .find((o) => o.stage === "final" && o.fields.status === "success");
    const passbookObs = [...session.observations]
      .reverse()
      .find((o) => o.stage === "passbook");

    const finalFields = finalObs?.fields || {};
    const merged = { ...session.fields, ...finalFields };

    return {
      id: session.id,
      portalId: session.portalId,
      portalName: session.portalName || "",
      status: verification.status,
      verification,
      fields: merged,
      observationCount: session.observations.length,
      stageSummary: {
        entry: session.observations.some((o) => o.stage === "entry"),
        intermediate: session.observations.some((o) => o.stage === "intermediate"),
        final: Boolean(finalObs),
        passbook: Boolean(passbookObs),
      },
      observations: session.observations.slice(-20),
      updatedAt: new Date(session.updatedAtMs).toISOString(),
    };
  }
}

module.exports = {
  AepsTransactionJourneyMemory,
  normalizeFields,
  buildVerification,
};
