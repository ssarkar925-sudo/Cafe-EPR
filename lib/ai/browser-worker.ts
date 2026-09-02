import type { ImportedTransaction } from "@/lib/ai/transaction-import";

export type BrowserWorkerStopReason =
  | "login_required"
  | "mfa_required"
  | "secret_requested"
  | "captcha_detected"
  | "layout_changed"
  | "ambiguous_transaction"
  | "non_completed_transaction"
  | "initiation_control_detected"
  | "workflow_not_learned";

export type BrowserWorkerResult =
  | {
      state: "completed";
      transactions: ImportedTransaction[];
    }
  | {
      state: "stopped";
      reason: BrowserWorkerStopReason;
      message: string;
    };

/**
 * Minimal page surface required by the portal worker. The implementation is
 * supplied by the controlled browser runtime (for example Playwright).
 * Keeping the interface here prevents the web app from owning browser
 * credentials or a persistent browser session.
 */
export type ReadOnlyBrowserPage = {
  url(): string;
  textContent(selector: string): Promise<string | null>;
  locatorCount(selector: string): Promise<number>;
  click(selector: string): Promise<void>;
  goto(url: string): Promise<void>;
};

export type ReadOnlyBrowserSession = {
  page: ReadOnlyBrowserPage;
  close(): Promise<void>;
};

const SECRET_PATTERNS = [
  /\botp\b/i,
  /\bone[- ]time password\b/i,
  /\bpin\b/i,
  /\bpassword\b/i,
  /\bpasscode\b/i,
  /\baadhaar\b/i,
  /\bpayment authorization\b/i,
];

const AUTH_PATTERNS = [
  /\blog[ -]?in\b/i,
  /\bsign[ -]?in\b/i,
  /\bmfa\b/i,
  /\bverification code\b/i,
];

const CAPTCHA_PATTERNS = [/\bcaptcha\b/i, /\brecaptcha\b/i, /\bsecurity check\b/i];

/** Fail closed when a page asks for authentication or a secret. */
export function inspectPageForStopConditions(text: string): BrowserWorkerStopReason | null {
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) return "secret_requested";
  if (CAPTCHA_PATTERNS.some((pattern) => pattern.test(text))) return "captcha_detected";
  if (AUTH_PATTERNS.some((pattern) => pattern.test(text))) return "login_required";
  return null;
}

/**
 * Browser execution is intentionally separate from the Next.js request path.
 * This helper enforces the common safety boundary before an adapter is run.
 */
export async function runReadOnlyPortalWorker(
  session: ReadOnlyBrowserSession,
  adapter: {
    providerName: string;
    readOnly: true;
    collect(page: ReadOnlyBrowserPage): Promise<BrowserWorkerResult>;
  },
): Promise<BrowserWorkerResult> {
  if (!adapter.readOnly) {
    await session.close();
    return {
      state: "stopped",
      reason: "initiation_control_detected",
      message: "Portal worker rejected a non-read-only adapter.",
    };
  }

  try {
    const pageText = (await session.page.textContent("body")) ?? "";
    const stopReason = inspectPageForStopConditions(pageText);
    if (stopReason) {
      return {
        state: "stopped",
        reason: stopReason,
        message: `Stopped before portal collection because ${stopReason.replaceAll("_", " ")}.`,
      };
    }

    const result = await adapter.collect(session.page);
    return result;
  } finally {
    await session.close();
  }
}
