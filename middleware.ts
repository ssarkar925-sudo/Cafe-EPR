import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

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
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  res.headers.set("X-DNS-Prefetch-Control", "on");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function clearAuthCookies(response: NextResponse, request: NextRequest) {
  request.cookies.getAll().forEach((cookie) => {
    if (
      cookie.name.startsWith("sb-") ||
      cookie.name.includes("auth-token") ||
      cookie.name.includes("supabase")
    ) {
      response.cookies.set(cookie.name, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
        sameSite: "none",
        secure: true,
      });
    }
  });
}

function copyCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie.name, cookie.value);
  });
}

function finalizeResponse(target: NextResponse, base: NextResponse): NextResponse {
  copyCookies(target, base);
  return applySecurityHeaders(target);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const financeMatch = pathname.match(/^\/finance\/([^/]+)\/?$/);
  const financeModule =
    financeMatch?.[1] && FINANCE_MODULES.has(financeMatch[1])
      ? financeMatch[1]
      : null;
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  // Rate-limit login submissions only; normal application/API requests are not throttled here.
  if (
    pathname === "/login" &&
    request.method === "POST" &&
    !checkRateLimit(clientIp)
  ) {
    return applySecurityHeaders(
      new NextResponse(
        "Too many sign-in attempts. Please wait 1 minute before trying again.",
        {
          status: 429,
          headers: { "Retry-After": "60" },
        }
      )
    );
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
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

  // Explicitly public endpoints must remain reachable without an Auth session.
  if (isPublic(pathname)) {
    let response = applySecurityHeaders(NextResponse.next({ request }));

    // A signed-in user visiting /login should still go to the dashboard.
    if (pathname !== "/login") return response;

    const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = applySecurityHeaders(NextResponse.next({ request }));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    try {
      const { data } = await supabase.auth.getClaims();
      if (data?.claims) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return finalizeResponse(NextResponse.redirect(url), response);
      }
    } catch {
      // Public login page should remain reachable if Auth is temporarily unavailable.
    }

    return response;
  }

  // Create a request-scoped SSR client. Supabase recommends a fresh server client per request.
  let response = applySecurityHeaders(NextResponse.next({ request }));
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        headers
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = applySecurityHeaders(NextResponse.next({ request }));
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims() verifies the JWT and is the auth check used for protecting routes.
  let claims: { sub?: string; aal?: string; [key: string]: unknown } | null = null;
  let authError: unknown = null;
  try {
    const result = await supabase.auth.getClaims();
    claims = (result.data?.claims as typeof claims) ?? null;
    authError = result.error ?? null;
  } catch (error) {
    authError = error;
  }

  if (authError || !claims?.sub) {
    clearAuthCookies(response, request);

    if (pathname.startsWith("/api")) {
      return finalizeResponse(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        response
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return finalizeResponse(NextResponse.redirect(loginUrl), response);
  }

  // Preserve the existing MFA requirement: users with verified MFA factors must
  // complete an AAL2 session before accessing protected application routes.
  let aal1SessionWithMfa = false;
  if (claims.aal === "aal1") {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const factors = (userData.user as { factors?: { status: string }[] } | null)?.factors;
      aal1SessionWithMfa = !!factors?.some((factor) => factor.status === "verified");
    } catch {
      aal1SessionWithMfa = false;
    }
  }

  if (aal1SessionWithMfa) {
    if (pathname.startsWith("/api")) {
      return finalizeResponse(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        response
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return finalizeResponse(NextResponse.redirect(loginUrl), response);
  }

  // Finance module links are rewritten into the Finance Hub after authentication.
  if (financeModule) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/finance";
    rewriteUrl.searchParams.set("module", financeModule);
    return finalizeResponse(NextResponse.rewrite(rewriteUrl, { request }), response);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf)$).*)",
  ],
};
