"use client";

import { useMemo, useState } from "react";
import { useRealtime } from "@/lib/supabase/realtime";
import SearchableSelect from "@/components/ui/searchable-select";
import StatCard from "@/components/ui/stat-card";
import CompactToggle from "@/components/ui/compact-toggle";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";

export type AuditLog = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  description: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_STYLE: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
  update: "bg-blue-50 text-blue-700 ring-1 ring-blue-600/20",
  delete: "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20",
  cancel: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20",
  reverse: "bg-violet-50 text-violet-700 ring-1 ring-violet-600/20",
  payment: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
  login: "bg-slate-100 text-slate-700 ring-1 ring-slate-400/20",
  logout: "bg-slate-100 text-slate-700 ring-1 ring-slate-400/20",
  upload: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-600/20",
  settings: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20",
};

export default function AuditClient({ initialLogs }: { initialLogs: AuditLog[] }) {
  const [logs, setLogs] = useState<AuditLog[]>(initialLogs);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [date, setDate] = useState("");
  const [compact, setCompact] = useState(false);
  const { showToast, toastView } = useToast();

  useRealtime(["audit_logs"]);

  const entities = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) set.add(l.entity);
    return Array.from(set).sort();
  }, [logs]);

  const actions = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) set.add(l.action);
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (action !== "all" && l.action !== action) return false;
      if (entity !== "all" && l.entity !== entity) return false;
      if (date && !(l.created_at ?? "").startsWith(date)) return false;
      if (!needle) return true;
      return (
        (l.user_name ?? "").toLowerCase().includes(needle) ||
        (l.description ?? "").toLowerCase().includes(needle) ||
        (l.entity_id ?? "").toLowerCase().includes(needle)
      );
    });
  }, [logs, q, action, entity, date]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let todayCount = 0,
      creates = 0,
      updates = 0,
      reverses = 0;
    for (const l of logs) {
      if ((l.created_at ?? "").startsWith(today)) todayCount++;
      if (l.action === "create") creates++;
      else if (l.action === "update") updates++;
      else if (l.action === "reverse" || l.action === "cancel") reverses++;
    }
    return { todayCount, creates, updates, reverses };
  }, [logs]);

  function downloadCsv() {
    const headers = ["Time", "User", "Action", "Entity", "Entity ID", "Description"];
    const rows = filtered.map((l) => [
      new Date(l.created_at).toLocaleString("en-IN"),
      l.user_name ?? "-",
      l.action,
      l.entity,
      l.entity_id ?? "-",
      (l.description ?? "").replace(/"/g, '""'),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c)}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("success", `Exported ${filtered.length} audit entries to CSV`);
  }

  const inputClass =
    "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Audit Log</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Every important action, newest first. {filtered.length} of {logs.length} shown.
          </p>
        </div>
        <button
          onClick={downloadCsv}
          disabled={filtered.length === 0}
          className="btn-3d-tactile-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 active:translate-y-0.5 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Download CSV
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Entries"
          value={String(logs.length)}
          sub={`${filtered.length} in current view`}
          icon="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
          grad="from-blue-500 to-indigo-600"
          onClick={() => {
            setAction("all");
            setEntity("all");
            setDate("");
            setQ("");
          }}
        />
        <StatCard
          label="Today"
          value={String(stats.todayCount)}
          sub="Newest activity"
          icon="M12 15v3m-6-6h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
          grad="from-emerald-500 to-teal-600"
          onClick={() => setDate(new Date().toISOString().slice(0, 10))}
        />
        <StatCard
          label="Creates"
          value={String(stats.creates)}
          sub={`${stats.updates} updates`}
          icon="M12 5v14M5 12h14"
          grad="from-violet-500 to-purple-600"
          onClick={() => setAction("create")}
        />
        <StatCard
          label="Reversals / Cancels"
          value={String(stats.reverses)}
          sub="Financial safeguards"
          icon="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"
          grad="from-rose-500 to-pink-600"
          onClick={() => setAction(actions.includes("cancel") ? "cancel" : "reverse")}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-[220px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search user, description or ID…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchableSelect
            value={action}
            onChange={setAction}
            options={[
              { value: "all", label: "All actions" },
              ...actions.map((a) => ({ value: a, label: a.charAt(0).toUpperCase() + a.slice(1) })),
            ]}
            searchPlaceholder="Search action…"
            className="w-full sm:w-44"
          />
          <SearchableSelect
            value={entity}
            onChange={setEntity}
            options={[
              { value: "all", label: "All entities" },
              ...entities.map((e) => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) })),
            ]}
            searchPlaceholder="Search entity…"
            className="w-full sm:w-44"
          />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          <CompactToggle value={compact} onChange={setCompact} storageKey="sccomm-audit-compact" />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-white/10">
        <table className={`w-full text-left text-xs ${compact ? "rows-compact" : ""}`}>
          <thead>
            <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/5">
              <th className="px-5 py-3">Time</th>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">Entity</th>
              <th className="px-5 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {filtered.map((l) => (
              <tr key={l.id} className="transition hover:bg-slate-50/80 dark:hover:bg-white/[0.02]">
                <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                  {new Date(l.created_at).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{l.user_name || "-"}</span>
                  <span className="cell-sub block font-mono text-[10px] text-slate-400">{l.user_id?.slice(0, 8) ?? ""}</span>
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${ACTION_STYLE[l.action] || "bg-slate-100 text-slate-600 ring-1 ring-slate-400/20"}`}>
                    {l.action}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 capitalize ring-1 ring-slate-200/60 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10">
                    {l.entity}
                  </span>
                  {l.entity_id && (
                    <span className="cell-sub ml-1.5 font-mono text-[10px] text-slate-400">{l.entity_id.slice(0, 12)}</span>
                  )}
                </td>
                <td className="max-w-md px-5 py-3 text-slate-700 dark:text-slate-300">{l.description || "-"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                  No audit entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {toastView}
    </div>
  );
}
