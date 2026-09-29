import { NextResponse } from "next/server";
import { assertSaiChatActor, runSaiChat } from "@/lib/sai/cognition/chat-runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await assertSaiChatActor();
    const body = await request.json().catch(() => null);

    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "SAI_MESSAGE_REQUIRED" }, { status: 400 });
    }

    const result = await runSaiChat({
      message,
      history: body?.history,
      route:
        typeof body?.context?.path === "string"
          ? body.context.path
          : typeof body?.route === "string"
            ? body.route
            : undefined,
      actor,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAI service unavailable";
    const status =
      message === "Unauthorized"
        ? 401
        : message.startsWith("SAI_MESSAGE_")
          ? 400
          : message.startsWith("SAI_MODEL_NOT_CONFIGURED")
            ? 503
            : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
