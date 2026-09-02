import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

// This endpoint records monitoring observations; it does not mutate business data.
// A scheduler/webhook can invoke it after the production environment is configured.
export async function GET() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: events, error } = await supabase.from("ai_monitor_events").select("id,severity,source,title,details,status,detected_at").in("status", ["open", "acknowledged"]).order("detected_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: events || [] });
}

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const severity = body?.severity;
  const source = body?.source;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!["info", "attention", "critical"].includes(severity) || !["application", "business", "transaction", "security", "customer", "inventory", "system"].includes(source) || !title) return NextResponse.json({ error: "Invalid monitoring event" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_monitor_events").insert({ severity, source, title, details: body?.details && typeof body.details === "object" ? body.details : {} }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
