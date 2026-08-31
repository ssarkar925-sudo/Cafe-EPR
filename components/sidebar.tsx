"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SidebarProps = {
  name: string;
  email: string;
  role: string;
  shopName: string;
  logoUrl: string | null;
  avatarUrl: string | null;
  userId: string;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

type NavItem = { label: string; href: string; icon: string; roles?: string[] };
type NavGroup = { label: string; items: NavItem[] };

const ICONS: Record<string, string> = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  pos: "M6 6h15l-1.5 8h-13L4 3H2M9 20a1 1 0 1 0 0 .01M20 20a1 1 0 1 0 0 .01",
  bill: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z",
  dmt: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
  aeps: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7M2 7l10-5 10 5z",
  upi: "M12 18h.01M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z",
  invoices: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  customers: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  inventory: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  purchases: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  expenses: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z",
  finance: "M3 3v18h18M7 14l4-4 3 3 5-6",
  reports: "M18 20V10M12 20V4M6 20v-6",
  staff: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  security: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  audit: "M12 8v4m0 4h.01M12 3l9 5v8l-9 5-9-5V8l9-5Z",
  ai: "M12 2a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1a1 1 0 0 0-1-1h-1a2 2 0 0 1-2-2v-1a1 1 0 0 0-1-1H3a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V9a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V4a2 2 0 0 1 2-2zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z",
};

const GROUPS: NavGroup[] = [
  {
    label: "WORKSPACE",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
      { label: "POS", href: "/pos", icon: "pos" },
      { label: "Bill Payment", href: "/business/bill-payment", icon: "bill" },
      { label: "DMT", href: "/business/dmt", icon: "dmt" },
      { label: "AEPS", href: "/business/aeps", icon: "aeps" },
      { label: "UPI", href: "/business/upi", icon: "upi" },
      { label: "Invoices", href: "/invoices", icon: "invoices" },
      { label: "Inventory", href: "/inventory", icon: "inventory" },
      { label: "Expenses", href: "/finance/expenses", icon: "expenses" },
      { label: "Customers", href: "/customers", icon: "customers" },
      { label: "Finance", href: "/finance", icon: "finance", roles: ["admin", "manager"] },
      { label: "Reports", href: "/reports", icon: "reports" },
    ],
  },
  {
    label: "CONTROL",
    items: [
      { label: "Staff", href: "/staff", icon: "staff", roles: ["admin"] },
      { label: "Security", href: "/security", icon: "security", roles: ["admin"] },
      { label: "Audit", href: "/audit", icon: "audit", roles: ["admin", "manager"] },
      { label: "AI Control Center", href: "/ai", icon: "ai", roles: ["admin", "manager"] },
    ],
  },
];

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d={ICONS[name] ?? ICONS.dashboard} />
    </svg>
  );
}

export default function Sidebar({ name, email, role, shopName, logoUrl, avatarUrl, collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const canSee = (item: NavItem) => !item.roles || item.roles.includes(role);

  return (
    <>
      {mobileOpen && <button aria-label="Close menu" onClick={onMobileClose} className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200/80 bg-white/95 shadow-xl backdrop-blur-xl transition-all duration-300 dark:border-white/10 dark:bg-slate-950/95 ${collapsed ? "w-[76px]" : "w-[276px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex h-16 items-center gap-3 border-b border-slate-200/80 px-4 dark:border-white/10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg">
            {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-sm font-black">CE</span>}
          </div>
          {!collapsed && <div className="min-w-0"><div className="truncate text-sm font-black text-slate-900 dark:text-white">{shopName || "Cafe ERP"}</div><div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">ERP Hub</div></div>}
          <button type="button" onClick={onToggle} className="ml-auto hidden h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 lg:flex" aria-label="Toggle sidebar">{collapsed ? "›" : "‹"}</button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {GROUPS.map((group) => {
            const items = group.items.filter(canSee);
            return (
              <div key={group.label} className="mb-5">
                {!collapsed && <div className="mb-2 px-3 text-[10px] font-black tracking-[0.18em] text-slate-400">{group.label}</div>}
                <div className="space-y-1">
                  {items.map((item) => {
                    const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
                    return (
                      <Link key={item.href} href={item.href} onClick={onMobileClose} title={collapsed ? item.label : undefined} className={`group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold transition ${active ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"}`}>
                        <Icon name={item.icon} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-200/80 p-3 dark:border-white/10">
          <div className={`flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 dark:bg-white/[0.04] ${collapsed ? "justify-center" : ""}`}>
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-9 w-9 rounded-xl object-cover" /> : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-black text-white">{(name || "U").slice(0, 2).toUpperCase()}</div>}
            {!collapsed && <div className="min-w-0 flex-1"><div className="truncate text-xs font-black text-slate-900 dark:text-white">{name || "User"}</div><div className="truncate text-[10px] text-slate-500">{email}</div></div>}
          </div>
        </div>
      </aside>
    </>
  );
}
