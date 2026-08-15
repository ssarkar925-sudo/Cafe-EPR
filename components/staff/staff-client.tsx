"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type StaffUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

const ROLES = ["admin", "manager", "staff"] as const;

const ROLE_STYLE: Record<string, string> = {
  admin: "bg-rose-100 text-rose-700 ring-rose-200",
  manager: "bg-amber-100 text-amber-700 ring-amber-200",
  staff: "bg-blue-100 text-blue-700 ring-blue-200",
};

type ModalState = { mode: "create" } | { mode: "edit"; user: StaffUser } | null;

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

export default function StaffClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: StaffUser[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState<StaffUser[]>(initialUsers);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "disabled" && u.is_active) return false;
      if (!needle) return true;
      return (
        (u.full_name ?? "").toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle)
      );
    });
  }, [users, q, roleFilter, statusFilter]);

  const stats = useMemo(() => {
    const s = { total: users.length, active: 0, admin: 0, manager: 0, staff: 0 };
    for (const u of users) {
      if (u.is_active) s.active++;
      if (u.role === "admin") s.admin++;
      else if (u.role === "manager") s.manager++;
      else s.staff++;
    }
    return s;
  }, [users]);

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
    if (payload.action === "create") {
      setUsers((prev) => [
        ...prev,
        {
          id: `tmp-${Date.now()}`,
          email: (payload.email as string) || "",
          full_name: (payload.name as string) || "",
          role: (payload.role as string) || "staff",
          is_active: true,
        },
      ]);
    } else if (payload.action === "update") {
      const id = payload.id as string;
      setUsers((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                full_name: (payload.full_name as string) ?? u.full_name,
                role: (payload.role as string) ?? u.role,
                is_active: (payload.is_active as boolean) ?? u.is_active,
              }
            : u
        )
      );
    }
    setModal(null);
    router.refresh();
    return true;
  }

  async function toggleActive(u: StaffUser) {
    if (u.id === currentUserId) return;
    setToggling(u.id);
    const ok = await callApi({ action: "update", id: u.id, is_active: !u.is_active });
    setToggling(null);
    if (!ok) router.refresh();
  }

  const KPI_CARDS = [
    { label: "Team Members", value: String(stats.total), icon: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", grad: "from-blue-500 to-indigo-600" },
    { label: "Active", value: String(stats.active), icon: "M20 6 9 17l-5-5", grad: "from-emerald-500 to-teal-600" },
    { label: "Admins", value: String(stats.admin), icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 6a9 9 0 0 0-14 0", grad: "from-rose-500 to-pink-600" },
    { label: "Managers", value: String(stats.manager), icon: "M3 21V9l9-6 9 6v12M9 21v-6h6v6", grad: "from-amber-500 to-orange-600" },
    { label: "Staff", value: String(stats.staff), icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", grad: "from-violet-500 to-purple-600" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff</h1>
          <p className="text-sm text-slate-500">Manage who can sign in and their access level.</p>
        </div>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          + Add Staff
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {KPI_CARDS.map((c) => (
          <div key={c.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`} />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{c.label}</p>
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${c.grad} text-white`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d={c.icon} />
                </svg>
              </div>
            </div>
            <p className="mt-1.5 text-xl font-bold text-slate-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-[220px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs">
            {(["all", ...ROLES] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${
                  roleFilter === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs">
            {(["all", "active", "disabled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${
                  statusFilter === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            {filtered.length} shown
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-5 py-3 font-medium">Member</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className={`border-b border-slate-100 transition last:border-0 hover:bg-slate-50 ${!u.is_active ? "opacity-60" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient(u.full_name || u.email)} text-sm font-bold text-white`}>
                        {(u.full_name || u.email || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {u.full_name || "-"}
                          {isSelf && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">You</span>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ${ROLE_STYLE[u.role] || "bg-slate-100 text-slate-600"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                      {u.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {!isSelf && (
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={toggling === u.id}
                          className={`relative h-5 w-9 rounded-full transition ${u.is_active ? "bg-emerald-500" : "bg-slate-300"} disabled:opacity-50`}
                          title={u.is_active ? "Deactivate account" : "Activate account"}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${u.is_active ? "left-4.5" : "left-0.5"}`}
                          />
                        </button>
                      )}
                      <button
                        onClick={() => setModal({ mode: "edit", user: u })}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                  No team members found.
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
          isSelf={modal.mode === "edit" && modal.user.id === currentUserId}
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
  isSelf,
  onClose,
  onSave,
}: {
  state: Exclude<ModalState, null>;
  busy: boolean;
  error: string | null;
  isSelf: boolean;
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
      ? { action: "update", id: editing.id, full_name: name, role, is_active: isActive }
      : { action: "create", name, email, password, role };
    if (editing && password) payload.password = password;
    const ok = await onSave(payload);
    if (ok) setPassword("");
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelClass = "mb-1 block text-xs font-semibold text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {editing ? "Edit Team Member" : "Add Staff"}
            </h2>
            <p className="text-xs text-slate-400">
              {editing ? `Update access for ${editing.email}` : "Create a login for a new member"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className={labelClass}>Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
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
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  disabled={isSelf && r !== editing?.role}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium capitalize transition ${
                    role === r
                      ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  } ${isSelf && r !== editing?.role ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  {r}
                </button>
              ))}
            </div>
            {isSelf && (
              <p className="mt-1 text-[11px] text-slate-400">You cannot change your own role.</p>
            )}
          </div>

          {!editing ? (
            <div>
              <label className={labelClass}>Password *</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
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
            <label className={`flex items-center gap-2 text-sm text-slate-700 ${isSelf ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                checked={isActive}
                disabled={isSelf}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Account active
            </label>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Add staff"}
          </button>
        </div>
      </form>
    </div>
  );
}
