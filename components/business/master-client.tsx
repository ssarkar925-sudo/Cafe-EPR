"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
}: {
  title: string;
  desc: string;
  table: string;
  fields: Field[];
  rows: any[];
  usage?: Record<string, number>;
  display?: (row: any) => string;
}) {
  const [list, setList] = useState(rows);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

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
    if (error) return alert(error.message);
    setList((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !row.is_active } : r)));
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
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{desc}</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          + Add {title.replace("AEPS ", "").replace("UPI ", "")}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
          <p className="text-sm font-medium text-slate-500">Total</p>
          <p className="mt-1.5 text-xl font-bold text-slate-900">{list.length}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
          <p className="text-sm font-medium text-slate-500">Active</p>
          <p className="mt-1.5 text-xl font-bold text-emerald-600">{activeCount}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
          <p className="text-sm font-medium text-slate-500">Inactive</p>
          <p className="mt-1.5 text-xl font-bold text-slate-500">{list.length - activeCount}</p>
        </div>
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
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">{editing ? `Edit ${title}` : `Add ${title.replace("AEPS ", "").replace("UPI ", "")}`}</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {table === "aeps_banks" ? "Used for AEPS cash withdrawals." : table === "aeps_portals" ? "AEPS settlement portals." : "Shop UPI QR codes for cash-out."}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
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
            {error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
