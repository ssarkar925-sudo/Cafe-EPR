"use client";

import { useEffect, useMemo, useState } from "react";

type Risk = "low" | "medium" | "high" | "critical";
type Status = "draft" | "active" | "disabled" | "revoked" | "archived";
type Workflow = {
  id: string;
  workflow_key: string;
  version: number;
  name: string;
  risk: Risk;
  status: Status;
  confidence: number;
  instruction: string;
  evidence: Record<string, unknown>;
  selector_map: Record<string, unknown>;
  created_at: string;
  activated_at: string | null;
  revoked_at: string | null;
};

type TeachingDraft = {
  schemaVersion: number;
  draftType?: "portal_transaction" | "erp_form";
  providerName?: string;
  workflow_key: string;
  name: string;
  risk: Risk;
  confidence: number;
  instruction: string;
  evidence?: Record<string, unknown>;
  selector_map: Record<string, unknown> & {
    historySelector?: string;
    rowSelectorTemplate?: string;
    fields?: Record<string, string>;
  };
};

const statusStyles: Record<Status, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  draft: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  disabled: "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300",
  revoked: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  archived: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
};

function isDraft(value: unknown): value is TeachingDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<TeachingDraft>;
  const isBaseValid = draft.schemaVersion === 1
    && typeof draft.workflow_key === "string"
    && typeof draft.name === "string"
    && typeof draft.instruction === "string"
    && typeof draft.selector_map === "object"
    && draft.selector_map !== null;

  if (!isBaseValid) return false;
  if (draft.draftType === "erp_form") return true;
  return typeof draft.providerName === "string";
}

