import { executeSaiCommand } from "./command";
import { isTransientVerificationFailure } from "./recovery-policy";
import type { SaiActor, SaiCapabilityResult, SaiCommand, SaiExecutionMode, SaiRecoveryDecision } from "./types";

export const MAX_COMMAND_RECOVERY_ATTEMPTS = 1;

const AUTHORITY_MISMATCH_SIGNALS = [
  "payment_mismatch",
  "invoice_mismatch",
  "inventory_mismatch",
  "payment ledger",
  "authoritative verification",
  "reconciliation",
  "ledger mismatch",
];

function includesSignal(value: string, signals: string[]): boolean {
  const normalized = value.toLowerCase();
  return signals.some(signal => normalized.includes(signal));
}

export function classifySaiCommandFailure(input: {
  command: SaiCommand;
  result: SaiCapabilityResult;
}): SaiRecoveryDecision["category"] {
  const error = String(input.result.error ?? "");
  const output = input.result.output ?? {};

  if (!error) return "unknown";
  if (error === "OWNER_APPROVAL_REQUIRED") return "approval_required";
  if (error === "SAI_CONTRADICTION_DETECTED" || error === "SAI_PLAN_DEPENDENCY_BLOCKED") return "contradiction_blocked";
  if (error.startsWith("AUTONOMY_")) return "policy_blocked";
  if (error === "NO_VERIFIER_REGISTERED" || error.startsWith("SAI_COMMAND_RISK_") || error === "SAI_PLAN_NOT_VALIDATED") {
    return "validation_failure";
  }
  if (includesSignal(error, AUTHORITY_MISMATCH_SIGNALS)) return "authority_mismatch";

  const executionStage = typeof output.executionStage === "string" ? output.executionStage : "";
  if (input.command.risk === "read" && (!executionStage || executionStage === "pre_execute") && isTransientVerificationFailure({ reason: error })) {
    return "transient";
  }
  return isTransientVerificationFailure({ reason: error }) ? "transient" : "unknown";
}

export function decideSaiCommandRecovery(input: {
  command: SaiCommand;
  result: SaiCapabilityResult;
  attemptNumber: number;
  approvalId?: string;
}): SaiRecoveryDecision {
  const category = classifySaiCommandFailure(input);
  const attempt = Math.max(1, input.attemptNumber);
  const limit = MAX_COMMAND_RECOVERY_ATTEMPTS;

  if (attempt > limit) {
    return { category, action: "blocked", safe: false, attemptNumber: attempt, maxAttempts: limit, reason: "Recovery attempt limit reached." };
  }
  if (category === "transient" && input.command.risk === "read") {
    return { category, action: "retry", safe: true, attemptNumber: attempt, maxAttempts: limit, reason: "Transient read-only failure can be retried safely once." };
  }
  if (category === "transient" && input.command.risk !== "read") {
    return {
      category,
      action: input.approvalId ? "retry" : "approval",
      safe: Boolean(input.approvalId),
      attemptNumber: attempt,
      maxAttempts: limit,
      reason: input.approvalId
        ? "Approved transient mutation retry may proceed once."
        : "Mutation retry requires explicit owner approval because the original side effect may already have occurred.",
    };
  }
  if (category === "approval_required") {
    return { category, action: "approval", safe: false, attemptNumber: attempt, maxAttempts: limit, reason: "Owner approval is required before recovery can continue." };
  }
  if (category === "policy_blocked" || category === "contradiction_blocked") {
    return { category, action: "blocked", safe: false, attemptNumber: attempt, maxAttempts: limit, reason: "Recovery cannot override autonomy or contradiction safety gates." };
  }
  if (category === "authority_mismatch") {
    return { category, action: "manual", safe: false, attemptNumber: attempt, maxAttempts: limit, reason: "Authoritative accounting mismatch requires reconciliation/manual review." };
  }
  if (category === "validation_failure") {
    return { category, action: "manual", safe: false, attemptNumber: attempt, maxAttempts: limit, reason: "Validation failure requires a corrected command or verifier." };
  }
  return { category, action: "manual", safe: false, attemptNumber: attempt, maxAttempts: limit, reason: "Failure is not classified as safely recoverable." };
}

export async function recoverSaiCommandFailure(input: {
  actor: SaiActor;
  command: SaiCommand;
  result: SaiCapabilityResult;
  mode: SaiExecutionMode;
  attemptNumber?: number;
  approvalId?: string;
}): Promise<{
  decision: SaiRecoveryDecision;
  result: SaiCapabilityResult;
  recovered: boolean;
}> {
  const decision = decideSaiCommandRecovery({
    command: input.command,
    result: input.result,
    attemptNumber: input.attemptNumber ?? 1,
    approvalId: input.approvalId,
  });

  if (decision.action === "retry") {
    const result = await executeSaiCommand(input.command, input.approvalId, input.mode);
    return { decision, result, recovered: result.ok };
  }

  if (decision.action === "approval") {
    return {
      decision,
      recovered: false,
      result: {
        ok: false,
        error: "OWNER_APPROVAL_REQUIRED",
        output: { mode: input.mode, recoveryCategory: decision.category, reason: decision.reason },
      },
    };
  }

  return {
    decision,
    recovered: false,
    result: {
      ok: false,
      error: "SAI_RECOVERY_BLOCKED",
      output: { mode: input.mode, recoveryCategory: decision.category, reason: decision.reason },
    },
  };
}
