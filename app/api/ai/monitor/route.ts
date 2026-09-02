import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBusinessMonitorScan } from "@/lib/ai/business-monitor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache", ...(init?.headers || {}) },
  });
}

export async function GET() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) return noStore({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const { data: events, error } = await db
    .from("ai_monitor_events")
    .select("id,severity,source,title,details,status,detected_at")
    .in("status", ["open", "acknowledged"])
    .order("detected_at", { ascending: false })
    .limit(100);
  if (error) return noStore({ error: error.message }, { status: 500 });
  return noStore({ events: events || [] });
}

export async function POST(request: Request) {
  const role = await getUserRole();
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";
  const cronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
  if (!cronAuthorized && !hasRole(role, ["admin"])) return noStore({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await runBusinessMonitorScan();
    return noStore(result, { status: 200 });
  } catch (err: any) {
    console.error("[AI Monitor] scan failed:", err?.message || err);
    return noStore({ error: err?.message || "Business monitor scan failed" }, { status: 500 });
  }
}
