import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

const SYSTEM = [
  { title: "Security", description: "Credentials, 2FA and terminal security.", href: "/security" },
  { title: "Staff", description: "Users, roles and permissions.", href: "/staff" },
  { title: "Audit", description: "Immutable operational audit history.", href: "/audit" },
  { title: "AI Control Center", description: "Diagnostics and automated financial checks.", href: "/ai" },
];

export default async function SettingsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 lg:px-8">
      <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">System Control</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 dark:text-white">System Settings</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Settings is reserved for system-level controls. Operational configuration is owned by its Hub and is intentionally not duplicated here.
        </p>
      </header>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">System-only controls</h2>
          <p className="text-xs text-slate-500">Use the owning module for POS, Finance, Business, Inventory and Catalog configuration.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SYSTEM.map((item) => (
            <Link key={item.title} href={item.href} className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-500/40">
              <h3 className="font-extrabold text-slate-900 dark:text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
