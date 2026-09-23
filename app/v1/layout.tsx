import { redirect } from "next/navigation";
import { getV1SessionContext } from "@/lib/v1/v1-auth-context";
import { V1SessionProvider } from "@/components/v1/v1-session-provider";
import V1Shell from "@/components/v1/v1-shell";

/**
 * V1 application gate (server-side, authoritative mirror of the backend):
 * - No session → existing login flow (middleware also enforces the cookie
 *   gate; this redirect is the second layer, never the only one).
 * - Authenticated but inactive V1 profile → deactivated screen, no entry.
 * - Authenticated + active → V1 shell with the resolved session context.
 * Legacy routes, public paths, and receipt behavior are untouched.
 */
export default async function V1Layout({ children }: { children: React.ReactNode }) {
  const session = await getV1SessionContext();
  if (!session) redirect("/login?next=/v1");

  if (!session.isActive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 dark:bg-[#0b1220]">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Account deactivated</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Contact the shop admin.</p>
          <form action="/logout" method="post" className="mt-4">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white dark:bg-white dark:text-slate-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <V1SessionProvider initial={session}>
      <V1Shell session={session}>
        <main className="min-w-0">{children}</main>
      </V1Shell>
    </V1SessionProvider>
  );
}
