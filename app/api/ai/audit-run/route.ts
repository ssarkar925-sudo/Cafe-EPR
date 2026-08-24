import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
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

