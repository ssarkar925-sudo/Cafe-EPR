import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function handleLogout(request: Request | NextRequest) {
  const supabase = await createClient();

  try {
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
  } catch {
    /* ignore session read errors during signout */
  }

  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Supabase signOut error:", err);
  }

  const loginUrl = new URL("/login", request.url);
  const response = NextResponse.redirect(loginUrl, 303);

  // Explicitly expire and delete all authentication and Supabase session cookies
  const cookieHeader = request.headers.get("cookie") || "";
  const cookiePairs = cookieHeader.split(";").map((c) => c.trim().split("=")[0]);

  cookiePairs.forEach((cookieName) => {
    if (
      cookieName.startsWith("sb-") ||
      cookieName.includes("auth-token") ||
      cookieName.includes("supabase") ||
      cookieName.includes("session")
    ) {
      response.cookies.set(cookieName, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
        httpOnly: true,
        sameSite: "none",
        secure: true,
      });
      response.cookies.delete(cookieName);
    }
  });

  // Strict anti-caching headers to prevent browser back-button caching
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}

export async function POST(request: Request) {
  return handleLogout(request);
}

export async function GET(request: Request) {
  return handleLogout(request);
}