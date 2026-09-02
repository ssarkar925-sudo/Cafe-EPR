import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("ai_memories").select("id,category,memory_key,memory_value,source,confidence,active,created_at,updated_at").eq("user_id", auth.user.id).eq("active", true).order("updated_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memories: data || [] });
}

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const category = typeof body?.category === "string" ? body.category : "instruction";
  const key = typeof body?.memory_key === "string" ? body.memory_key.trim() : "";
  if (!key || body?.memory_value === undefined) return NextResponse.json({ error: "memory_key and memory_value are required" }, { status: 400 });
  const { data, error } = await supabase.from("ai_memories").upsert({ user_id: auth.user.id, category, memory_key: key, memory_value: body.memory_value, source: "owner", confidence: 1, active: true, updated_at: new Date().toISOString() }, { onConflict: "user_id,category,memory_key" }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memory: data });
}

export async function DELETE(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Memory id is required" }, { status: 400 });
  const { error } = await supabase.from("ai_memories").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ forgotten: true });
}
