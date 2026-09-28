import { authorizeSaiCapability, requireSaiCapability } from "./capabilities";
import { evaluateSaiAutonomy, consumeSaiAutonomyBudget, saiCommandRequiresApproval, validateSaiCommand } from "./policy";
import { getSaiCommandResult, persistSaiCommand, persistSaiCommandResult, updateSaiCommand } from "./persistence";
import type { SaiActor, SaiCommand, SaiRiskLevel, SaiCapabilityResult, SaiExecutionMode } from "./types";

const RISK_ORDER: SaiRiskLevel[] = ["read", "low", "medium", "high", "critical"];

export async function buildSaiCommand(input: {
  actor: SaiActor; capability: string; payload: Record<string, unknown>; risk: SaiRiskLevel; idempotencyKey?: string;
}): Promise<SaiCommand> {
  const now = new Date().toISOString();
  const canonical = JSON.stringify({ actor: input.actor, capability: input.capability, payload: input.payload });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const idempotencyKey = input.idempotencyKey ?? Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const command: SaiCommand = {
    commandId: crypto.randomUUID(), idempotencyKey, actor: input.actor, capability: input.capability,
    payload: input.payload, risk: input.risk, status: "planned", verification: "pending", createdAt: now, updatedAt: now,
  };
  validateSaiCommand(command);
  return (await persistSaiCommand(command)).command;
}

export async function executeSaiCommand(command: SaiCommand, approvalId?: string, mode: SaiExecutionMode = "operator"): Promise<SaiCapabilityResult> {
  validateSaiCommand(command);
  const capability = requireSaiCapability(command.capability);
  authorizeSaiCapability(capability, command.actor);
  if (RISK_ORDER.indexOf(command.risk) < RISK_ORDER.indexOf(capability.risk)) {
    throw new Error(`SAI_COMMAND_RISK_UNDERRATED:${command.capability}`);
  }

  if (command.status === "executed" || command.status === "verified") {
    const previous = await getSaiCommandResult(command.commandId);
    if (previous) return previous;
  }

  const autonomy = await evaluateSaiAutonomy({ actor: command.actor, capability, risk: command.risk, mode });
  if (!autonomy.allowed) {
    if (!autonomy.requiresApproval) {
      const result = { ok: false, error: autonomy.reason, output: { mode, reason: autonomy.reason } };
      await persistSaiCommandResult(command, result);
      await updateSaiCommand(command.commandId, { status: "planned", error: result.error });
      return result;
    }
    if (!approvalId && !command.approvalId) {
      const result = { ok: false, error: "OWNER_APPROVAL_REQUIRED", output: { mode, reason: autonomy.reason } };
      await persistSaiCommandResult(command, result);
      await updateSaiCommand(command.commandId, { status: "planned", error: result.error });
      return result;
    }
  }

  if (mode === "background" && !approvalId && !command.approvalId && autonomy.requiresApproval) {
    const result = { ok: false, error: "OWNER_APPROVAL_REQUIRED", output: { mode, reason: autonomy.reason } };
    await persistSaiCommandResult(command, result);
    await updateSaiCommand(command.commandId, { status: "planned", error: result.error });
    return result;
  }

  if (mode === "background") {
    const budgetOk = await consumeSaiAutonomyBudget(command.actor);
    if (!budgetOk) {
      const result = { ok: false, error: "AUTONOMY_BUDGET_EXHAUSTED", output: { mode, reason: "AUTONOMY_BUDGET_EXHAUSTED" } };
      await persistSaiCommandResult(command, result);
      await updateSaiCommand(command.commandId, { status: "planned", error: result.error });
      return result;
    }
  }

  if (saiCommandRequiresApproval(command, capability) && !approvalId && !command.approvalId) {
    const result = { ok: false, error: "OWNER_APPROVAL_REQUIRED" };
    await persistSaiCommandResult(command, result);
    await updateSaiCommand(command.commandId, { status: "planned", error: result.error });
    return result;
  }

  const authorized: SaiCommand = {
    ...command, approvalId: approvalId ?? command.approvalId, status: "authorized", updatedAt: new Date().toISOString(),
  };
  await updateSaiCommand(authorized.commandId, { status: "authorized", approvalId: authorized.approvalId });
  await updateSaiCommand(authorized.commandId, { status: "executing" });

  let result: SaiCapabilityResult;
  try {
    result = await capability.execute(authorized.payload, { command: { ...authorized, status: "executing" }, now: new Date().toISOString() });
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : "SAI_CAPABILITY_EXECUTION_FAILED" };
  }

  await persistSaiCommandResult(authorized, result);
  await updateSaiCommand(authorized.commandId, { status: result.ok ? "executed" : "failed", error: result.error ?? null });
  return result;
}