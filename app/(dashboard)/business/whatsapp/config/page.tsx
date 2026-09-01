import { redirect } from "next/navigation";
import { getUserRole, hasRole } from "@/lib/authz";
import WhatsAppConfigurationPanel from "@/components/settings/whatsapp-configuration-panel";

export const dynamic = "force-dynamic";

export default async function WhatsAppConfigurationPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Business Hub / Communication</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">WhatsApp Configuration</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Connect Meta WhatsApp Cloud API, manage the sender, test delivery and control operational automation.</p>
          </div>
          <a href="/business/whatsapp" className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">← WhatsApp Hub</a>
        </div>
      </div>
      <WhatsAppConfigurationPanel />
    </div>
  );
}
