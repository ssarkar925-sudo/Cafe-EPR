import type { SaiCapabilityResult, SaiCommand } from "./types";

export type SaiVerifier = (command: SaiCommand, result: SaiCapabilityResult) => Promise<{ status: "verified" | "failed"; evidenceIds?: string[]; reason?: string }>;

const verifiers = new Map<string, SaiVerifier>();

export function registerSaiVerifier(capability: string, verifier: SaiVerifier): void {
  verifiers.set(capability, verifier);
}

export async function verifySaiCommand(command: SaiCommand, result: SaiCapabilityResult) {
  if (!result.ok) return { status: "failed" as const, reason: result.error };
  const verifier = verifiers.get(command.capability);
  if (!verifier) return { status: "failed" as const, reason: "NO_VERIFIER_REGISTERED" };
  return verifier(command, result);
}