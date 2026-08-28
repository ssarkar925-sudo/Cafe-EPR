"use client";

import Link from "next/link";

const sections = [
  {
    key: "store",
    eyebrow: "01",
    title: "Business identity",
    description: "Your shop profile, invoices, receipts and GST rules.",
    tone: "from-indigo-600 to-violet-600",
    links: [
      ["Store Identity", "general", "Shop name, contact & currency"],
      ["Invoice & Receipts", "receipt", "Print layout, footer & UPI QR"],
      ["Tax & GST", "tax", "GSTIN & default tax rate"],
    ],
  },
  {
    key: "money",
    eyebrow: "02",
    title: "Money & payments",
    description: "Control every drawer, account and payment method used at the counter.",
    tone: "from-cyan-600 to-blue-600",
    links: [
      ["Payment Accounts", "payment-accounts", "Cash, bank, UPI, wallet & cards"],
      ["Payment Methods", "payment-methods", "Enable options & sort order"],
      ["Quick Sale Favorites", "quick-favorites", "1-click POS services"],
    ],
  },
  {
    key: "operations",
    eyebrow: "03",
    title: "Operations",
    description: "Set up products, services, inventory and digital service providers.",
    tone: "from-emerald-600 to-teal-600",
    links: [
      ["Catalog & Categories", "catalog", "Products, services & categories"],
      ["Inventory & Supply", "inventory", "Purchases, suppliers & valuation"],
      ["Business Setup", "business-setup", "Banks, portals, QRs & recharge"],
    ],
  },
  {
    key: "system",
    eyebrow: "04",
    title: "System control",
    description: "Automations, backups, access protection and the ERP visual system.",
    tone: "from-slate-700 to-slate-950",
    links: [
      ["WhatsApp & Notifications", "notifications", "Automated dispatch & alerts"],
      ["Backup & Data Export", "backup", "Snapshots & CSV exports"],
      ["Security & Access", "security", "Password & session protection"],
      ["Theme & Design", "other", "Display, density & Design Changes"],
    ],
  },
];

function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></svg>;
}

export default function SettingsHub({ shopName }: { shopName: string }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 lg:px-8 lg:pt-8">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 px-6 py-7 text-white shadow-xl shadow-slate-200/50 sm:px-8 lg:px-10 lg:py-9 dark:border-white/10 dark:shadow-none">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Administration workspace
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Settings Command Center</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400 sm:text-[15px]">
              One clean control room for <span className="font-semibold text-slate-200">{shopName}</span>. Configure the business once, then keep live counter operations simple.
            </p>
          </div>
          <Link href="/settings?tab=general" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100">
            Open Store Identity <Arrow />
          </Link>
        </div>
        <div className="relative mt-7 grid gap-2 border-t border-white/10 pt-5 sm:grid-cols-3">
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Purpose</p><p className="mt-1 text-xs font-medium text-slate-300">Configure once · operate fast</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Scope</p><p className="mt-1 text-xs font-medium text-slate-300">Business · Money · Operations</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Access</p><p className="mt-1 text-xs font-medium text-emerald-300">Administrator workspace</p></div>
        </div>
      </div>

      <div className="mt-7 grid gap-4 xl:grid-cols-2">
        {sections.map((section) => (
          <div key={section.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-start gap-4 border-b border-slate-100 p-5 dark:border-white/10 sm:p-6">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${section.tone} text-xs font-black text-white shadow-lg`}>
                {section.eyebrow}
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-slate-950 dark:text-white">{section.title}</h2>
                <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{section.description}</p>
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/10">
              {section.links.map(([label, tab, description]) => (
                <Link key={tab} href={`/settings?tab=${tab}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-white/[0.04] sm:px-6">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:bg-white/5 dark:text-slate-400 dark:group-hover:bg-indigo-500/10 dark:group-hover:text-indigo-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-400 dark:text-slate-500">{description}</span>
                  </span>
                  <span className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-500"><Arrow /></span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center dark:border-amber-500/20 dark:bg-amber-500/5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">!</div>
        <div className="min-w-0 flex-1"><p className="text-sm font-bold text-amber-950 dark:text-amber-200">Configuration affects live transactions</p><p className="mt-0.5 text-xs leading-5 text-amber-800/80 dark:text-amber-300/70">Review payment accounts, GST details, pricing and provider settings before using them at the counter.</p></div>
        <Link href="/settings?tab=security" className="shrink-0 text-xs font-bold text-amber-900 hover:underline dark:text-amber-200">Review access →</Link>
      </div>
    </section>
  );
}
