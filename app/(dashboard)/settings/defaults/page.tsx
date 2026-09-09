import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserRole, hasRole } from "@/lib/authz";
import DefaultRoutingClient from "@/components/settings/default-routing-client";

export const dynamic = "force-dynamic";

export default async function DefaultsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-4 py-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
        >
          ← Settings
        </Link>
        <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
          Admin only
        </span>
      </div>
      <DefaultRoutingClient />
    </div>
  );
}
