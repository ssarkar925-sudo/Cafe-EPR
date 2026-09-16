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
    // Optional targeted mode: ?event_id=<uuid> processes exactly that pending
    // event and returns its explicit per-event result. Otherwise the next
    // bounded batch is processed. Response shape is stable in both modes.
    const url = new URL(request.url);
    const eventId = (url.searchParams.get("event_id") || "").trim();
    if (eventId && !/^[0-9a-f-]{36}$/i.test(eventId)) {
      return NextResponse.json({ error: "event_id must be a UUID." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const result = await processPendingIngestionEvents(
      createAdminClient(),
      eventId ? { eventIds: [eventId] } : undefined,
    );
    const event = eventId ? result.events.find((e) => e.eventId === eventId) || null : null;
    return NextResponse.json({ ok: true, ...result, event }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    console.error("[AI Ingestion Process] failed:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Ingestion processing failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
