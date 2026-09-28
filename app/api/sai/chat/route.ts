import { POST as legacyAgentPost } from "@/app/api/ai/agent/route";
import { detectSaiLanguage } from "@/lib/sai/cognition/language";

export const dynamic = "force-dynamic";

/**
 * Canonical SAI chat compatibility adapter.
 * The legacy runtime is temporarily underneath the SAI surface while the
 * cognition/command engine migration proceeds. Language is detected internally
 * on every turn; the user never supplies a language flag.
 */
export async function POST(request: Request) {
  const cloned = await request.clone().json().catch(() => null);
  const message = typeof cloned?.message === "string" ? cloned.message.trim() : "";
  if (!message) return legacyAgentPost(request);

  const language = detectSaiLanguage(message);
  const nextBody = { ...(cloned || {}), language };
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");

  return legacyAgentPost(
    new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify(nextBody),
    }),
  );
}
