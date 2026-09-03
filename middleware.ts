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
  "/manifest.webmanifest",
  "/api/recharge/operator-circle",
  "/api/bill-payment/fetch",
  "/api/whatsapp/webhook",
];

const FINANCE_MODULES = new Set([
  "cashbook",
  "journal",
  "settlements",
  "trial-balance",
  "expenses",
  "pnl",
  "ledger",
  "reconciliation",
  "opening-balances",
  "accounts",
  "day-close",
]);

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 15;
const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipRequestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRequestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_LOGIN_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.headers.set("X-DNS-Prefetch-Control", "on");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const financeMatch = pathname.match(/^\/finance\/([^/]+)\/?$/);
  const financeModule = financeMatch?.[1] && FINANCE_MODULES.has(financeMatch[1]) ? financeMatch[1] : null;
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  // Rate-limit login submissions only. Applying the login limiter to every API
  // request made normal POS/realtime traffic fail after 15 requests per minute.
  // This remains an edge-local guard; durable abuse prevention belongs at the
  // authentication/provider layer rather than in process memory.
  if (pathname === "/login" && request.method === "POST" && !checkRateLimit(clientIp)) {
    return applySecurityHeaders(
      new NextResponse("Too many sign-in attempts. Please wait 1 minute before trying again.", {
        status: 429,
        headers: { "Retry-After": "60" },
      })
    );
  }

  if (!SUPABASE_URL || !SUPABASE_ANON) {
    if (isPublic(pathname)) return applySecurityHeaders(NextResponse.next());
    if (pathname.startsWith("/api")) {
      return applySecurityHeaders(NextResponse.json({ error: "Server not configured" }, { status: 500 }));
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  if (
    pathname.startsWith("/receipt") ||
    pathname.startsWith("/business/receipt") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/api/recharge/operator-circle" ||
    pathname === "/api/bill-payment/fetch" ||
    pathname === "/api/whatsapp/webhook" ||
    pathname === "/auth/confirm-reset" ||
    pathname === "/auth/reset-password" ||
    pathname === "/logout"
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  const hasCookie = hasAuthCookie(request);

  if (pathname === "/login" && !hasCookie) {
    return applySecurityHeaders(NextResponse.next());
  }

  if (!isPublic(pathname) && !hasCookie) {
    if (pathname.startsWith("/api")) {
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  let response = applySecurityHeaders(NextResponse.next({ request }));

  function finalizeResponse(target: NextResponse, base: NextResponse): NextResponse {
    applySecurityHeaders(target);
    base.cookies.getAll().forEach((cookie) => {
      target.cookies.set(cookie.name, cookie.value);
    });
    return target;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookieOptions: {
      path: "/",
      sameSite: "none",
      secure: true,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = applySecurityHeaders(NextResponse.next({ request }));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            path: "/",
            sameSite: "none",
            secure: true,
          })
        );
      },
    },
  });

  let user: { id: string } | null = null;
  let userError: any = null;
  try {
    const { data: { user: u }, error: err } = await supabase.auth.getUser();
    user = u;
    userError = err;
  } catch (err: any) {
    userError = err;
    user = null;
  }

  // If Supabase returned an auth error (e.g. Invalid Refresh Token), or if user is null while auth cookies exist,
  // expire and clear all auth cookies on the response so the browser drops them immediately.
  if (userError || (!user && hasCookie)) {
    request.cookies.getAll().forEach((c) => {
      if (c.name.startsWith("sb-") || c.name.includes("auth-token") || c.name.includes("supabase")) {
        response.cookies.set(c.name, "", {
          path: "/",
          maxAge: 0,
          expires: new Date(0),
          sameSite: "none",
          secure: true,
        });
      }
    });
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
      return finalizeResponse(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), response);
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return finalizeResponse(NextResponse.redirect(loginUrl), response);
  }

  if (user && !aal1SessionWithMfa && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return finalizeResponse(NextResponse.redirect(url), response);
  }

  // Finance module links are rewritten into the Finance Hub after authentication.
  // This is deliberately a rewrite, never a redirect, so the module stays inside
  // the same application workspace and the existing links continue to work.
  if (user && !aal1SessionWithMfa && financeModule) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/finance";
    rewriteUrl.searchParams.set("module", financeModule);
    return finalizeResponse(NextResponse.rewrite(rewriteUrl, { request }), response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf)$).*)"],
};
