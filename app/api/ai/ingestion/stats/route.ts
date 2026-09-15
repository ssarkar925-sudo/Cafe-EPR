import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveIngestionActor, actorHasRoles } from "@/lib/ai/ingestion-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface SourceStats {
  source_type: string;
  source_provider: string;
  collected: number;
  pending_review: number;
  reconciled: number;
  failed: number;
  last_collected_at: string | null;
  last_failure_at: string | null;
}

/**
 * Per-source ingestion observability (Phase 18). Honest aggregates over what
 * actually exists: collected counts, review backlog, reconciled and failed
 * events, plus last-collection / last-failure timestamps per source.
 */
export async function GET(request: Request) {
  try {
    const actor = await resolveIngestionActor(request);
    if (!actorHasRoles(actor, ["admin", "manager"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(request.url);
    const businessId = (url.searchParams.get("business_id") || "default").trim().slice(0, 64) || "default";

    const supabase = await createClient();
    const { data: events, error } = await supabase
      .from("ai_ingestion_events")
      .select("source_type, source_provider, state, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const bySource = new Map<string, SourceStats>();
    for (const e of (events || []) as any[]) {
      const key = `${e.source_type}|||${e.source_provider}`;
      let entry = bySource.get(key);
      if (!entry) {
        entry = {
          source_type: e.source_type,
          source_provider: e.source_provider,
          collected: 0,
          pending_review: 0,
          reconciled: 0,
          failed: 0,
          last_collected_at: null,
          last_failure_at: null,
        };
        bySource.set(key, entry);
      }
      entry.collected++;
      if (e.state === "needs_review" || e.state === "pending") entry.pending_review++;
      if (e.state === "reconciled") entry.reconciled++;
      if (e.state === "failed") {
        entry.failed++;
        if (!entry.last_failure_at) entry.last_failure_at = e.created_at;
      }
      if (!entry.last_collected_at) entry.last_collected_at = e.created_at;
    }

    const { data: drafts } = await supabase
      .from("ai_reconciliation_drafts")
      .select("state")
      .eq("business_id", businessId)
      .limit(2000);
    const draftCounts: Record<string, number> = {};
    for (const d of (drafts || []) as any[]) {
      draftCounts[d.state] = (draftCounts[d.state] || 0) + 1;
    }

    return NextResponse.json({
      business_id: businessId,
      sources: [...bySource.values()],
      drafts: draftCounts,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to load ingestion stats." }, { status: 500 });
  }
}
