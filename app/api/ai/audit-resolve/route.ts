import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";

export async function POST(req: NextRequest) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();
    const body = await req.json();

    if (!body || !body.finding_id || !body.status) {
      return NextResponse.json({ error: "Missing finding_id or status" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("resolve_audit_finding", {
      p_finding_id: body.finding_id,
      p_status: body.status,
      p_note: body.note || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to resolve finding" }, { status: 500 });
  }
}

