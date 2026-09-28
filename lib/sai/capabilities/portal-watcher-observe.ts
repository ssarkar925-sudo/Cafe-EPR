import { createClient } from "@/lib/supabase/server";
import { createSaiEvidence } from "@/lib/sai/core/evidence";
import { registerSaiCapability } from "@/lib/sai/core/capabilities";
import type { SaiCapabilityResult } from "@/lib/sai/core/types";

function limitOf(input: Record<string, unknown>): number {
  const n = Number(input.limit ?? 5);
  return Number.isFinite(n) ? Math.max(1, Math.min(10, Math.floor(n))) : 5;
}

async function observeWatcher(
  actor: { userId: string; businessId: string },
  input: Record<string, unknown>,
): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const limit = limitOf(input);
  const portalId = String(input.portalId ?? "").trim();

  const [portals, runs, sources] = await Promise.all([
    (() => {
      let q = supabase
        .from("aeps_portals")
        .select("id,name,code,is_active,remarks")
        .eq("is_active", true)
        .order("name");
      return portalId ? q.eq("id", portalId) : q;
    })(),
    (() => {
      let q = supabase
        .from("aeps_portal_collection_runs")
        .select(
          "id,portal_id,portal_name,started_at,completed_at,source_count,successful_source_count,failed_source_count,conflict_count,verification_status,verified_context,created_by,created_at",
        )
        .order("completed_at", { ascending: false })
        .limit(limit);
      return portalId ? q.eq("portal_id", portalId) : q;
    })(),
    (() => {
      let q = supabase
        .from("aeps_portal_sources")
        .select(
          "id,portal_id,portal_name,url,source_type,purpose,is_enabled,priority,last_checked,last_status,last_message,http_status,extraction_confidence,last_successful_check,current_published_value",
        )
        .eq("is_archived", false)
        .order("priority")
        .order("created_at");
      return portalId ? q.eq("portal_id", portalId) : q;
    })(),
  ]);

  if (portals.error) {
    return { ok: false, error: `SAI_WATCHER_PORTALS_FAILED:${portals.error.message}` };
  }
  if (runs.error) {
    return { ok: false, error: `SAI_WATCHER_RUNS_FAILED:${runs.error.message}` };
  }
  if (sources.error) {
    return { ok: false, error: `SAI_WATCHER_SOURCES_FAILED:${sources.error.message}` };
  }

  const runIds = (runs.data ?? []).map((r: any) => String(r.id));
  let observations: any[] = [];

  if (runIds.length) {
    const { data, error } = await supabase
      .from("aeps_portal_collection_observations")
      .select(
        "id,collection_run_id,source_id,source_url,portal_id,portal_name,purpose,http_status,latency_ms,extracted_at,raw_snippet,normalized_data,confidence,error_message",
      )
      .in("collection_run_id", runIds)
      .order("extracted_at", { ascending: false })
      .limit(100);

    if (error) {
      return {
        ok: false,
        error: `SAI_WATCHER_OBSERVATIONS_FAILED:${error.message}`,
      };
    }

    observations = data ?? [];
  }

  const groupedObservations = new Map<string, any[]>();
  for (const obs of observations) {
    const key = String(obs.collection_run_id);
    const list = groupedObservations.get(key) ?? [];
    list.push({
      id: obs.id,
      sourceId: obs.source_id,
      sourceUrl: obs.source_url,
      purpose: obs.purpose,
      httpStatus: obs.http_status,
      latencyMs: obs.latency_ms,
      extractedAt: obs.extracted_at,
      rawSnippet: String(obs.raw_snippet || "").slice(0, 300),
      normalizedData: obs.normalized_data || {},
      confidence: obs.confidence,
      errorMessage: obs.error_message || null,
    });
    groupedObservations.set(key, list);
  }

  const collectionRuns = (runs.data ?? []).map((run: any) => ({
    id: run.id,
    portalId: run.portal_id,
    portalName: run.portal_name,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    sourceCount: run.source_count,
    successfulSourceCount: run.successful_source_count,
    failedSourceCount: run.failed_source_count,
    conflictCount: run.conflict_count,
    verificationStatus: run.verification_status,
    verifiedContext: run.verified_context || {},
    observations: groupedObservations.get(String(run.id)) ?? [],
  }));

  const output = {
    observed: true,
    selectedPortalId: portalId || null,
    portals: portals.data ?? [],
    enabledSourceCount: (sources.data ?? []).filter((s: any) => s.is_enabled).length,
    sources: (sources.data ?? []).map((s: any) => ({
      id: s.id,
      portalId: s.portal_id,
      portalName: s.portal_name,
      url: s.url,
      sourceType: s.source_type,
      purpose: s.purpose,
      enabled: s.is_enabled,
      priority: s.priority,
      lastChecked: s.last_checked,
      lastSuccessfulCheck: s.last_successful_check,
      lastStatus: s.last_status,
      httpStatus: s.http_status,
      extractionConfidence: s.extraction_confidence,
      publishedValue: s.current_published_value || {},
    })),
    collectionRuns,
    authorityNote:
      "Portal Watcher is an evidence source. SAI may diagnose or prepare actions, but it does not automatically change production pricing, commission, fees, or transactions.",
  };

  const evidenceId = `sai:watcher:${crypto.randomUUID()}`;
  await createSaiEvidence({
    evidenceId,
    actor,
    sourceType: "cafeerp.aeps.portal_watcher",
    sourceRef: portalId || "all-portals",
    data: output,
    confidence: collectionRuns.length ? 1 : 0.8,
  });

  return { ok: true, output, evidenceIds: [evidenceId] };
}

export function registerPortalWatcherCapability(): void {
  try {
    registerSaiCapability({
      id: "aeps.observe_watcher",
      description:
        "Observe configured Portal Watcher sources, latest multi-source collection runs, per-source observations, and cross-verification status.",
      domain: "aeps",
      kind: "observe",
      risk: "read",
      requiresApproval: false,
      mutates: false,
      verificationRequired: false,
      execute: async (input, ctx) => observeWatcher(ctx.command.actor, input),
    });
  } catch {
    // Idempotent module initialization.
  }
}

registerPortalWatcherCapability();
