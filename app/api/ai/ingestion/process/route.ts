import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPendingIngestionEvents } from "@/lib/ai/ingestion-processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Scheduled ingestion processor entrypoint (Phase 17). CRON_SECRET only.
 * Delegates to the shared processor core (also used by the Cloudflare
 * scheduled handler). Bounded batches; never writes financial tables.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const summary = await processPendingIngestionEvents(createAdminClient());
    return NextResponse.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    console.error("[AI Ingestion Process] failed:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Ingestion processing failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
