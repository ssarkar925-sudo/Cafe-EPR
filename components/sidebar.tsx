"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AvatarModal from "./profile/avatar-modal";

export type BadgeTone = "emerald" | "amber" | "indigo" | "purple" | "rose" | "slate" | "blue";

export type NavItem = {
  label: string;
  href: string;
  icon: string;
  badge?: { text: string; tone: BadgeTone };
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

const BADGE_STYLES: Record<BadgeTone, string> = {
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  indigo: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  purple: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  rose: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  slate: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const ICONS: Record<string, string> = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  pos: "M6 6h15l-1.5 8h-13L4 3H2M9 20a1 1 0 1 0 0 .01M20 20a1 1 0 1 0 0 .01",
  quick: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  invoices: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  customers: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  products: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9",
  services: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  categories: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  brands: "M7 7h10v10H7zM3 3h18v18H3z",
  units: "M4 6h16M4 12h16M4 18h16",
  aeps: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7m4 11V7M2 7l10-5 10 5z",
  dmt: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
  upi: "M12 18h.01M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z",
  recharge: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  banks: "M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v4M12 14v4M16 14v4",
  portals: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
  qrs: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1M14 20h1M20 20h1",
  returns: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  expenses: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z",
  cashbook: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  ledger: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  reports: "M18 20V10M12 20V4M6 20v-6",
  pnl: "M3 3v18h18M7 14l4-4 3 3 5-6",
  settlements: "M3 7l7-4 7 4 4-2v13l-4 2-7-4-7 4V7zM10 3v13m7-11v13",
  opening: "M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M16 3h5v5M11 13l8-8m0 0h-4m4 0v4",
  dayclose: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M12 12v5M9.5 14.5 12 12l2.5 2.5",
  staff: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  audit: "M12 8v4m0 4h.01M12 3l9 5v8l-9 5-9-5V8l9-5ZM6.5 8.5 12 6l5.5 2.5M12 6v12",
  security: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  tax: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  ai: "M12 2a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1a1 1 0 0 0-1-1h-1a2 2 0 0 1-2-2v-1a1 1 0 0 0-1-1H3a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V9a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V4a2 2 0 0 1 2-2h2zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  chevron: "m9 18 6-6-6-6",
  search: "M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21l-4.35-4.35",
};

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5 shrink-0"}
    >
      <path d={d} />
    </svg>
  );
}

