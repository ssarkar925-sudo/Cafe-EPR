export function isTransientVerificationFailure(input: {
  reason?: string;
  checks?: unknown;
}): boolean {
  if (input.checks && typeof input.checks === "object" && !Array.isArray(input.checks)) {
    const checks = Object.values(input.checks as Record<string, unknown>);
    if (checks.some((value) => value !== true)) return false;
  } else if (Array.isArray(input.checks) && input.checks.length) {
    return false;
  }

  const reason = String(input.reason ?? "").toLowerCase();
  if (!reason) return false;

  return [
    "timeout",
    "timed out",
    "fetch failed",
    "network",
    "temporarily unavailable",
    "connection",
    "econnreset",
    "etimedout",
    "503",
    "429",
    "pgrst",
    "invoice not found after pos commit",
  ].some((signal) => reason.includes(signal));
}

export function isAutoRecoverySafe(input: {
  category: string;
  nextAction: string;
  reason?: string;
  checks?: unknown;
}): boolean {
  if (input.category !== "verification_failure") return false;
  if (input.nextAction !== "retry_verification") return false;
  return isTransientVerificationFailure({ reason: input.reason, checks: input.checks });
}
