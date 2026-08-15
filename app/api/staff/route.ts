import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getUserRole, hasRole } from "@/lib/authz";

export async function POST(request: Request) {
  if (!hasRole(await getUserRole(), ["admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const admin = createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "create") {
      const { name, email, password, role } = body;
      if (!email || !password) {
        return NextResponse.json({ error: "Email and password required" }, { status: 400 });
      }
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      await admin
        .from("profiles")
        .update({ full_name: name ?? "", role: role ?? "staff" })
        .eq("id", data.user.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "update") {
      const { id, full_name, role, is_active, password } = body;
      if (!id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      const patch: Record<string, unknown> = {};
      if (typeof full_name === "string") patch.full_name = full_name;
      if (typeof role === "string") patch.role = role;
      if (typeof is_active === "boolean") patch.is_active = is_active;
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (password) {
        const { error: perr } = await admin.auth.admin.updateUserById(id, {
          password,
        });
        if (perr) {
          return NextResponse.json({ error: perr.message }, { status: 400 });
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