function gradient(name: string) {
  const palettes = [
    "from-blue-500 to-cyan-400",
    "from-violet-500 to-fuchsia-400",
    "from-emerald-500 to-teal-400",
    "from-amber-500 to-orange-400",
    "from-rose-500 to-pink-400",
    "from-indigo-500 to-purple-400",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

export default function Sidebar({
  name,
  email,
  role,
  shopName,
  logoUrl,
  avatarUrl,
  userId,
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
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
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(
    () =>
      new Set([
        "Main",
        "Operations & Services",
        "Customer Management",
        "Finance",
        "AI & Intelligence",
        "Security & Governance",
        "Administration & Settings",
      ])
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(avatarUrl);

  const isStaff = role === "staff";
  const isAdmin = role === "admin";

  const sections: NavSection[] = useMemo(() => {
    return [
      // 1. MAIN
      {
        title: "Main",
        items: [
          { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
          { label: "Point of Sale", href: "/pos", icon: "pos" },
          { label: "Invoices & Receipts", href: "/invoices", icon: "invoices" },
          { label: "Returns & Credit Notes", href: "/returns", icon: "returns" },
        ],
      },

      // 2. OPERATIONS & SERVICES
      {
        title: "Operations & Services",
        items: [
          { label: "AEPS Banking", href: "/business/aeps", icon: "aeps" },
          { label: "DMT Money Transfer", href: "/business/dmt", icon: "dmt" },
          { label: "UPI Collections", href: "/business/upi", icon: "upi" },
          { label: "Recharge & Utilities", href: "/business/recharge", icon: "recharge" },
          { label: "Bank Accounts", href: "/business/banks", icon: "banks" },
          { label: "Third-Party Portals", href: "/business/portals", icon: "portals" },
          { label: "Merchant QRs", href: "/business/merchant-qrs", icon: "qrs" },
        ],
      },

      // 3. CUSTOMER MANAGEMENT
      {
        title: "Customer Management",
        items: [{ label: "Customers & Dues", href: "/customers", icon: "customers" }],
      },

      // 4. FINANCE
      {
        title: "Finance",
        items: [
          { label: "Profit & Loss", href: "/finance/pnl", icon: "pnl" },
          { label: "Cash Book", href: "/finance/cashbook", icon: "cashbook" },
          { label: "Opening Balances", href: "/finance/opening-balances", icon: "opening" },
          { label: "Day Close & Rollover", href: "/finance/day-close", icon: "dayclose" },
          { label: "Settlement Hub", href: "/finance/settlements", icon: "settlements" },
          { label: "General Ledger", href: "/finance/ledger", icon: "ledger" },
          { label: "Business Expenses", href: "/finance/expenses", icon: "expenses" },
          { label: "Reports Hub", href: "/reports", icon: "reports" },
          {
            label: "Tax Preparation / ITR",
            href: "/reports/tax-preparation",
            icon: "tax",
            badge: { text: "FY 26-27", tone: "emerald" },
          },
          {
            label: "GST Reports",
            href: "/reports/gst",
            icon: "tax",
            badge: { text: "FUTURE", tone: "amber" },
          },
        ],
      },

      // 5. AI & INTELLIGENCE
      {
        title: "AI & Intelligence",
        items: [
          { label: "AI Control Center", href: "/ai", icon: "ai" },
          {
            label: "Financial Self-Audit",
            href: "/ai/self-audit",
            icon: "ai",
            badge: { text: "ACTIVE", tone: "indigo" },
          },
          {
            label: "AI Accountant",
            href: "/ai?tab=accountant",
            icon: "ai",
            badge: { text: "BETA", tone: "purple" },
          },
          {
            label: "Business Advisor",
            href: "/ai?tab=reconciliation",
            icon: "ai",
            badge: { text: "BETA", tone: "purple" },
          },
          {
            label: "Document OCR & Vault",
            href: "/ai?tab=vault_compliance",
            icon: "ai",
            badge: { text: "ACTIVE", tone: "blue" },
          },
        ],
      },

      // 6. SECURITY & GOVERNANCE
      {
        title: "Security & Governance",
        items: [
          {
            label: "Security Center",
            href: "/security",
            icon: "security",
            badge: { text: "ACTIVE", tone: "emerald" },
          },
          { label: "System Audit Log", href: "/audit", icon: "audit" },
        ],
      },

      // 7. ADMINISTRATION & SETTINGS
      {
        title: "Administration & Settings",
        items: [
          { label: "Staff & Attendance", href: "/staff", icon: "staff" },
          { label: "Catalog & Master Data", href: "/settings?tab=catalog", icon: "products" },
          { label: "Shop Settings", href: "/settings", icon: "settings" },
          { label: "Payment Accounts", href: "/settings?tab=accounts", icon: "banks" },
          {
            label: "WhatsApp Gateway",
            href: "/settings?tab=whatsapp",
            icon: "services",
            badge: { text: "CONFIG", tone: "slate" },
          },
        ],
      },
    ];
  }, []);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    const cleanHref = href.split("?")[0];
    return pathname === cleanHref || pathname.startsWith(cleanHref + "/");
  }

  const needle = query.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!needle) return sections;
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (i) =>
            i.label.toLowerCase().includes(needle) ||
            i.href.toLowerCase().includes(needle) ||
            (i.badge && i.badge.text.toLowerCase().includes(needle))
        ),
      }))
      .filter((s) => s.items.length > 0);
  }, [sections, needle]);

  function toggleSection(title: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  const sidebar = (
    <aside
      className={`flex h-full flex-col bg-gradient-to-b from-[#0f172a] via-[#0f172a] to-[#020617] text-[#e2e8f0] transition-all duration-300 ${
        collapsed ? "w-[76px]" : "w-72"
      }`}
    >
      <div
        className={`flex h-16 shrink-0 items-center border-b border-white/5 px-4 ${
          collapsed ? "justify-center" : "gap-3"
        }`}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Shop logo"
            className="h-9 w-9 shrink-0 rounded-xl object-cover ring-2 ring-white/10"
          />
        ) : (
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(
              shopName
            )} text-sm font-bold text-white shadow-lg ring-2 ring-white/10`}
          >
            {shopName.charAt(0).toUpperCase()}
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-tight text-white">
              {shopName}
            </h1>
            <p className="truncate text-[11px] font-medium text-slate-400">
              CyberCafe &amp; Banking ERP
            </p>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="border-b border-white/5 px-3 py-2.5">
          <div className="relative">
            <Icon
              d={ICONS.search}
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 35+ modules..."
              className="w-full rounded-lg bg-white/5 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-400 outline-none ring-1 ring-white/10 transition focus:bg-white/10 focus:ring-blue-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-3 overflow-y-auto px-2 py-3 scrollbar-thin scrollbar-thumb-white/10">
        {filteredSections.map((s) => {
          const isOpen = openSections.has(s.title) || Boolean(needle);
          return (
            <div key={s.title}>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleSection(s.title)}
                  className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition hover:text-slate-200"
                >
                  <span>{s.title}</span>
                  <Icon
                    d={ICONS.chevron}
                    className={`h-3 w-3 transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  />
                </button>
              )}
              {(isOpen || collapsed) && (
                <ul className="mt-1 space-y-0.5">
                  {s.items.map((i) => {
                    const active = isActive(i.href);
                    return (
                      <li key={i.href + i.label}>
                        <Link
                          href={i.href}
                          onClick={() => {
                            if (mobileOpen) onMobileClose();
                          }}
                          title={collapsed ? i.label : undefined}
                          className={`group flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                            active
                              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm"
                              : "text-slate-300 hover:bg-white/5 hover:text-white"
                          } ${collapsed ? "justify-center px-0 py-2" : ""}`}
                        >
                          <Icon
                            d={ICONS[i.icon] ?? ICONS.dashboard}
                            className={`h-4 w-4 shrink-0 transition ${
                              active
                                ? "text-white"
                                : "text-slate-400 group-hover:text-slate-200"
                            }`}
                          />
                          {!collapsed && (
                            <div className="flex flex-1 items-center justify-between min-w-0">
                              <span className="truncate">{i.label}</span>
                              {i.badge && (
                                <span
                                  className={`ml-1.5 shrink-0 rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wide border ${
                                    BADGE_STYLES[i.badge.tone]
                                  }`}
                                >
                                  {i.badge.text}
                                </span>
                              )}
                            </div>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/5 p-2">
        <div
          className={`flex items-center gap-2 rounded-xl bg-white/[0.03] p-2 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            title="Update profile avatar"
            className="group relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-2 ring-white/10 transition hover:ring-blue-400"
          >
            {currentAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentAvatar}
                alt="Profile"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <svg
                className="h-3.5 w-3.5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          </button>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{name}</p>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-white/10 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-slate-300">
                  {role}
                </span>
                <span className="truncate text-[10px] text-slate-400">{email}</span>
              </div>
            </div>
          )}
          <form action="/logout" method="post">
            <button
              type="submit"
              title="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <Icon d={ICONS.logout} className="h-4 w-4" />
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="mt-1.5 hidden w-full items-center justify-center rounded-lg py-1.5 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white lg:flex"
        >
          <Icon
            d={ICONS.chevron}
            className={`h-4 w-4 transition-transform duration-300 ${
              collapsed ? "" : "rotate-180"
            }`}
          />
        </button>
      </div>

      <AvatarModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        name={name}
        email={email}
        avatarUrl={currentAvatar}
        userId={userId}
        onSaved={(url: string | null) => {
          setCurrentAvatar(url);
          window.location.reload();
        }}
      />
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block lg:h-screen lg:sticky lg:top-0">
        {sidebar}
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={onMobileClose}
          />
          <div className="relative z-10 flex w-72 flex-col">
            {sidebar}
          </div>
        </div>
      )}
    </>
  );
}
