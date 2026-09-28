import { requireSaiCapability } from "./capabilities";
import { saiCommandRequiresApproval, validateSaiCommand } from "./policy";
import type { SaiActor, SaiCommand, SaiRiskLevel, SaiCapabilityResult } from "./types";

export async function buildSaiCommand(input: {
  actor: SaiActor;
  capability: string;
  payload: Record<string, unknown>;
  risk: SaiRiskLevel;
  idempotencyKey?: string;
}): SaiCommand {
  const now = new Date().toISOString();
  const canonical = JSON.stringify({ actor: input.actor, capability: input.capability, payload: input.payload });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const idempotencyKey = input.idempotencyKey ?? Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const command: SaiCommand = {
    commandId: crypto.randomUUID(),
    idempotencyKey,
    actor: input.actor,
    capability: input.capability,
    payload: input.payload,
    risk: input.risk,
    status: "planned",
    verification: "pending",
    createdAt: now,
    updatedAt: now,
  };
  validateSaiCommand(command);
  return command;
}

export async function executeSaiCommand(command: SaiCommand, approvalId?: string): Promise<SaiCapabilityResult> {
  validateSaiCommand(command);
  const capability = requireSaiCapability(command.capability);
  if (saiCommandRequiresApproval(command, capability) && !approvalId) {
    return { ok: false, error: "OWNER_APPROVAL_REQUIRED" };
  }
  const authorized: SaiCommand = { ...command, approvalId, status: "authorized", updatedAt: new Date().toISOString() };
  const result = await capability.execute(authorized.payload, { command: authorized, now: new Date().toISOString() });
  if (!result.ok) return result;
  return result;
}