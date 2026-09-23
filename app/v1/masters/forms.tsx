"use client";

/**
 * Shared master-data manager (client island). Renders server-provided rows
 * and drives create/edit/deactivate exclusively through the documented
 * mg_* upsert RPCs (deactivation = p_is_active false; no DELETE exists or
 * is used). Field configs come from the calling page; no entity knowledge
 * is hardcoded here beyond rendering.
 */

import { useState } from "react";
import Modal from "@/components/ui/modal";
import { useV1Mutation, V1Confirm, V1Field, v1InputClass } from "@/components/v1/v1-mutation";

export type MasterFieldType = "text" | "number" | "select" | "checkbox";

export interface MasterField {
  key: string;
  param: string;
  label: string;
  type: MasterFieldType;
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
}

export interface MasterEntityConfig {
  rpc: string;
  idParam: string;
  fields: MasterField[];
}

function emptyValues(config: MasterEntityConfig): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of config.fields) {
    values[f.key] = f.type === "checkbox" ? true : f.type === "select" ? "" : "";
  }
  return values;
}

function rowToValues(config: MasterEntityConfig, row: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of config.fields) {
    const v = row[f.key];
    values[f.key] = v === null || v === undefined ? (f.type === "checkbox" ? true : "") : v;
  }
  return values;
}

function valuesToArgs(
  config: MasterEntityConfig,
  id: string | null,
  values: Record<string, unknown>,
): { args: Record<string, unknown>; error: string | null } {
  const args: Record<string, unknown> = { [config.idParam]: id };
  for (const f of config.fields) {
    const raw = values[f.key];
    if (f.type === "checkbox") {
      args[f.param] = raw === true;
      continue;
    }
    if (f.type === "number") {
      const text = String(raw ?? "").trim();
      if (text === "") {
        args[f.param] = null;
        continue;
      }
      const num = Number(text);
      if (!Number.isFinite(num)) return { args: {}, error: `${f.label} must be a number.` };
      args[f.param] = num;
      continue;
    }
    const text = String(raw ?? "").trim();
    if (f.required && text === "") return { args: {}, error: `${f.label} is required.` };
    args[f.param] = text === "" ? null : text;
  }
  return { args, error: null };
}

export function MasterManager({
  title,
  description,
  config,
  columns,
  rows,
}: {
  title: string;
  description: string;
  config: MasterEntityConfig;
  columns: { key: string; label: string; mono?: boolean }[];
  rows: Record<string, unknown>[];
}) {
  const [editing, setEditing] = useState<{ id: string | null; values: Record<string, unknown> } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useV1Mutation();

  function openCreate() {
    setFormError(null);
    mutation.reset();
    setEditing({ id: null, values: emptyValues(config) });
  }

  function openEdit(row: Record<string, unknown>) {
    setFormError(null);
    mutation.reset();
    setEditing({ id: String(row.id), values: rowToValues(config, row) });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const { args, error } = valuesToArgs(config, editing.id, editing.values);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    const result = await mutation.run(config.rpc, args);
    if (result !== null) setEditing(null);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          New
        </button>
      </div>

      {mutation.error && !editing ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {mutation.error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
          No rows yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10">
                {columns.map((c) => (
                  <th key={c.key} scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {c.label}
                  </th>
                ))}
                <th scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-b border-slate-100 last:border-0 dark:border-white/5">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-2.5 align-top text-slate-700 dark:text-slate-200${c.mono ? " font-mono text-xs" : ""}`}>
                      {cellText(row[c.key])}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 align-top">
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        Edit
                      </button>
                      <DeactivateButton config={config} row={row} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal
          as="form"
          onSubmit={submit}
          size="md"
          accent="blue"
          title={editing.id ? `Edit ${title.slice(0, -1)}` : `New ${title.slice(0, -1)}`}
          subtitle="Server validation applies; errors are shown here verbatim."
          onClose={() => setEditing(null)}
          footer={
            <div className="flex w-full gap-2.5">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.pending}
                className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {mutation.pending ? "Saving…" : "Save"}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
            {config.fields.map((f) => (
              <V1Field key={f.key} label={f.label} htmlFor={`master-${f.key}`}>
                {f.type === "checkbox" ? (
                  <input
                    id={`master-${f.key}`}
                    type="checkbox"
                    checked={editing.values[f.key] === true}
                    onChange={(e) =>
                      setEditing({ ...editing, values: { ...editing.values, [f.key]: e.target.checked } })
                    }
                    disabled={mutation.pending}
                    className="h-5 w-5"
                  />
                ) : f.type === "select" ? (
                  <select
                    id={`master-${f.key}`}
                    className={v1InputClass}
                    value={String(editing.values[f.key] ?? "")}
                    onChange={(e) =>
                      setEditing({ ...editing, values: { ...editing.values, [f.key]: e.target.value } })
                    }
                    disabled={mutation.pending}
                  >
                    <option value="">—</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`master-${f.key}`}
                    type={f.type === "number" ? "number" : "text"}
                    step={f.type === "number" ? "0.01" : undefined}
                    className={v1InputClass}
                    value={String(editing.values[f.key] ?? "")}
                    placeholder={f.placeholder}
                    onChange={(e) =>
                      setEditing({ ...editing, values: { ...editing.values, [f.key]: e.target.value } })
                    }
                    disabled={mutation.pending}
                  />
                )}
              </V1Field>
            ))}
          </div>
          {(formError || mutation.error) && (
            <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              {formError ?? mutation.error}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function DeactivateButton({ config, row }: { config: MasterEntityConfig; row: Record<string, unknown> }) {
  const mutation = useV1Mutation();
  if (row.is_active === false) return null;
  const { args } = valuesToArgs(config, String(row.id), forceInactive(config, row));
  return (
    <V1Confirm
      label="Deactivate"
      title={`Deactivate “${String(row.name ?? row.id)}”`}
      body="The row is kept and marked inactive (no deletes in V1). It stays visible in history."
      confirmLabel="Deactivate"
      onConfirm={() => mutation.run(config.rpc, args)}
      disabled={mutation.pending}
    />
  );
}

function forceInactive(
  config: MasterEntityConfig,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const values = rowToValues(config, row);
  for (const f of config.fields) {
    if (f.type === "checkbox" && f.param === "p_is_active") values[f.key] = false;
  }
  return values;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
