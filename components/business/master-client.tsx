"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import UpiQrCode from "@/components/ui/upi-qr-code";

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
  const [viewingQrRow, setViewingQrRow] = useState<any | null>(null);
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
    "w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className={`mx-auto space-y-6 ${embedded ? "max-w-none" : "max-w-6xl px-4 py-8 lg:px-8"}`}>
      {/* =========================================================================
          TOP EXECUTIVE HEADER (Glowing Bento Card & 3D Tactile CTA)
      ========================================================================= */}
      <div className="card-glow-indigo rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-xs backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 transition-all">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="icon-box-3d flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d={iconPath} />
              </svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Registry Master · {table.toUpperCase()}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  {list.length} Configured
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                {title}
              </h1>
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                {desc}
              </p>
            </div>
          </div>

          <button
            onClick={openCreate}
            className="btn-3d-tactile-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Add {title.replace("AEPS ", "").replace("UPI ", "")}</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          HERO BENTO KPI GRID (3 Multi-Tone Glowing Bento Cards)
      ========================================================================= */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total Records */}
        <div
          onClick={() => setQ("")}
          className="card-glow-indigo group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/90"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total {title}
            </span>
            <div className="icon-box-3d flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
              </svg>
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {list.length}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-white/5 pt-2">
            <span>All Registry Items</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">View All →</span>
          </div>
        </div>

        {/* Active Records */}
        <div
          onClick={() => setQ("")}
          className="card-glow-emerald group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/90"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Active Records
            </span>
            <div className="icon-box-3d flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
            {activeCount}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-white/5 pt-2">
            <span>Operational in POS</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform">Ready →</span>
          </div>
        </div>

        {/* Inactive Records */}
        <div
          onClick={() => setQ("")}
          className="card-glow-purple group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/90"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Archived / Inactive
            </span>
            <div className="icon-box-3d flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M6 18 18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight text-purple-600 dark:text-purple-400">
            {list.length - activeCount}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-white/5 pt-2">
            <span>Disabled Masters</span>
            <span className="font-bold text-purple-600 dark:text-purple-400 group-hover:translate-x-0.5 transition-transform">Audit →</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SEARCH & FILTER TOOLBAR
      ========================================================================= */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-[240px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            className="w-full rounded-xl border border-slate-200/90 bg-white/90 py-2.5 pl-10 pr-3 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-900/90 dark:text-white"
          />
        </div>
        <span className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-1.5 font-mono text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
          {filtered.length} of {list.length} shown
        </span>
      </div>

      {/* =========================================================================
          ENTITY CARDS GRID (Bento Surfaces & Tactile Micro-Actions)
      ========================================================================= */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((row) => {
          const name = display ? display(row) : fields[0] ? String(row[fields[0].key] ?? "-") : "-";
          const used = usage[row.id] ?? 0;
          return (
            <div
              key={row.id}
              className={`card-glow-indigo group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/90 ${
                !row.is_active ? "opacity-60" : ""
              }`}
            >
              <div>
                <div className="flex items-start gap-3.5">
                  <div className={`icon-box-3d flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient(name)} text-white shadow-sm`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d={iconPath} />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {name}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {fields.slice(1).map((f) =>
                        row[f.key] ? (
                          <span key={f.key} className="rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                            {row[f.key]}
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                      row.is_active
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${row.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                    {row.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                {used > 0 && (
                  <p className="mt-3 font-mono text-xs text-slate-400">
                    Referenced in <span className="font-bold text-slate-700 dark:text-slate-200">{used}</span> transactions
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/5">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => openEdit(row)}
                    className="btn-3d-tactile-secondary rounded-lg px-2.5 py-1 text-xs font-bold"
                  >
                    Edit
                  </button>
                  {row.upi_id && (
                    <button
                      onClick={() => setViewingQrRow(row)}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 active:scale-95 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300"
                    >
                      📱 QR Code
                    </button>
                  )}
                  <button
                    onClick={() => requestDelete(row)}
                    className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50 active:scale-95 dark:border-white/10 dark:bg-slate-800 dark:text-rose-400"
                    title={used > 0 ? "Referenced by transactions — will be disabled" : "Delete"}
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => toggleActive(row)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition active:scale-95 ${
                      row.is_active
                        ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400"
                        : "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"
                    }`}
                  >
                    {row.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-400 dark:bg-white/5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    <path d={iconPath} />
                  </svg>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200/80 py-14 text-center text-xs text-slate-400 dark:border-white/10">
            No {title.toLowerCase()} records found. Add the first one using the button above.
          </div>
        )}
      </div>

      {/* =========================================================================
          CREATE / EDIT MODAL (Tactile 3D Buttons & Input Rings)
      ========================================================================= */}
      {showForm && (
        <Modal
          onClose={() => setShowForm(false)}
          size="md"
          accent="indigo"
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
                className="btn-3d-tactile-secondary rounded-xl px-4 py-2 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="btn-3d-tactile-primary rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save Record"}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3.5">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
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
            <p className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-400">
              {error}
            </p>
          )}
        </Modal>
      )}

      {/* =========================================================================
          DELETE CONFIRMATION MODAL
      ========================================================================= */}
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
                className="btn-3d-tactile-secondary rounded-xl px-4 py-2 text-xs font-bold"
              >
                Cancel
              </button>
              {delTarget.referenced ? (
                <button
                  onClick={() => {
                    toggleActive(delTarget.row);
                    setDelTarget(null);
                  }}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600 active:scale-95"
                >
                  Disable
                </button>
              ) : (
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 active:scale-95 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
          }
        />
      )}

      {/* =========================================================================
          UPI QR PREVIEW MODAL
      ========================================================================= */}
      {viewingQrRow && (
        <Modal
          onClose={() => setViewingQrRow(null)}
          size="md"
          accent="indigo"
          icon="M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z"
          title={`Merchant QR — ${viewingQrRow.display_name || viewingQrRow.name || "UPI QR"}`}
          subtitle="Real scannable UPI payment QR code."
        >
          <div className="p-4 flex justify-center">
            <UpiQrCode
              upiId={viewingQrRow.upi_id}
              merchantName={viewingQrRow.display_name || viewingQrRow.name}
              size={220}
              onCopy={() => showToast("success", "UPI ID copied to clipboard.")}
            />
          </div>
        </Modal>
      )}
      {toastView}
    </div>
  );
}
