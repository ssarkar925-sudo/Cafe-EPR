import type { SaiCapability, SaiCommand } from "./types";

const APPROVAL_RISKS = new Set(["high", "critical"]);

export function saiCommandRequiresApproval(command: SaiCommand, capability?: SaiCapability): boolean {
  return APPROVAL_RISKS.has(command.risk) || Boolean(capability?.requiresApproval);
}

export function validateSaiCommand(command: SaiCommand): void {
  if (!command.commandId || !command.idempotencyKey) throw new Error("SAI command identity is required");
  if (!command.actor.userId || !command.actor.businessId) throw new Error("SAI actor context is required");
  if (!command.capability) throw new Error("SAI capability is required");
  if (command.status !== "planned") throw new Error("New SAI commands must start in planned state");
}