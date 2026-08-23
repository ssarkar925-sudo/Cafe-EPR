"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AvatarModal from "./profile/avatar-modal";

type NavItem = { label: string; href: string; icon: string };
type NavSection = { title: string; items: NavItem[] };

const ICONS: Record<string, string> = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  pos: "M6 6h15l-1.5 8h-13L4 3H2M9 20a1 1 0 1 0 0 .01M20 20a1 1 0 1 0 0 .01",
  quick: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  invoices: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  customers: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  products: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9",
  services: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  categories: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  aeps: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7m4 11V7M2 7l10-5 10 5z",
  dmt: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
  upi: "M12 18h.01M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z",
  recharge: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
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
    () => new Set(["Main", "Business", "Customer Management", "Finance", "Catalog & Inventory", "Administrative"])
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(avatarUrl);

  const isStaff = role === "staff";
  const isAdmin = role === "admin";

  const sections: NavSection[] = useMemo(() => {
    // 1. Main
    const main: NavItem[] = [
      { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
      { label: "Point of Sale", href: "/pos", icon: "pos" },
    ];
    if (!isStaff) {
      main.push({ label: "Returns", href: "/returns", icon: "returns" });
    }
    main.push({ label: "Invoices", href: "/invoices", icon: "invoices" });

    const base: NavSection[] = [{ title: "Main", items: main }];

    // 2. Business
    if (!isStaff) {
      base.push({
        title: "Business",
        items: [
          { label: "AEPS", href: "/business/aeps", icon: "aeps" },
          { label: "DMT", href: "/business/dmt", icon: "dmt" },
          { label: "UPI", href: "/business/upi", icon: "upi" },
          { label: "Recharge", href: "/business/recharge", icon: "recharge" },
        ],
      });
    }

    // 3. Customer Management
    base.push({
      title: "Customer Management",
      items: [{ label: "Customers", href: "/customers", icon: "customers" }],
    });

    // 4. Finance
    if (!isStaff) {
      base.push({
        title: "Finance",
        items: [
          { label: "Profit & Loss", href: "/finance/pnl", icon: "pnl" },
          { label: "Cash Book", href: "/finance/cashbook", icon: "cashbook" },
          { label: "Opening Balances", href: "/finance/opening-balances", icon: "opening" },
          { label: "Day Close", href: "/finance/day-close", icon: "dayclose" },
          { label: "Settlements", href: "/finance/settlements", icon: "settlements" },
          { label: "Ledger", href: "/finance/ledger", icon: "ledger" },
          { label: "Expenses", href: "/finance/expenses", icon: "expenses" },
          { label: "Reports", href: "/reports", icon: "reports" },
        ],
      });
    }

    // 5. Catalog & Inventory
    base.push({
      title: "Catalog & Inventory",
      items: [
        { label: "Products & Stock", href: "/catalog/products", icon: "products" },
        { label: "Services", href: "/catalog/services", icon: "services" },
        { label: "Categories", href: "/catalog/categories", icon: "categories" },
      ],
    });

    // 6. Administrative
    if (isAdmin) {
      base.push({
        title: "Administrative",
        items: [
          { label: "Staff", href: "/staff", icon: "staff" },
          { label: "Audit Log", href: "/audit", icon: "audit" },
          { label: "Settings", href: "/settings", icon: "settings" },
        ],
      });
    }
    return base;
  }, [isStaff, isAdmin]);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  }

  const allItems = useMemo(
    () => sections.flatMap((s) => s.items),
    [sections]
  );

  const needle = query.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!needle) return sections;
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (i) =>
            i.label.toLowerCase().includes(needle) ||
            i.href.toLowerCase().includes(needle)
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
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-blue-900/40`}
          >
            {(shopName || "S").slice(0, 1).toUpperCase()}
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{shopName}</p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">
              Smart Business Suite
            </p>
          </div>
        )}
        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden shrink-0 items-center justify-center rounded-lg p-1.5 text-[#94a3b8] transition hover:bg-white/10 hover:text-white lg:flex"
        >
          <Icon d={collapsed ? "m6 9 6 6 6-6" : "m18 15-6-6-6 6"} className="h-4 w-4" />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pt-3">
          <div className="relative">
            <Icon
              d={ICONS.search}
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search menu…"
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-[#64748b] focus:border-blue-500/60 focus:bg-white/10 focus:ring-2 focus:ring-blue-500/20"
            />
            {needle && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-1.5 text-[#64748b] hover:text-white"
              >
                &times;
              </button>
            )}
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            {allItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  onClick={onMobileClose}
                  className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition ${
                    active
                      ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-900/40"
                      : "text-[#94a3b8] hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {active && (
                    <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-blue-400 to-indigo-500" />
                  )}
                  <Icon d={ICONS[item.icon]} className="h-5 w-5" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredSections.map((section) => {
              const isOpen = needle.length > 0 || openSections.has(section.title);
              const anyActive = section.items.some((i) => isActive(i.href));
              return (
                <div key={section.title}>
                  <button
                    onClick={() => toggleSection(section.title)}
                    className={`group flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
                      anyActive ? "text-blue-400" : "text-[#64748b]"
                    } transition hover:text-[#cbd5e1]`}
                  >
                    <span>{section.title}</span>
                    <Icon
                      d={ICONS.chevron}
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${
                        isOpen ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="mt-0.5 space-y-0.5">
                      {section.items.map((item) => {
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={onMobileClose}
                            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                              active
                                ? "bg-gradient-to-r from-blue-600/20 to-indigo-600/10 font-medium text-white ring-1 ring-blue-500/30"
                                : "text-[#94a3b8] hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            {active && (
                              <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-blue-400 to-indigo-500" />
                            )}
                            <Icon
                              d={ICONS[item.icon]}
                              className={`h-[18px] w-[18px] ${
                                active
                                  ? "text-blue-400"
                                  : "text-[#64748b] group-hover:text-[#cbd5e1]"
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredSections.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-[#64748b]">
                No menu items found.
              </p>
            )}
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-white/5 p-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setProfileOpen(true)}
            title="Change profile photo"
            className="group relative shrink-0"
          >
            {currentAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentAvatar}
                alt=""
                className="h-10 w-10 rounded-xl object-cover shadow-lg ring-2 ring-white/10 transition group-hover:ring-blue-400/50"
              />
            ) : (
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(
                  name || "User"
                )} text-sm font-bold text-white shadow-lg transition group-hover:ring-2 group-hover:ring-blue-400/50`}
              >
                {(name || "U")
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white ring-2 ring-[#0f172a]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="h-2 w-2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          </button>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{name}</p>
              <p className="truncate text-[11px] text-[#94a3b8]">{email}</p>
              <span className="mt-0.5 inline-block rounded-full bg-blue-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-400">
                {role}
              </span>
            </div>
          )}
        </div>
        <form action="/logout" method="post" className="mt-3">
          <button
            type="submit"
            title={collapsed ? "Sign out" : undefined}
            className={`flex w-full items-center rounded-xl bg-white/5 py-2 text-sm font-medium text-[#cbd5e1] transition hover:bg-rose-500/20 hover:text-rose-300 ${
              collapsed ? "justify-center" : "justify-center gap-2"
            }`}
          >
            <Icon d={ICONS.logout} className="h-4 w-4" />
            {!collapsed && "Sign out"}
          </button>
        </form>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop */}
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">
        {sidebar}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-[#020617]/60 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            {sidebar}
          </div>
        </div>
      )}

      <AvatarModal
        open={profileOpen}
        name={name}
        email={email}
        avatarUrl={currentAvatar}
        userId={userId}
        onClose={() => setProfileOpen(false)}
        onSaved={(url) => setCurrentAvatar(url)}
      />
    </>
  );
}
