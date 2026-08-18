import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        user_name: profile?.full_name ?? user.email ?? null,
        action: "logout",
        entity: "auth",
        entity_id: user.id,
        description: `Signed out as ${user.email ?? ""}`,
        details: { sign_out: "manual" },
      });
    } catch {
      /* audit must never block sign-out */
    }
  }

  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}