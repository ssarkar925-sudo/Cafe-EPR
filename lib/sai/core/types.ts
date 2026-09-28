export type SaiLanguage = "en" | "hi" | "bn";
export type SaiRiskLevel = "read" | "low" | "medium" | "high" | "critical";
export type SaiExecutionMode = "operator" | "background";
export type SaiCommandStatus = "planned" | "validated" | "authorized" | "executing" | "executed" | "verified" | "failed" | "cancelled";
export type SaiVerificationStatus = "pending" | "verified" | "failed" | "not_applicable";
export type SaiEvidenceSubjectType = "event" | "plan" | "goal" | "mission" | "command" | "command_step" | "command_result" | "verification" | "attention" | "evidence";
export type SaiEvidenceRelation = "supports" | "derived_from" | "verifies" | "caused_by" | "explains";
export type SaiEvidenceRecord = { evidenceId: string; actor?: SaiActor; sourceType: string; sourceRef?: string; observedAt: string; contentHash: string; data: Record<string, unknown>; confidence?: number };
export type SaiEvidenceLink = { evidenceId: string; subjectType: SaiEvidenceSubjectType; subjectId: string; relation: SaiEvidenceRelation; createdAt?: string };
export type SaiTracePhase = "OBSERVE" | "UNDERSTAND" | "IDENTIFY" | "RETRIEVE" | "REASON" | "PLAN" | "DECIDE" | "EXECUTE" | "VERIFY" | "LEARN" | "REMEMBER";
export type SaiTraceStatus = "started" | "completed" | "blocked" | "failed" | "skipped";
export type SaiTraceRecord = { spanId: string; traceId: string; parentSpanId?: string; actor: SaiActor; sequenceNo: number; phase: SaiTracePhase; eventType: string; status: SaiTraceStatus; operation: string; planId?: string; missionId?: string; goalId?: string; commandId?: string; stepId?: string; startedAt: string; completedAt?: string; durationMs?: number; message?: string; data: Record<string, unknown>; evidenceIds: string[] };
export type SaiActor = { userId: string; businessId: string; role?: string };
export type SaiGoalStatus = "active" | "paused" | "completed" | "cancelled" | "failed";
export type SaiGoalPriority = "low" | "normal" | "high" | "critical";
export type SaiMissionStatus = "queued" | "running" | "waiting_approval" | "blocked" | "completed" | "failed" | "cancelled";
export type SaiGoal = { goalId: string; actor: SaiActor; title: string; objective: string; status: SaiGoalStatus; priority: SaiGoalPriority; target: Record<string, unknown>; successCriteria: unknown[]; context: Record<string, unknown>; nextAction?: string; dueAt?: string; createdAt: string; updatedAt: string; completedAt?: string };
export type SaiMission = { missionId: string; goalId: string; actor: SaiActor; title: string; status: SaiMissionStatus; plan: Record<string, unknown>; currentStep: number; attemptCount: number; blockedReason?: string; result: Record<string, unknown>; createdAt: string; updatedAt: string; completedAt?: string };
export type SaiWorldState = { observedAt: string; route?: string; activeModule?: string; customer?: Record<string, unknown> | null; transaction?: Record<string, unknown> | null; attention: SaiAttentionItem[]; facts: Record<string, unknown> };
export type SaiAttentionItem = { id: string; type: string; severity: "info" | "warning" | "critical"; title: string; detail?: string; evidenceIds: string[] };
export type SaiEvent = { eventId: string; type: string; occurredAt: string; actor?: SaiActor; entityId?: string; payload: Record<string, unknown>; evidenceIds?: string[] };
export type SaiCapability = { id: string; description: string; risk: SaiRiskLevel; requiresApproval: boolean; execute: (input: Record<string, unknown>, ctx: SaiExecutionContext) => Promise<SaiCapabilityResult> };
export type SaiCommand = { commandId: string; idempotencyKey: string; actor: SaiActor; capability: string; payload: Record<string, unknown>; risk: SaiRiskLevel; approvalId?: string; status: SaiCommandStatus; verification: SaiVerificationStatus; createdAt: string; updatedAt: string };
export type SaiCapabilityResult = { ok: boolean; output?: Record<string, unknown>; evidenceIds?: string[]; error?: string };
export type SaiExecutionContext = { command: SaiCommand; now: string };
export type SaiPlanStep = { stepId: string; capability: string; input: Record<string, unknown>; risk: SaiRiskLevel; dependsOn: string[] };
export type SaiPlan = { planId: string; version: 1; compiledAt: string; source: "instruction" | "goal" | "mission"; goal: string; steps: SaiPlanStep[]; requiresApproval: boolean; validation: "validated" };
export type SaiAutonomyPolicy = {
  policyId: string;
  actor: SaiActor;
  autonomyEnabled: boolean;
  maxAutoRisk: SaiRiskLevel;
  dailyActionBudget: number;
  autonomousActionsUsed: number;
  budgetDate: string;
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  quietHoursTimezone: string;
  criticalInterrupt: boolean;
  requireApprovalForMutations: boolean;
  createdAt: string;
  updatedAt: string;
};
export type SaiAutonomyDecision = {
  allowed: boolean;
  requiresApproval: boolean;
  reason:
    | "OPERATOR_MODE"
    | "AUTONOMY_POLICY_NOT_CONFIGURED"
    | "AUTONOMY_DISABLED"
    | "AUTONOMY_RISK_ABOVE_CEILING"
    | "AUTONOMY_MUTATION_APPROVAL_REQUIRED"
    | "AUTONOMY_QUIET_HOURS"
    | "AUTONOMY_CRITICAL_INTERRUPT"
    | "AUTONOMY_BUDGET_EXHAUSTED";
};