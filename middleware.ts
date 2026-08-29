import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const PUBLIC_PATHS = [
  "/login",
  "/auth/confirm-reset",
  "/auth/reset-password",
  "/logout",
  "/receipt",
  "/business/receipt",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

// In-memory rate limiter tracker
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_LOGIN_ATTEMPTS = 15; // Max 15 attempts per min per IP
const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipRequestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRequestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    return false; // Rate limit exceeded
  }
  entry.count++;
  return true;
}

function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.headers.set("X-DNS-Prefetch-Control", "on");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  // Rate-limit sensitive API, Login, and Public Receipt routes
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/receipt") ||
    pathname.startsWith("/business/receipt")
  ) {
    if (!checkRateLimit(clientIp)) {
      return applySecurityHeaders(
        new NextResponse("Rate limit exceeded. Please wait 1 minute before trying again.", {
          status: 429,
          headers: { "Retry-After": "60" },
        })
      );
    }
  }

  // Missing Supabase env vars fallback
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    if (isPublic(pathname)) return applySecurityHeaders(NextResponse.next());
    if (pathname.startsWith("/api")) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Server not configured" }, { status: 500 })
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // Fast-path 1: Public customer receipts and confirmation routes don't need auth checks
  if (
    pathname.startsWith("/receipt") ||
    pathname.startsWith("/business/receipt") ||
    pathname === "/auth/confirm-reset" ||
    pathname === "/auth/reset-password" ||
    pathname === "/logout"
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  const hasCookie = hasAuthCookie(request);

  // Fast-path 2: Visiting login page with NO auth cookie -> render immediately (0ms latency)
  if (pathname === "/login" && !hasCookie) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Fast-path 3: Visiting protected page with NO auth cookie
  if (!isPublic(pathname) && !hasCookie) {
    if (pathname.startsWith("/api")) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // Active session exists: create Supabase client for validation/refresh
  let response = applySecurityHeaders(NextResponse.next({ request }));

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = applySecurityHeaders(NextResponse.next({ request }));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  let user: { id: string } | null = null;
  try {
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    user = u;
  } catch {
    user = null;
  }

  function b64decode(input: string): string {
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
    return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  }
  function extractAccessToken(): string | null {
    const chunks: string[] = [];
    for (let i = 0; i < 6; i++) {
      const name = `${cookiePrefix}${i === 0 ? "" : "." + i}`;
      const value = request.cookies.get(name)?.value;
      if (value) chunks.push(value);
    }
    const raw = chunks.join("");
    if (!raw) return null;
    try {
      const encoded = raw.startsWith("base64-") ? raw.slice("base64-".length) : raw;
      const session = JSON.parse(b64decode(encoded)) as { access_token?: string };
      return typeof session.access_token === "string" ? session.access_token : null;
    } catch {
      return null;
    }
  }
  let cookiePrefix = "sb-auth-token";
  try {
    const host = SUPABASE_URL.split("//")[1] || "";
    const projectRef = host.split(".")[0] || "";
    if (projectRef) cookiePrefix = `sb-${projectRef}-auth-token`;
  } catch {
    cookiePrefix = "sb-auth-token";
  }
  const accessToken = extractAccessToken();
  let aal1SessionWithMfa = false;
  if (user && accessToken) {
    try {
      const payload = JSON.parse(b64decode(accessToken.split(".")[1])) as { aal?: string };
      const factors = (user as { factors?: { status: string }[] }).factors;
      if (payload.aal === "aal1" && factors?.some((f) => f.status === "verified")) {
        aal1SessionWithMfa = true;
      }
    } catch {
      /* never block on a decoding hiccup */
    }
  }

  if ((!user || aal1SessionWithMfa) && !isPublic(pathname)) {
    if (pathname.startsWith("/api")) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  if (user && !aal1SessionWithMfa && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf)$).*)"],
};
