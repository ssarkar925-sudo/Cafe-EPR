"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import StatCard from "@/components/ui/stat-card";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";

type Field = {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
};

function gradient(name: string) {
  const palettes = [
    "from-blue-500 to-cyan-400",
    "from-violet-500 to-fuchsia-400",
    "from-emerald-500 to-teal-400",
    "from-amber-500 to-orange-400",
    "from-rose-500 to-pink-400",
    "from-indigo-500 to-purple-400",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

export default function MasterClient({
  title,
  desc,
  table,
  fields,
  rows,
  usage = {},
  display,
  embedded = false,
}: {
  title: string;
  desc: string;
  table: string;
  fields: Field[];
  rows: any[];
  usage?: Record<string, number>;
  display?: (row: any) => string;
  embedded?: boolean;
}) {
  const [list, setList] = useState(rows);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [delTarget, setDelTarget] = useState<{ row: any; referenced: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const supabase = createClient();
  const { showToast, toastView } = useToast();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((r) => {
      const disp = display ? display(r) : fields.map((f) => r[f.key]).join(" ");
      return disp.toLowerCase().includes(needle);
    });
  }, [list, q, fields, display]);

  const activeCount = useMemo(() => list.filter((r) => r.is_active).length, [list]);

  function openCreate() {
    const init: Record<string, string> = {};
    fields.forEach((f) => (init[f.key] = ""));
    setForm(init);
    setEditing(null);
    setError("");
    setShowForm(true);
  }

  function openEdit(row: any) {
    const init: Record<string, string> = {};
    fields.forEach((f) => (init[f.key] = row[f.key] ?? ""));
    setForm(init);
    setEditing(row);
    setError("");
    setShowForm(true);
  }

  async function toggleActive(row: any) {
    const { error } = await supabase.from(table).update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) return showToast("error", error.message);
    setList((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !row.is_active } : r)));
    showToast("success", `${display ? display(row) : row.name} ${row.is_active ? "deactivated" : "activated"}`);
  }

  function requestDelete(row: any) {
    const used = (usage[row.id] ?? 0) > 0;
    setDelTarget({ row, referenced: used });
  }

  async function confirmDelete() {
    if (!delTarget) return;
    setDeleting(true);
    const { error } = await supabase.from(table).delete().eq("id", delTarget.row.id);
    setDeleting(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setList((prev) => prev.filter((r) => r.id !== delTarget.row.id));
    setDelTarget(null);
    showToast("success", "Record deleted");
  }

  async function save() {
    for (const f of fields) {
      if (f.required && !form[f.key]?.trim()) {
        setError(`${f.label} is required.`);
        return;
      }
    }
    setBusy(true);
    const payload: Record<string, unknown> = {};
    fields.forEach((f) => (payload[f.key] = form[f.key]?.trim() || null));

    if (editing) {
      const { error } = await supabase.from(table).update(payload).eq("id", editing.id);
      setBusy(false);
      if (error) return setError(error.message);
      setList((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...payload } : r)));
    } else {
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      setBusy(false);
      if (error) return setError(error.message);
      setList((prev) => [data, ...prev]);
    }
    setShowForm(false);
  }

  const iconPath =
    table === "aeps_banks"
      ? "M3 21V9l9-6 9 6v12M9 21v-6h6v6M3 3v.01M21 21v.01"
      : table === "aeps_portals"
        ? "M13 2 3 14h7l-1 8 10-12h-7l1-8Z"
        : "M3 11h18M12 11a4 4 0 0 0 4-4M3 5h18M3 19h18M12 11a4 4 0 0 0-4-4";

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className={`mx-auto ${embedded ? "max-w-none" : "max-w-6xl px-4 py-8 lg:px-8"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{desc}</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>
          Add {title.replace("AEPS ", "").replace("UPI ", "")}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total"
          value={String(list.length)}
          icon="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
          grad="from-blue-500 to-indigo-600"
        />
        <StatCard
          label="Active"
          value={String(activeCount)}
          icon="M20 6 9 17l-5-5"
          grad="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="Inactive"
          value={String(list.length - activeCount)}
          icon="M6 18 18 6M6 6l12 12"
          grad="from-violet-500 to-purple-600"
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-[220px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900"
          />
        </div>
        <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300">
          {filtered.length} shown
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((row) => {
          const name = display ? display(row) : fields[0] ? String(row[fields[0].key] ?? "-") : "-";
          const used = usage[row.id] ?? 0;
          return (
            <div
              key={row.id}
              className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md ${!row.is_active ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(name)} text-white shadow-sm`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d={iconPath} />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {fields.slice(1).map((f) =>
                      row[f.key] ? (
                        <span key={f.key} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          {row[f.key]}
                        </span>
                      ) : null
                    )}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    row.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {row.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {used > 0 && (
                <p className="mt-3 text-xs text-slate-400">
                  Used in <span className="font-semibold text-slate-600">{used}</span> transaction{used === 1 ? "" : "s"}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(row)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => requestDelete(row)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                    title={used > 0 ? "Referenced by transactions — will be disabled" : "Delete"}
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => toggleActive(row)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      row.is_active
                        ? "border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                        : "border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50"
                    }`}
                  >
                    {row.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    <path d={iconPath} />
                  </svg>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 py-14 text-center text-sm text-slate-400">
            No {title.toLowerCase()} found. Add the first one.
          </div>
        )}
      </div>

      {showForm && (
        <Modal
          onClose={() => setShowForm(false)}
          size="md"
          accent="blue"
          icon={iconPath}
          title={editing ? `Edit ${title}` : `Add ${title.replace("AEPS ", "").replace("UPI ", "")}`}
          subtitle={
            table === "aeps_banks"
              ? "Used for AEPS cash withdrawals."
              : table === "aeps_portals"
                ? "AEPS settlement portals."
                : "Shop UPI QR codes for cash-out."
          }
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {f.label} {f.required && "*"}
                </label>
                <input
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}
        </Modal>
      )}
      {delTarget && (
        <Modal
          onClose={() => setDelTarget(null)}
          size="md"
          accent={delTarget.referenced ? "amber" : "rose"}
          icon="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z"
          title={delTarget.referenced ? "Used by existing transactions" : "Delete record?"}
          subtitle={
            delTarget.referenced
              ? "This record is used by existing transactions. Disable it instead to preserve financial history."
              : "This will permanently remove the record. This cannot be undone."
          }
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDelTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              {delTarget.referenced ? (
                <button
                  onClick={() => {
                    toggleActive(delTarget.row);
                    setDelTarget(null);
                  }}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
                >
                  Disable
                </button>
              ) : (
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
          }
        />
      )}
      {toastView}
    </div>
  );
}
