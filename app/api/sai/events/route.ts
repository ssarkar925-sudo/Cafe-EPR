import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { observeSaiEvent } from "@/lib/sai/cognition/runtime";
import type { SaiEvent } from "@/lib/sai/core/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const event: SaiEvent = {
    eventId: typeof body.eventId === "string" && body.eventId ? body.eventId : crypto.randomUUID(),
    type: typeof body.type === "string" ? body.type : "",
    occurredAt: typeof body.occurredAt === "string" ? body.occurredAt : new Date().toISOString(),
    entityId: typeof body.entityId === "string" ? body.entityId : undefined,
    actor: { userId: auth.user.id, businessId: String(body.businessId || auth.user.id), role: role as string },
    payload: body.payload && typeof body.payload === "object" ? body.payload : {},
    evidenceIds: Array.isArray(body.evidenceIds) ? body.evidenceIds.filter((id: unknown): id is string => typeof id === "string") : [],
  };

  if (!event.type) return NextResponse.json({ error: "Event type is required" }, { status: 400 });

  await observeSaiEvent(event);
  return NextResponse.json({ accepted: true, eventId: event.eventId });
}