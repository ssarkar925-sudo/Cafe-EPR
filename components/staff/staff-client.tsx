"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type StaffUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

const ROLES = ["admin", "manager", "staff"] as const;

type ModalState = { mode: "create" } | { mode: "edit"; user: StaffUser } | null;

export default function StaffClient({
  initialUsers,
}: {
  initialUsers: StaffUser[];
}) {
  const [users] = useState<StaffUser[]>(initialUsers);
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function callApi(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Request failed");
      return false;
    }
    setModal(null);
    router.refresh();
    return true;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Staff</h1>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Add Staff
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {u.full_name || "-"}
                </td>
                <td className="px-4 py-3 text-slate-700">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      u.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {u.is_active ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setModal({ mode: "edit", user: u })}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No staff yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <StaffFormModal
          state={modal}
          busy={busy}
          error={error}
          onClose={() => setModal(null)}
          onSave={callApi}
        />
      )}
    </div>
  );
}

function StaffFormModal({
  state,
  busy,
  error,
  onClose,
  onSave,
}: {
  state: Exclude<ModalState, null>;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const editing = state.mode === "edit" ? state.user : null;
  const [name, setName] = useState(editing?.full_name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [role, setRole] = useState<string>(editing?.role ?? "staff");
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [password, setPassword] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = editing
      ? {
          action: "update",
          id: editing.id,
          full_name: name,
          role,
          is_active: isActive,
        }
      : { action: "create", name, email, password, role };
    if (editing && password) payload.password = password;
    await onSave(payload);
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
  const labelClass = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {editing ? "Edit Staff" : "Add Staff"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            &times;
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className={labelClass}>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email *</label>
            <input
              type="email"
              required
              disabled={!!editing}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputClass} ${editing ? "bg-slate-50 text-slate-400" : ""}`}
            />
          </div>
          <div>
            <label className={labelClass}>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={inputClass}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r[0].toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
          {!editing ? (
            <div>
              <label className={labelClass}>Password *</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>
          ) : (
            <div>
              <label className={labelClass}>Reset password (optional)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to keep current"
                className={inputClass}
              />
            </div>
          )}
          {editing && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              Account active
            </label>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Saving..." : editing ? "Save changes" : "Add staff"}
          </button>
        </div>
      </form>
    </div>
  );
}
