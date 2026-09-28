import type { SaiCapabilityResult, SaiCommand, SaiVerificationStatus } from "./types";

export type SaiVerificationResult = {
  status: SaiVerificationStatus;
  evidenceIds?: string[];
  reason?: string;
};

export type SaiVerifier = (
  command: SaiCommand,
  result: SaiCapabilityResult,
) => Promise<{
  status: "verified" | "failed";
  evidenceIds?: string[];
  reason?: string;
}>;

const verifiers = new Map<string, SaiVerifier>();

export function registerSaiVerifier(capability: string, verifier: SaiVerifier): void {
  verifiers.set(capability, verifier);
}

export async function verifySaiCommand(
  command: SaiCommand,
  result: SaiCapabilityResult,
): Promise<SaiVerificationResult> {
  if (!result.ok) {
    return { status: "failed", reason: result.error, evidenceIds: result.evidenceIds ?? [] };
  }

  const verifier = verifiers.get(command.capability);
  if (!verifier) {
    if (command.risk === "read") {
      return {
        status: "not_applicable",
        reason: "READ_ONLY_COMMAND",
        evidenceIds: result.evidenceIds ?? [],
      };
    }
    return {
      status: "failed",
      reason: "NO_VERIFIER_REGISTERED",
      evidenceIds: result.evidenceIds ?? [],
    };
  }

  return verifier(command, result);
}
