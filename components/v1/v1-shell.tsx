/**
 * V1 application shell (server component).
 *
 * Receives the server-resolved session (already gated by app/v1/layout.tsx)
 * and renders header + role-filtered navigation + content slot. Reuses the
 * existing SessionGuard (idle timeout, auth-expiry handling) and the global
 * theme/notification CSS. Styling follows the existing slate/dark token
 * palette; no new design system is introduced.
 */

import Link from "next/link";
import SessionGuard from "@/components/session-guard";
import type { V1SessionContext } from "@/lib/v1/v1-contracts";
import { v1NavForRole } from "./v1-nav";
import { V1SyncProvider } from "./v1-sync-provider";
import V1SyncStatus from "./v1-sync-status";

function roleBadgeClass(role: string): string {
  switch (role) {
    case "admin":
      return "bg-rose-600/15 text-rose-300 ring-rose-500/40";
    case "manager":
      return "bg-indigo-600/15 text-indigo-300 ring-indigo-500/40";
    case "staff":
      return "bg-teal-600/15 text-teal-300 ring-teal-500/40";
    default:
      return "bg-slate-600/15 text-slate-300 ring-slate-500/40";
  }
}

export default function V1Shell({
  session,
  children,
}: {
  session: V1SessionContext;
  children: React.ReactNode;
}) {
  const items = v1NavForRole(session.role);
  return (
    <>
      <SessionGuard />
      <V1SyncProvider>
      <div className="flex min-h-screen bg-slate-100 text-slate-900 dark:bg-[#0b1220] dark:text-slate-100">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white/80 dark:border-white/10 dark:bg-white/[0.03] md:flex">
          <div className="px-5 pb-4 pt-6">
            <p className="text-sm font-extrabold tracking-tight">CafeERP V1</p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Tenant <span className="font-mono">{session.tenantId.slice(0, 8)}</span>
            </p>
          </div>
          <nav aria-label="V1 primary" className="flex-1 space-y-0.5 px-3">
            {items.map((item) =>
              item.href ? (
                <Link
                  key={item.key}
                  href={item.href}
                  className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.key}
                  title={`Available in application phase ${item.phase}`}
                  aria-disabled="true"
                  className="block cursor-not-allowed rounded-lg px-3 py-2 text-sm font-medium text-slate-400 opacity-70 dark:text-slate-500"
                >
                  {item.label}
                  <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold dark:bg-white/10">
                    P{item.phase}
                  </span>
                </span>
              ),
            )}
          </nav>
          <div className="border-t border-slate-200 px-5 py-4 dark:border-white/10">
            <p className="truncate text-xs font-semibold">{session.profile.display_name}</p>
            <p className="mt-1">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${roleBadgeClass(session.role)}`}>
                {session.role}
              </span>
            </p>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03] md:px-6">
            <p className="text-sm font-bold md:hidden">CafeERP V1</p>
            <p className="hidden text-xs text-slate-500 dark:text-slate-400 md:block">
              Server-authoritative V1 backend · UI visibility is not access
            </p>
            <div className="flex items-center gap-2">
              <V1SyncStatus />
            </div>
            <form action="/logout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Sign out
              </button>
            </form>
          </header>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      </div>
      </V1SyncProvider>
    </>
  );
}
