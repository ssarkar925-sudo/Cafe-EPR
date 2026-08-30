import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TOKEN_SCOPE = "read_operator_circle";
const DEFAULT_TOKEN_BASE = "https://accounts.payu.in";
const DEFAULT_BBPS_BASE = "https://bbps-sb.payu.in/payu-nbc/v2/nbc";
// Server-only provider credentials are supplied through Vercel environment variables.

type LookupResult = {
  operatorCode: string;
  operatorName: string;
  circleId: string | null;
  circleName: string | null;
  connectionType: string | null;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function firstObject(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstObject(item);
      if (found) return found;
    }
    return null;
  }
  return value as Record<string, any>;
}

function findValue(root: unknown, keys: string[]): unknown {
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  const visit = (node: unknown, depth: number): unknown => {
    if (depth > 8 || node == null) return undefined;
    if (Array.isArray(node)) {
      for (const item of node) {
        const result = visit(item, depth + 1);
        if (result !== undefined && result !== null && result !== "") return result;
      }
      return undefined;
    }
    if (typeof node !== "object") return undefined;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (wanted.has(key.toLowerCase()) && value != null && value !== "") return value;
    }
    for (const value of Object.values(node as Record<string, unknown>)) {
      const result = visit(value, depth + 1);
      if (result !== undefined && result !== null && result !== "") return result;
    }
    return undefined;
  };
  return visit(root, 0);
}

function extractLookup(payload: any): LookupResult | null {
  const root = firstObject(payload?.payload) ?? firstObject(payload);
  if (!root) return null;

  const operatorName = clean(findValue(root, ["operatorName", "operator_name", "operator"]));
  const operatorCode = clean(findValue(root, ["operatorCode", "operator_code", "operatorId", "operator_id"]));
  const circleName = clean(findValue(root, ["circleName", "circle_name", "circle"]));
  const circleId = clean(findValue(root, ["circleId", "circle_id", "circleReferenceId", "circle_reference_id"]));
  const connectionType = clean(findValue(root, ["connectionType", "connection_type", "serviceType", "service_type"]));

  if (!operatorName && !operatorCode) return null;
  return {
    operatorCode,
    operatorName: operatorName || operatorCode,
    circleId: circleId || null,
    circleName: circleName || null,
    connectionType: connectionType || null,
  };
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function getPayUToken(clientId: string, clientSecret: string) {
  const tokenBase = stripTrailingSlash(process.env.PAYU_TOKEN_BASE_URL || DEFAULT_TOKEN_BASE);
  const response = await fetch(`${tokenBase}/oauth/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: TOKEN_SCOPE,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.access_token) {
    throw new Error(body?.error_description || body?.error || "PayU token request failed");
  }
  return String(body.access_token);
}

export async function GET(request: NextRequest) {
  const mobileNumber = clean(request.nextUrl.searchParams.get("mobile"));
  if (!/^[0-9]{10}$/.test(mobileNumber)) {
    return NextResponse.json({ ok: false, source: "invalid_input", error: "A valid 10-digit mobile number is required." }, { status: 400 });
  }

  const clientId = clean(process.env.PAYU_CLIENT_ID);
  const clientSecret = clean(process.env.PAYU_CLIENT_SECRET);
  const agentId = clean(process.env.PAYU_AGENT_ID);

  if (!clientId || !clientSecret || !agentId) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        source: "unconfigured",
        error: "Live recharge provider is not configured in environment.",
      },
      { status: 200 },
    );
  }

  try {
    const token = await getPayUToken(clientId, clientSecret);
    const bbpsBase = stripTrailingSlash(process.env.PAYU_BBPS_BASE_URL || DEFAULT_BBPS_BASE);
    const url = new URL(`${bbpsBase}/getOperatorAndCircleInfo`);
    url.searchParams.set("agentId", agentId);
    url.searchParams.set("mobileNumber", mobileNumber);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, configured: true, source: "payu_error", error: body?.message || "Operator lookup failed at provider.", provider: body },
        { status: 200 },
      );
    }

    const result = extractLookup(body);
    if (!result) {
      return NextResponse.json(
        { ok: false, configured: true, source: "payu_unresolved", error: body?.message || "Provider returned no operator/circle match.", provider: body },
        { status: 200 },
      );
    }

    return NextResponse.json({ ok: true, configured: true, source: "payu_live", ...result }, { status: 200 });
  } catch (error: any) {
    const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.error("[recharge/operator-circle] provider lookup error:", error);
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        source: isTimeout ? "payu_timeout" : "payu_error",
        error: isTimeout ? "Operator lookup timed out" : (error instanceof Error ? error.message : "Live operator lookup failed."),
      },
      { status: isTimeout ? 504 : 200 },
    );
  }
}
