import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["admin", "manager"]);

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required. Please sign in again." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.role || !ALLOWED_ROLES.has(profile.role)) {
      return NextResponse.json({ error: "You do not have permission to record a Quick Sale." }, { status: 403 });
    }

    const body = await request.json();
    const idempotencyKey = String(body?.p_idempotency_key || "").trim();
    if (!idempotencyKey) {
      return NextResponse.json({ error: "Missing idempotency key. Please retry the sale." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("record_quick_sale", {
      p_sale_date: body?.p_sale_date,
      p_amount: body?.p_amount,
      p_cost: body?.p_cost,
      p_customer_id: body?.p_customer_id ?? null,
      p_tendered: body?.p_tendered ?? null,
      p_payments: body?.p_payments ?? [],
      p_items: body?.p_items ?? [],
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to record Quick Sale." },
      { status: 500 }
    );
  }
}
