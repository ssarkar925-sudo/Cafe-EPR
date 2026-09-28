import { getSaiTrace } from "./trace";
import type { SaiActor, SaiTraceRecord } from "./types";

export type SaiTraceExplanation = {
  traceId: string;
  status: "in_progress" | "completed" | "blocked" | "failed";
  headline: string;
  whatHappened: string[];
  why: string[];
  outcome: string;
  safety: string[];
  nextAction?: string;
  evidenceIds: string[];
  confidence: number;
};

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export function explainSaiTrace(records: SaiTraceRecord[]): SaiTraceExplanation {
  if (!records.length) throw new Error("SAI_TRACE_NOT_FOUND");
  const failed = records.filter(r => r.status === "failed");
  const blocked = records.filter(r => r.status === "blocked");
  const completed = records.filter(r => r.status === "completed");
  const status: SaiTraceExplanation["status"] =
    failed.length ? "failed" :
    blocked.length ? "blocked" :
    completed.length ? "completed" : "in_progress";
  const evidenceIds = unique(records.flatMap(r => r.evidenceIds));
  const whatHappened = unique(records.filter(r => r.status !== "skipped").map(r => r.message || (r.phase + " · " + r.eventType))).slice(0,8);
  const why = unique(records.filter(r => r.status === "failed" || r.status === "blocked").map(r => {
    const reason = typeof r.data.reason === "string" ? r.data.reason : "";
    return reason || r.message || (r.phase + " produced a " + r.status + " state.");
  })).slice(0,6);
  const hasVerification = records.some(r => r.phase === "VERIFY");
  const hasApprovalGate = records.some(r => r.data.approvalRequired === true);
  const safety = [
    hasVerification ? "A verification stage was recorded for this execution." : "No verification stage is recorded in this trace.",
    hasApprovalGate ? "An approval gate was recorded before consequential execution." : "No approval gate is recorded in this trace.",
  ];
  const outcome =
    status === "failed" ? "Execution contains at least one failed trace entry." :
    status === "blocked" ? "Execution is blocked and requires its recorded blocking condition to be resolved." :
    status === "completed" ? "Execution reached a completed trace state." :
    "Execution is still in progress or has not reached a terminal trace state.";
  const nextAction =
    status === "failed" ? "Review the failed trace entry and its linked evidence before retrying." :
    status === "blocked" ? "Resolve the blocking condition or required approval, then retry the affected work." :
    status === "in_progress" ? "Continue monitoring the trace for a terminal verification state." : undefined;
  const confidence = status === "completed" && hasVerification ? 0.95 : status === "completed" ? 0.85 : status === "failed" || status === "blocked" ? 0.9 : 0.7;
  return {
    traceId: records[0].traceId, status,
    headline: status === "completed" ? "SAI execution completed" : status === "failed" ? "SAI execution failed" : status === "blocked" ? "SAI execution is blocked" : "SAI execution is in progress",
    whatHappened, why, outcome, safety, nextAction, evidenceIds, confidence,
  };
}

export async function getSaiTraceExplanation(actor: SaiActor, traceId: string) {
  const trace = await getSaiTrace(actor, traceId);
  if (!trace.length) throw new Error("SAI_TRACE_NOT_FOUND");
  return { trace, explanation: explainSaiTrace(trace) };
}
