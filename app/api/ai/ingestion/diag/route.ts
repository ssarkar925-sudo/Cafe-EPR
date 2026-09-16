import { NextResponse } from "next/server";
import { AUTH_BUILD, describeWorkerAuthRequest } from "@/lib/ai/ingestion-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostics for the worker-auth 401 investigation.
 * Returns only booleans, lengths, and the code build fingerprint —
 * never secret values, hashes, cookies, or header contents.
 * REMOVE this route once the investigation closes.
 */
export async function GET(request: Request) {
  try {
    const info = describeWorkerAuthRequest(request);
    return NextResponse.json({ ...info, build: AUTH_BUILD, temporary: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "diagnostics unavailable" }, { status: 500 });
  }
}
