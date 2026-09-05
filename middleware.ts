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

function b64decode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const financeMatch = pathname.match(/^\/finance\/([^/]+)\/?$/);
  const financeModule = financeMatch?.[1] && FINANCE_MODULES.has(financeMatch[1]) ? financeMatch[1] : null;
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  // Rate-limit login submissions only. Applying the login limiter to every API
  // request made normal POS/realtime traffic fail after 15 requests per minute.
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
      target.cookies.set(cookie);
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

  // Verify the JWT locally/cached via Supabase's claims verification instead of
  // making a network request to Auth for every page/API request. This is the
  // recommended SSR protection path and removes the middleware latency source.
  let claims: { sub?: string; aal?: string } | null = null;
  let userError: any = null;
  try {
    const { data, error: err } = await supabase.auth.getClaims();
    claims = (data?.claims as { sub?: string; aal?: string } | null) ?? null;
    userError = err;
  } catch (err: any) {
    userError = err;
    claims = null;
  }

  let user: { id: string; factors?: { status: string }[] } | null =
    claims?.sub ? { id: claims.sub } : null;

  // MFA is the only path that still needs the current Auth user record: the
  // verified JWT claims tell us the AAL level, while the factor list tells us
  // whether an aal1 session must be challenged. Ordinary sessions stay on the
  // fast getClaims path.
  if (!userError && user && claims?.aal === "aal1") {
    try {
      const { data, error: err } = await supabase.auth.getUser();
      if (err) {
        userError = err;
      } else if (data?.user) {
        user = data.user as typeof user;
      }
    } catch (err: any) {
      userError = err;
    }
  }

  // If Supabase returned an auth error (e.g. Invalid Refresh Token), or if the
  // claims are missing while auth cookies exist, expire and clear all auth
  // cookies on both request and response so the browser drops them immediately.
  if (userError || (!user && hasCookie)) {
    request.cookies.getAll().forEach((c) => {
      if (
        c.name.startsWith("sb-") ||
        c.name.includes("auth-token") ||
        c.name.includes("supabase") ||
        c.name.includes("refresh-token") ||
        c.name.includes("access-token")
      ) {
        request.cookies.delete(c.name);
        response.cookies.set(c.name, "", {
          path: "/",
          maxAge: 0,
          expires: new Date(0),
          sameSite: "none",
          secure: true,
        });
      }
    });

    let projectRef = "";
    try {
      const host = SUPABASE_URL.split("//")[1] || "";
      projectRef = host.split(".")[0] || "";
    } catch {}

    const prefixes = [
      projectRef ? `sb-${projectRef}-auth-token` : "",
      "sb-auth-token",
      "sb-access-token",
      "sb-refresh-token",
      "supabase-auth-token",
    ].filter(Boolean);

    prefixes.forEach((pref) => {
      request.cookies.delete(pref);
      response.cookies.set(pref, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
        sameSite: "none",
        secure: true,
      });
      for (let i = 0; i < 10; i++) {
        const chunkName = `${pref}.${i}`;
        request.cookies.delete(chunkName);
        response.cookies.set(chunkName, "", {
          path: "/",
          maxAge: 0,
          expires: new Date(0),
          sameSite: "none",
          secure: true,
        });
      }
    });
  }

  const aal1SessionWithMfa = Boolean(
    user && claims?.aal === "aal1" && user.factors?.some((f) => f.status === "verified")
  );

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
