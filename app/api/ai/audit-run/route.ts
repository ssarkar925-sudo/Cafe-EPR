import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";

export async function POST(req: NextRequest) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();
    const body = await req.json().catch(() => ({}));
    const triggeredBy = body?.triggered_by || "manual";

    const { data, error } = await supabase.rpc("run_canonical_self_audit", {
      p_triggered_by: triggeredBy,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to run audit" }, { status: 500 });
  }
}

