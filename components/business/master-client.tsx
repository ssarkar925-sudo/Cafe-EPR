"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Field = {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
};

export default function MasterClient({
  title,
  desc,
  table,
  fields,
  rows,
}: {
  title: string;
  desc: string;
  table: string;
  fields: Field[];
  rows: any[];
}) {
  const [list, setList] = useState(rows);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

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
    const { error } = await supabase
      .from(table)
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) return alert(error.message);
    setList((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, is_active: !row.is_active } : r))
    );
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{desc}</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Add
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {fields.map((f) => (
                <th key={f.key} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {f.label}
                </th>
              ))}
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((row) => (
              <tr key={row.id} className={`hover:bg-slate-50 ${!row.is_active ? "opacity-60" : ""}`}>
                {fields.map((f) => (
                  <td key={f.key} className="px-5 py-3 text-slate-700">
                    {row[f.key] ?? "-"}
                  </td>
                ))}
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {row.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEdit(row)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(row)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {row.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={fields.length + 2} className="px-5 py-12 text-center text-sm text-slate-400">
                  Nothing yet — add the first {title.toLowerCase()}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">
              {editing ? `Edit ${title}` : `Add ${title}`}
            </h2>
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
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              ))}
            </div>
            {error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
