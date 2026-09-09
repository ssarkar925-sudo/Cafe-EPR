import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserRole, hasRole } from "@/lib/authz";
import SystemSettingsClient from "@/components/settings/system-settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");
  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 lg:px-8">
        <Link
          href="/settings/defaults"
          className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-100 dark:border-blue-500/20 dark:bg-blue-950/40 dark:text-blue-300"
        >
          <span className="text-sm">⚙</span>
          Defaults &amp; Routing Control Center
          <span className="text-blue-400">→</span>
        </Link>
      </div>
      <SystemSettingsClient
        initial={null}
        initialServices={[]}
        initialPaymentMethods={[]}
        initialTab="general"
        initialSection={undefined}
      />
    </>
  );
}
