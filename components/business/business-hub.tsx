"use client";

import Link from "next/link";

const BUSINESS_MODULES = [
  {
    title: "AEPS Withdrawal",
    desc: "Aadhaar-enabled cash withdrawal, portal commissions & instant customer slips.",
    href: "/business/aeps",
    icon: "🏧",
    tone: "blue",
    tag: "Banking",
  },
  {
    title: "Domestic Money Transfer (DMT)",
    desc: "IMPS/NEFT remittances, sender-beneficiary ledgers & transaction fees.",
    href: "/business/dmt",
    icon: "💸",
    tone: "violet",
    tag: "Remittance",
  },
  {
    title: "UPI Collections & Cash-Out",
    desc: "Merchant QR scans, dynamic UPI payments & counter cash-out records.",
    href: "/business/upi",
    icon: "📱",
    tone: "emerald",
    tag: "Instant UPI",
  },
  {
    title: "Mobile & DTH Recharge",
    desc: "Prepaid, postpaid & DTH top-ups with slab-wise margin tracking.",
    href: "/business/recharge",
    icon: "⚡",
    tone: "amber",
    tag: "Telecom",
  },
  {
    title: "Service Settlement Portals",
    desc: "PayNearby, SpiceMoney, CSC, Airtel Payments Bank float accounts.",
    href: "/business/portals",
    icon: "🏢",
    tone: "indigo",
    tag: "Gateways",
  },
  {
    title: "Bank & Settlement Accounts",
    desc: "Commercial bank ledgers, settlement transfers & liquid float tracking.",
    href: "/business/banks",
    icon: "🏦",
    tone: "cyan",
    tag: "Treasury",
  },
  {
    title: "Merchant QR Profiles",
    desc: "Static and dynamic counter QR profiles for instant customer collections.",
    href: "/business/merchant-qrs",
    icon: "▣",
    tone: "rose",
    tag: "QR Counter",
  },
];

export default function BusinessHub() {
  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      {/* Hero Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
            Financial &amp; Cyber Operations
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            Business &amp; Remittance Command Center
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            AEPS cash disbursements, DMT remittances, UPI cash-out, mobile recharge margins, and portal settlements.
          </p>
        </div>
      </div>

      {/* Module Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {BUSINESS_MODULES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="group relative flex flex-col justify-between rounded-[22px] border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-violet-300 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-violet-700"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-xl shadow-inner dark:bg-white/10">
                  {m.icon}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {m.tag}
                </span>
              </div>
              <h2 className="mt-3.5 text-base font-extrabold text-slate-900 dark:text-white">
                {m.title}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {m.desc}
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/5">
              <span className="text-xs font-bold text-violet-600 dark:text-violet-400 group-hover:underline">
                Open Module
              </span>
              <span className="text-slate-400 transition group-hover:translate-x-1 dark:text-slate-500">
                →
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Operational Best Practices Card */}
      <div className="rounded-[24px] border border-violet-500/20 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-6 text-white shadow-md">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-black uppercase tracking-wider text-slate-400">
            Accounting Integrity Invariant
          </span>
        </div>
        <h3 className="mt-2 text-lg font-extrabold">
          Isolated Cash Flow &amp; Float Preservation
        </h3>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-300">
          AEPS withdrawals and DMT remittances represent customer pass-through principal funds. Only earned fees and portal commissions enter the P&amp;L revenue stream, ensuring ₹0.00 accounting variance between your physical cash drawer and reported net profits.
        </p>
      </div>
    </div>
  );
}
