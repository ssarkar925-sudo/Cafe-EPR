"use client";

import Link from "next/link";
import SettingsSection from "@/components/settings/settings-section";

const SECTIONS = [
  { href: "/business/banks", label: "AEPS Banks", hint: "Bank master", tone: "violet", icon: "🏦" },
  { href: "/business/portals", label: "Service Portals", hint: "Settlement", tone: "purple", icon: "🌐" },
  { href: "/business/merchant-qrs", label: "Merchant QRs", hint: "UPI", tone: "cyan", icon: "📱" },
  { href: "/business/bill-payment", label: "Recharge & Bill Payment", hint: "Providers & commissions", tone: "amber", icon: "⚡" },
] as const;

export default function BusinessSetupPanel({ active }: { active: boolean; section?: string; onSection?: (s: string) => void; initialBanks?: any; initialPortals?: any; initialMerchantQrs?: any; initialRechargeProviders?: any[]; initialRechargeSlabs?: any[] }) {
  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      <SettingsSection
        icon="M3 21V9l9-6 9 6v12M9 21v-6h6v6"
        tone="indigo"
        title="Business Setup"
        desc="Provider, bank, merchant QR, recharge and bill-payment masters are maintained in their dedicated operational modules. Settings no longer hosts a second CRUD implementation."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SECTIONS.map((item) => (
            <Link key={item.href} href={item.href} className="group rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 transition hover:-translate-y-0.5 hover:shadow-md dark:border-indigo-500/20 dark:bg-indigo-950/20">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg shadow-sm dark:bg-white/10">{item.icon}</span>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-white/10 dark:text-slate-300">{item.hint}</span>
              </div>
              <div className="mt-3 text-sm font-extrabold text-slate-900 dark:text-white">{item.label}</div>
              <span className="mt-3 inline-flex text-xs font-bold text-indigo-700 dark:text-indigo-300">Open module →</span>
            </Link>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
