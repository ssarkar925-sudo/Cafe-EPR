"use client";

import { useMemo, useState } from "react";
import { useRealtime } from "@/lib/supabase/realtime";
import SearchableSelect from "@/components/ui/searchable-select";

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
  create: "bg-emerald-100 text-emerald-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-rose-100 text-rose-700",
  cancel: "bg-amber-100 text-amber-700",
  reverse: "bg-violet-100 text-violet-700",
  payment: "bg-emerald-100 text-emerald-700",
  login: "bg-slate-100 text-slate-700",
  logout: "bg-slate-100 text-slate-700",
  upload: "bg-cyan-100 text-cyan-700",
  settings: "bg-indigo-100 text-indigo-700",
};

export default function AuditClient({ initialLogs }: { initialLogs: AuditLog[] }) {
  const [logs, setLogs] = useState<AuditLog[]>(initialLogs);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [date, setDate] = useState("");

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
  }

  const inputClass =
    "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500">
            Every important action, newest first. {filtered.length} of {logs.length} shown.
          </p>
        </div>
        <button
          onClick={downloadCsv}
          disabled={filtered.length === 0}
          className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
        >
          Download CSV
        </button>
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
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-5 py-3 font-medium">Time</th>
              <th className="px-5 py-3 font-medium">User</th>
              <th className="px-5 py-3 font-medium">Action</th>
              <th className="px-5 py-3 font-medium">Entity</th>
              <th className="px-5 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50">
                <td className="whitespace-nowrap px-5 py-2.5 text-xs text-slate-500">
                  {new Date(l.created_at).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-5 py-2.5 text-slate-700">
                  {l.user_name || "-"}
                  <span className="block text-[10px] text-slate-400">{l.user_id?.slice(0, 8) ?? ""}</span>
                </td>
                <td className="px-5 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${ACTION_STYLE[l.action] || "bg-slate-100 text-slate-600"}`}>
                    {l.action}
                  </span>
                </td>
                <td className="px-5 py-2.5">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 capitalize">
                    {l.entity}
                  </span>
                  {l.entity_id && (
                    <span className="ml-1.5 font-mono text-[10px] text-slate-400">{l.entity_id.slice(0, 12)}</span>
                  )}
                </td>
                <td className="max-w-md px-5 py-2.5 text-slate-700">{l.description || "-"}</td>
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
    </div>
  );
}
