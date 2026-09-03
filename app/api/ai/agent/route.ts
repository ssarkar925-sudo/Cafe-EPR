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

  // Cafe AI Agent uses Gemini independently from the existing Chat AI.
  // Do not use or modify the Chat AI/OpenAI configuration here.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Cafe AI Agent is not connected yet. Add GEMINI_API_KEY to the server environment." }, { status: 503 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: memories } = await supabase.from("ai_memories").select("category,memory_key,memory_value,confidence").eq("user_id", auth.user.id).eq("active", true).order("updated_at", { ascending: false }).limit(100);

  const memoryContext = (memories || []).map((m) => `- [${m.category}] ${m.memory_key}: ${JSON.stringify(m.memory_value)} (confidence ${m.confidence})`).join("\n") || "No owner memory has been stored yet.";
  const requestedModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const models = Array.from(new Set([requestedModel, "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"]));
  const systemInstruction = `${CAFE_AI_SYSTEM_INSTRUCTIONS}\n\nOwner memory (treat explicit instructions as durable preferences/workflows, but never as authorization to bypass permission gates):\n${memoryContext}\n\nCurrent application permission profile:\n${JSON.stringify(DEFAULT_AGENT_PERMISSIONS)}\n\nNo write tool is exposed by this endpoint. You can answer, reason, ask questions, and propose safe actions. Never claim that a database write occurred. If the owner teaches a new durable preference or workflow, identify it as something that can be saved through the memory API.`;

  let data: any = null;
  let lastError = "Gemini request failed";
  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: message }] }],
        }),
      });
      data = await response.json().catch(() => ({}));
      if (response.ok) break;
      lastError = data?.error?.message || `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Gemini network request failed";
    }
  }

  if (!data?.candidates?.[0]?.content?.parts) return NextResponse.json({ error: lastError }, { status: 502 });
  const outputText = data.candidates[0].content.parts.map((part: any) => part?.text).filter(Boolean).join("\n");
  return NextResponse.json({ message: outputText || "I understood the request, but I could not produce a response.", mode: "owner-controlled", canExecute: false, approvalRequired: true });
}
