import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { CAFE_AI_SYSTEM_INSTRUCTIONS, DEFAULT_AGENT_PERMISSIONS } from "@/lib/ai/agent-policy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Cafe AI is not connected yet. Add OPENAI_API_KEY to the server environment." }, { status: 503 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: memories } = await supabase.from("ai_memories").select("category,memory_key,memory_value,confidence").eq("user_id", auth.user.id).eq("active", true).order("updated_at", { ascending: false }).limit(100);

  const memoryContext = (memories || []).map((m) => `- [${m.category}] ${m.memory_key}: ${JSON.stringify(m.memory_value)} (confidence ${m.confidence})`).join("\n") || "No owner memory has been stored yet.";
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      instructions: `${CAFE_AI_SYSTEM_INSTRUCTIONS}\n\nOwner memory (treat explicit instructions as durable preferences/workflows, but never as authorization to bypass permission gates):\n${memoryContext}\n\nCurrent application permission profile:\n${JSON.stringify(DEFAULT_AGENT_PERMISSIONS)}\n\nNo write tool is exposed by this endpoint. You can answer, reason, ask questions, and propose safe actions. Never claim that a database write occurred. If the owner teaches a new durable preference or workflow, identify it as something that can be saved through the memory API.`,
      input: message,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: data?.error?.message || "OpenAI request failed" }, { status: 502 });
  const outputText = typeof data?.output_text === "string" ? data.output_text : Array.isArray(data?.output) ? data.output.flatMap((item: any) => item?.content || []).map((part: any) => part?.text).filter(Boolean).join("\n") : "";
  return NextResponse.json({ message: outputText || "I understood the request, but I could not produce a response.", mode: "owner-controlled", canExecute: false, approvalRequired: true });
}
