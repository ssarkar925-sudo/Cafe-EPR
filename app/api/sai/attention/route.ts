import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { resolveSaiAttention } from "@/lib/sai/core/attention";

export const dynamic = "force-dynamic";

async function authorize() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  return { supabase, userId: auth.user.id };
}

export async function GET() {
  const auth = await authorize();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: attention, error } = await auth.supabase
    .from("sai_attention")
    .select("attention_id,type,severity,title,detail,evidence_ids,source_type,source_ref,status,resolution,diagnosis_category,diagnosis_explanation,recommended_action,auto_recovery_allowed,diagnosis_status,created_at,resolved_at")
    .eq("actor_user_id", auth.userId)
    .in("status", ["open", "acknowledged"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (attention ?? []).map((item) => item.attention_id);
  const { data: diagnoses, error: diagnosisError } = ids.length
    ? await auth.supabase.from("sai_diagnoses").select("diagnosis_id,attention_id,category,confidence,summary,findings,next_action,evidence_ids,status,created_at").in("attention_id", ids).order("created_at", { ascending: false })
    : { data: [], error: null };

  if (diagnosisError) return NextResponse.json({ error: diagnosisError.message }, { status: 500 });

  return NextResponse.json({ attention: attention ?? [], diagnoses: diagnoses ?? [] });
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const attentionId = typeof body?.attentionId === "string" ? body.attentionId : "";
  const action = body?.action === "acknowledge" || body?.action === "resolve" ? body.action : "";
  if (!attentionId || !action) return NextResponse.json({ error: "attentionId and action are required" }, { status: 400 });

  const { data: item, error: lookupError } = await auth.supabase
    .from("sai_attention")
    .select("attention_id,status")
    .eq("attention_id", attentionId)
    .eq("actor_user_id", auth.userId)
    .maybeSingle();

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Attention not found" }, { status: 404 });

  if (action === "resolve") {
    await resolveSaiAttention(attentionId, typeof body?.resolution === "string" && body.resolution.trim() ? body.resolution.trim() : "Resolved by operator");
  } else {
    const { error } = await auth.supabase.from("sai_attention").update({ status: "acknowledged" }).eq("attention_id", attentionId).eq("actor_user_id", auth.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, attentionId, action });
}
