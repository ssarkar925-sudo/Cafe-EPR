import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveIngestionActor, actorHasRoles } from "@/lib/ai/ingestion-auth";
import {
  DRAFT_ACTION_TYPES,
  DRAFT_STATES,
  HIGH_RISK_DRAFT_ACTIONS,
  type DraftActionType,
  type DraftState,
} from "@/lib/ai/ingestion-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function classifyRisk(action: DraftActionType): "low" | "medium" | "high" {
  if (HIGH_RISK_DRAFT_ACTIONS.has(action)) return "high";
  if (action === "link_customer" || action === "reconcile_transaction") return "medium";
  return "low";
}

/**
 * Create a reconciliation draft (proposal only — never executes anything).
 * Older pending drafts for the same event+action are superseded.
 */
export async function POST(request: Request) {
  try {
    const actor = await resolveIngestionActor(request);
    if (!actorHasRoles(actor, ["admin", "manager", "staff"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isWorker = actor!.type === "worker";
    const supabase = isWorker ? createAdminClient() : await createClient();
    if (!isWorker) {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const action = String(body?.action_type || "") as DraftActionType;
    if (!(DRAFT_ACTION_TYPES as readonly string[]).includes(action)) {
      return NextResponse.json({ error: "Valid action_type is required." }, { status: 400 });
    }
    const businessId = String(body?.business_id || "default").trim().slice(0, 64) || "default";
    const sourceEventId = body?.source_event_id ? String(body.source_event_id) : null;
    if (sourceEventId && !/^[0-9a-f-]{36}$/i.test(sourceEventId)) {
      return NextResponse.json({ error: "source_event_id must be a UUID." }, { status: 400 });
    }
    const targetEntity = String(body?.target_entity || "").trim().slice(0, 64);
    if (!targetEntity) return NextResponse.json({ error: "target_entity is required." }, { status: 400 });
    const targetId = body?.target_id ? String(body.target_id) : null;
    if (targetId && !/^[0-9a-f-]{36}$/i.test(targetId)) {
      return NextResponse.json({ error: "target_id must be a UUID." }, { status: 400 });
    }
    const confidenceRaw = Number(body?.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : null;

    const proposed = body?.proposed_payload && typeof body.proposed_payload === "object" ? body.proposed_payload : {};
    const evidence = body?.evidence && typeof body.evidence === "object" ? body.evidence : {};

    // Supersede stale pending drafts for the same event + action.
    if (sourceEventId) {
      await supabase
        .from("ai_reconciliation_drafts")
        .update({ state: "superseded" })
        .eq("business_id", businessId)
        .eq("source_event_id", sourceEventId)
        .eq("action_type", action)
        .eq("state", "pending");
    }

    const { data, error } = await supabase
      .from("ai_reconciliation_drafts")
      .insert({
        business_id: businessId,
        source_event_id: sourceEventId,
        action_type: action,
        target_entity: targetEntity,
        target_id: targetId,
        proposed_payload: proposed,
        evidence,
        confidence,
        risk_level: classifyRisk(action),
        state: "pending",
      })
      .select("id, state, risk_level, action_type")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ draft: data, requiresOwnerApproval: classifyRisk(action) === "high" }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to create draft." }, { status: 500 });
  }
}

const TRANSITIONS: Record<string, DraftState[]> = {
  pending: ["approved", "rejected", "superseded"],
  approved: ["applied", "failed"],
  failed: ["pending"],
};

/**
 * Transition a draft. Approvals/rejections are admin-only. `applied` requires
 * an applied_ref proving application code executed the write — drafts never
 * apply themselves.
 */
export async function PATCH(request: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin"])) {
      return NextResponse.json({ error: "Owner approval is required." }, { status: 403 });
    }
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const id = String(body?.id || "");
    const transition = String(body?.transition || "") as DraftState;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Valid draft id is required." }, { status: 400 });
    if (!(DRAFT_STATES as readonly string[]).includes(transition)) {
      return NextResponse.json({ error: "Valid transition is required." }, { status: 400 });
    }

    const { data: current } = await supabase
      .from("ai_reconciliation_drafts")
      .select("id, state")
      .eq("id", id)
      .maybeSingle();
    if (!current) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    if (!TRANSITIONS[(current as any).state]?.includes(transition)) {
      return NextResponse.json(
        { error: `Transition from ${(current as any).state} to ${transition} is not allowed.` },
        { status: 409 },
      );
    }

    const patch: Record<string, unknown> = { state: transition };
    if (transition === "approved") {
      patch.approved_by = auth.user.id;
      patch.approved_at = new Date().toISOString();
    }
    if (transition === "applied") {
      const ref = String(body?.applied_ref || "").trim().slice(0, 200);
      if (!ref) return NextResponse.json({ error: "applied_ref evidence is required to mark a draft applied." }, { status: 400 });
      patch.applied_ref = ref;
    }

    const { data, error } = await supabase
      .from("ai_reconciliation_drafts")
      .update(patch)
      .eq("id", id)
      .select("id, state, action_type, risk_level")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ draft: data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to transition draft." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const actor = await resolveIngestionActor(request);
    if (!actorHasRoles(actor, ["admin", "manager"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(request.url);
    const businessId = (url.searchParams.get("business_id") || "default").trim().slice(0, 64) || "default";
    const state = url.searchParams.get("state") || "";
    const risk = url.searchParams.get("risk_level") || "";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);

    const supabase = await createClient();
    let query = supabase
      .from("ai_reconciliation_drafts")
      .select("id, business_id, source_event_id, action_type, target_entity, target_id, proposed_payload, evidence, confidence, risk_level, state, approved_by, approved_at, applied_ref, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (state) query = query.eq("state", state);
    if (risk) query = query.eq("risk_level", risk);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ drafts: data || [], count: (data || []).length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to list drafts." }, { status: 500 });
  }
}
