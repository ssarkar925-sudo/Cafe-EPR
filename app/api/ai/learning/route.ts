import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/authz";

const ALLOWED_RISKS = new Set(["low", "medium", "high", "critical"]);

function forbidden() {
  return NextResponse.json({ error: "Owner/admin control is required." }, { status: 403 });
}

export async function GET() {
  const role = await getUserRole();
  if (role !== "admin") return forbidden();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("ai_workflow_versions")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("workflow_key", { ascending: true })
    .order("version", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workflows: data ?? [] });
}

export async function POST(request: Request) {
  const role = await getUserRole();
  if (role !== "admin") return forbidden();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const workflowKey = typeof body?.workflow_key === "string" ? body.workflow_key.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
  const risk = typeof body?.risk === "string" ? body.risk : "low";
  const confidenceRaw = typeof body?.confidence === "number" ? body.confidence : 1;
  const evidence = body?.evidence && typeof body.evidence === "object" ? body.evidence : {};
  const selectorMap = body?.selector_map && typeof body.selector_map === "object" ? body.selector_map : {};

  if (!workflowKey || !name || !instruction) {
    return NextResponse.json({ error: "Workflow key, name, and instruction are required." }, { status: 400 });
  }
  if (!ALLOWED_RISKS.has(risk)) return NextResponse.json({ error: "Invalid risk level." }, { status: 400 });
  const confidence = Math.min(1, Math.max(0, confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw));

  const { data: latest } = await supabase
    .from("ai_workflow_versions")
    .select("id, version, status")
    .eq("user_id", auth.user.id)
    .eq("workflow_key", workflowKey)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = Number(latest?.version ?? 0) + 1;
  const { data, error } = await supabase
    .from("ai_workflow_versions")
    .insert({
      user_id: auth.user.id,
      workflow_key: workflowKey,
      version,
      name,
      risk,
      status: "draft",
      confidence,
      instruction,
      evidence,
      selector_map: selectorMap,
      supersedes_id: latest?.id ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workflow: data }, { status: 201 });
}
