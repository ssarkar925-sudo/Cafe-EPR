import { NextRequest, NextResponse } from "next/server";
import { getBillProvider } from "@/lib/bill-payment/provider-adapter";
import { getBillerConfig, getFallbackBillerConfig } from "@/lib/bill-payment/biller-metadata";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
function clean(value: unknown): string { return String(value ?? "").trim(); }
function clientIp(request: NextRequest): string { return clean(request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown"); }
async function rateLimit(key: string): Promise<boolean> { const { data, error } = await createAdminClient().rpc("consume_api_rate_limit", { p_key: key, p_limit: 30, p_window_seconds: 60 }); return !error && data === true; }
async function authorize(request: NextRequest): Promise<NextResponse | null> {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  if (!(await rateLimit(`bill-fetch:${clientIp(request)}`))) return NextResponse.json({ ok: false, error: "Too many bill lookup requests. Please retry shortly." }, { status: 429 });
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await authorize(request); if (denied) return denied;
  const { searchParams } = request.nextUrl;
  const billerId = clean(searchParams.get("billerId")); const category = clean(searchParams.get("category"));
  if (!billerId) return NextResponse.json({ ok: false, source: "invalid_input", error: "Biller ID is required." }, { status: 400 });
  const parameters: Record<string, string> = {};
  searchParams.forEach((value, key) => { if (key !== "billerId" && key !== "category") parameters[key] = clean(value); });
  if (Object.keys(parameters).length > 30) return NextResponse.json({ ok: false, source: "invalid_input", error: "Too many bill parameters." }, { status: 400 });
  const biller = getBillerConfig(billerId) || getFallbackBillerConfig(category || "electricity", billerId);
  for (const param of biller.parameters) if (param.required && !parameters[param.key]) return NextResponse.json({ ok: false, source: "invalid_input", error: `Parameter "${param.label}" is required.` }, { status: 400 });
  try {
    const result = await getBillProvider().fetchBill({ billerId, category, parameters });
    return NextResponse.json(result, { status: result.source === "timeout" ? 504 : 200 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, source: "provider_error", error: error instanceof Error ? error.message : "Bill lookup failed" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = await authorize(request); if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const billerId = clean(body?.billerId); const category = clean(body?.category); const parameters: Record<string, string> = {};
    if (body?.parameters && typeof body.parameters === "object" && !Array.isArray(body.parameters)) for (const [k, v] of Object.entries(body.parameters).slice(0, 30)) parameters[k] = clean(v);
    else if (body?.consumerId) parameters.consumerId = clean(body.consumerId);
    if (!billerId) return NextResponse.json({ ok: false, source: "invalid_input", error: "Biller ID is required." }, { status: 400 });
    const result = await getBillProvider().fetchBill({ billerId, category, parameters });
    return NextResponse.json(result, { status: result.source === "timeout" ? 504 : 200 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, source: "provider_error", error: error instanceof Error ? error.message : "Bill lookup failed" }, { status: 502 });
  }
}
