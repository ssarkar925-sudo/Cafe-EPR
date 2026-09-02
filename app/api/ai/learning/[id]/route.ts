import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/authz";

const ACTIONS = new Set(["activate", "disable", "revoke", "rollback"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const role = await getUserRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Owner/admin control is required." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { action?: string } | null;
  const action = body?.action ?? "";
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Invalid workflow action." }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: target, error: targetError } = await supabase
    .from("ai_workflow_versions")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .single();

  if (targetError || !target) return NextResponse.json({ error: "Workflow version not found." }, { status: 404 });
  if (action === "activate" || action === "rollback") {
    if (target.status === "revoked") {
      return NextResponse.json({ error: "Revoked workflow versions cannot be activated. Create a new version instead." }, { status: 409 });
    }

    const { error: archiveError } = await supabase
      .from("ai_workflow_versions")
      .update({ status: "archived" })
      .eq("user_id", auth.user.id)
      .eq("workflow_key", target.workflow_key)
      .eq("status", "active")
      .neq("id", target.id);

    if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });

    const { data, error } = await supabase
      .from("ai_workflow_versions")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", target.id)
      .eq("user_id", auth.user.id)
      .neq("status", "revoked")
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ workflow: data });
  }

  if (action === "disable") {
    const { data, error } = await supabase
      .from("ai_workflow_versions")
      .update({ status: "disabled", disabled_at: new Date().toISOString(), disabled_by: auth.user.id })
      .eq("id", target.id)
      .eq("user_id", auth.user.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ workflow: data });
  }

  const { data, error } = await supabase
    .from("ai_workflow_versions")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: auth.user.id })
    .eq("id", target.id)
    .eq("user_id", auth.user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workflow: data });
}