export default function AILearningControlCenter() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [key, setKey] = useState("csc_digipay_aeps_import");
  const [name, setName] = useState("CSC DigiPay AEPS Import");
  const [risk, setRisk] = useState<Risk>("low");
  const [confidence, setConfidence] = useState("95");
  const [instruction, setInstruction] = useState("Read only completed AEPS transaction history. Do not initiate, authorize, or modify any transaction. Stop if the page changes or requests authentication secrets.");
  const [evidence, setEvidence] = useState("Screen learned from owner demonstration.");
  const [openKey, setOpenKey] = useState<string | null>(null);

  async function load() {
    setError("");
    const res = await fetch("/api/ai/learning", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Could not load AI workflows.");
    setWorkflows(data.workflows || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Could not load AI workflows."));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Workflow[]>();
    for (const item of workflows) {
      const list = map.get(item.workflow_key) ?? [];
      list.push(item);
      map.set(item.workflow_key, list);
    }
    return [...map.entries()];
  }, [workflows]);

  async function createDraft(payload: {
    workflow_key: string;
    name: string;
    risk: Risk;
    confidence: number;
    instruction: string;
    evidence: Record<string, unknown>;
    selector_map: Record<string, unknown>;
  }) {
    const res = await fetch("/api/ai/learning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Could not save workflow.");
    return data.workflow as Workflow;
  }

  async function teach(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const workflow = await createDraft({
        workflow_key: key,
        name,
        risk,
        confidence: Number(confidence),
        instruction,
        evidence: { source: "owner_control_center", note: evidence },
        selector_map: {},
      });
      await load();
      setOpenKey(workflow.workflow_key);
      setNotice(`Draft v${workflow.version} saved. It is not active yet.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save workflow.");
    } finally {
      setBusy(false);
    }
  }

  async function importTeachingDraft(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!file.name.toLowerCase().endsWith(".json")) throw new Error("Teaching draft must be a JSON file.");
      const parsed: unknown = JSON.parse(await file.text());
      if (!isDraft(parsed)) throw new Error("This is not a valid AI teaching draft.");

      if (parsed.draftType === "erp_form") {
        const fields = parsed.selector_map.fields ?? {};
        const required = [
          "customer",
          "customerMobile",
          "customerBank",
          "aadhaarLast4",
          "aepsServicePortal",
          "withdrawalAmount",
          "customerServiceFee",
          "portalCommission",
          "feeTreatmentModel",
          "feeCollectionInstrument",
          "bankRrn",
        ];
        for (const fieldName of required) {
          if (typeof fields[fieldName] !== "string" || !fields[fieldName].trim()) {
            throw new Error(`ERP teaching draft is missing required selector: ${fieldName}.`);
          }
        }
        if (typeof parsed.selector_map.reviewSelector !== "string" || !parsed.selector_map.reviewSelector.trim()) {
          throw new Error("ERP teaching draft is missing the review selector.");
        }
      } else {
        const fields = parsed.selector_map.fields ?? {};
        for (const required of ["externalTransactionId", "status", "transactionType", "amount"]) {
          if (typeof fields[required] !== "string" || !fields[required].trim()) {
            throw new Error(`Teaching draft is missing required selector: ${required}.`);
          }
        }
        if (typeof parsed.selector_map.historySelector !== "string" || !parsed.selector_map.historySelector.trim()) {
          throw new Error("Teaching draft is missing the transaction-history selector.");
        }
        if (typeof parsed.selector_map.rowSelectorTemplate !== "string" || !parsed.selector_map.rowSelectorTemplate.includes("{index}")) {
          throw new Error("Teaching draft is missing a repeatable row selector.");
        }
      }

      const workflow = await createDraft({
        workflow_key: parsed.workflow_key,
        name: parsed.name,
        risk: parsed.risk,
        confidence: parsed.confidence,
        instruction: parsed.instruction,
        evidence: {
          source: "owner_live_browser_teaching",
          ...(parsed.providerName ? { providerName: parsed.providerName } : {}),
          draftType: parsed.draftType ?? "portal_transaction",
          importedFileName: file.name,
          ...(parsed.evidence ?? {}),
          localEvidenceOnly: true,
        },
        selector_map: parsed.selector_map,
      });
      setKey(parsed.workflow_key);
      setName(parsed.name);
      setRisk(parsed.risk);
      setConfidence(String(Math.round(parsed.confidence * 100)));
      setInstruction(parsed.instruction);
      setEvidence(`Imported ${file.name} from an owner-controlled live browser teaching session.`);
      await load();
      setOpenKey(workflow.workflow_key);
      setNotice(`Live teaching imported as Draft v${workflow.version}. Review it before activation.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import teaching draft.");
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "activate" | "disable" | "revoke" | "rollback") {
    const labels = { activate: "activate", disable: "disable", revoke: "revoke", rollback: "rollback" };
    const message = action === "revoke"
      ? "Revoke this instruction? It will never be used again."
      : action === "rollback"
      ? "Rollback to this workflow version?"
      : `${labels[action].charAt(0).toUpperCase()}${labels[action].slice(1)} this workflow version?`;
    if (!window.confirm(message)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/ai/learning/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Workflow action failed.");
      await load();
      setNotice(`Workflow ${action} completed.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Workflow action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Owner Learning Control</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">AI Learning Control Center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Teach the agent, import a live browser teaching session, review what it learned, disable it, revoke it, or roll back to an earlier version. New teachings start as drafts and never become active automatically.</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs font-bold text-emerald-200">Only owner/admin can change instructions</div>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-950/20 dark:text-rose-300">{error}</div>}
      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-300">{notice}</div>}

      <section className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <div className="space-y-6">
          <form onSubmit={teach} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Teach a new version</h2>
                <p className="mt-1 text-xs text-slate-500">Saved as Draft first. You decide when it becomes Active.</p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">DRAFT FIRST</span>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Workflow key<input value={key} onChange={(e) => setKey(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Risk<select value={risk} onChange={(e) => setRisk(e.target.value as Risk)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Confidence %<input value={confidence} onChange={(e) => setConfidence(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
              </div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Instruction<textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Learning evidence<textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
              <button disabled={busy || !key.trim() || !name.trim() || !instruction.trim()} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white transition hover:bg-indigo-500 disabled:opacity-50">{busy ? "Saving…" : "Teach & Save as Draft"}</button>
            </div>
          </form>

          <section className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5 dark:border-cyan-500/20 dark:bg-cyan-950/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-cyan-950 dark:text-cyan-100">Import live browser teaching</h2>
                <p className="mt-1 text-xs leading-5 text-cyan-800 dark:text-cyan-300">Run <code className="rounded bg-white/70 px-1 py-0.5">npm run ai:portal:teach</code> or the ERP-specific teaching command on your PC. The browser records structural selectors and local evidence, then creates a JSON teaching draft. Upload that JSON here.</p>
              </div>
              <span className="rounded-full bg-cyan-100 px-3 py-1 text-[10px] font-black text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-200">LIVE → DRAFT</span>
            </div>
            <label className="mt-4 flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-cyan-300 bg-white/60 px-4 py-5 text-center text-xs font-black text-cyan-800 transition hover:bg-white dark:border-cyan-500/30 dark:bg-white/5 dark:text-cyan-200">
              <input type="file" accept="application/json,.json" onChange={importTeachingDraft} disabled={busy} className="hidden" />
              {busy ? "Importing…" : "Choose teaching-draft.json"}
            </label>
            <p className="mt-3 text-[11px] leading-5 text-cyan-800/80 dark:text-cyan-300/80">Screenshots and authenticated browser state stay on your PC. The web app receives only workflow metadata and selector maps. Imported workflows remain Draft.</p>
          </section>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900 dark:text-white">Learned workflows</h2><p className="mt-1 text-xs text-slate-500">Every version remains auditable.</p></div><button type="button" onClick={() => load().catch((e) => setError(e instanceof Error ? e.message : "Refresh failed."))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 dark:border-white/10 dark:text-slate-300">Refresh</button></div>

          <div className="mt-4 space-y-4">
            {grouped.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400 dark:border-white/10">No learned workflows yet.</div>}
            {grouped.map(([workflowKey, versions]) => {
              const latest = versions[0];
              const expanded = openKey === workflowKey;
              return <div key={workflowKey} className="rounded-2xl border border-slate-200 dark:border-white/10">
                <button type="button" onClick={() => setOpenKey(expanded ? null : workflowKey)} className="w-full p-4 text-left">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-black text-slate-900 dark:text-white">{latest.name}</div><div className="mt-1 text-[11px] font-semibold text-slate-500">{workflowKey} · latest v{latest.version}</div></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusStyles[latest.status]}`}>{latest.status}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-white/5 dark:text-slate-300">{Math.round(latest.confidence * 100)}% confidence</span></div></div>
                </button>
                {expanded && <div className="border-t border-slate-200 p-4 dark:border-white/10">
                  <div className="space-y-3">
                    {versions.map((version) => <div key={version.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/60">
                      <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-black text-slate-900 dark:text-white">Version {version.version}</div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusStyles[version.status]}`}>{version.status}</span><span className="text-[11px] font-bold text-slate-500">{version.risk} risk</span></div></div>
                      <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{version.instruction}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {version.status === "draft" && <button type="button" onClick={() => act(version.id, "activate")} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-black text-white">Activate</button>}
                        {version.status === "active" && <button type="button" onClick={() => act(version.id, "disable")} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-black text-slate-700 dark:border-white/10 dark:text-slate-300">Disable</button>}
                        {version.status !== "revoked" && <button type="button" onClick={() => act(version.id, "revoke")} disabled={busy} className="rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-black text-rose-700 dark:border-rose-500/20 dark:text-rose-300">Revoke</button>}
                        {version.status !== "revoked" && version.status !== "active" && <button type="button" onClick={() => act(version.id, "rollback")} disabled={busy} className="rounded-lg border border-indigo-200 px-3 py-2 text-[11px] font-black text-indigo-700 dark:border-indigo-500/20 dark:text-indigo-300">Rollback / Activate</button>}
                      </div>
                    </div>)}
                  </div>
                </div>}
              </div>;
            })}
          </div>
        </section>
      </section>
    </div>
  );
}
