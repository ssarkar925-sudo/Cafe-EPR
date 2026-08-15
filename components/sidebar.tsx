"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { label: string; href: string; icon: string };
type NavSection = { title: string; items: NavItem[] };

const ICONS: Record<string, string> = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  pos: "M6 6h15l-1.5 8h-13L4 3H2M9 20a1 1 0 1 0 0 .01M20 20a1 1 0 1 0 0 .01",
  invoices: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  customers: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  products: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9",
  services: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  categories: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  aeps: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7m4 11V7M2 7l10-5 10 5z",
  dmt: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
  upi: "M12 18h.01M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z",
  portals: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
  qrs: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1M14 20h1M20 20h1",
  expenses: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z",
  cashbook: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  ledger: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  reports: "M18 20V10M12 20V4M6 20v-6",
  staff: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
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
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(["Catalog"])
  );

  const isStaff = role === "staff";
  const isAdmin = role === "admin";

  const sections: NavSection[] = useMemo(() => {
    const base: NavSection[] = [
      {
        title: "Main",
        items: [
          { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
          { label: "Point of Sale", href: "/pos", icon: "pos" },
          { label: "Invoices", href: "/invoices", icon: "invoices" },
          { label: "Customers", href: "/customers", icon: "customers" },
        ],
      },
      {
        title: "Catalog",
        items: [
          { label: "Products", href: "/catalog/products", icon: "products" },
          { label: "Services", href: "/catalog/services", icon: "services" },
          { label: "Categories", href: "/catalog/categories", icon: "categories" },
        ],
      },
    ];
    if (!isStaff) {
      base.push({
        title: "Business",
        items: [
          { label: "AEPS", href: "/business/aeps", icon: "aeps" },
          { label: "DMT", href: "/business/dmt", icon: "dmt" },
          { label: "UPI", href: "/business/upi", icon: "upi" },
          { label: "Banks", href: "/business/banks", icon: "aeps" },
          { label: "Portals", href: "/business/portals", icon: "portals" },
          { label: "Merchant QRs", href: "/business/merchant-qrs", icon: "qrs" },
        ],
      });
      base.push({
        title: "Finance",
        items: [
          { label: "Expenses", href: "/finance/expenses", icon: "expenses" },
          { label: "Cash Book", href: "/finance/cashbook", icon: "cashbook" },
          { label: "Ledger", href: "/finance/ledger", icon: "ledger" },
          { label: "Reports", href: "/reports", icon: "reports" },
        ],
      });
    }
    if (isAdmin) {
      base.push({
        title: "Administrative",
        items: [
          { label: "Staff", href: "/staff", icon: "staff" },
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
      className={`flex h-full flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-200 transition-all duration-300 ${
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
            <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Cafe ERP
            </p>
          </div>
        )}
        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden shrink-0 items-center justify-center rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white lg:flex"
        >
          <Icon d={collapsed ? "m6 9 6 6 6-6" : "m18 15-6-6-6 6"} className="h-4 w-4" />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pt-3">
          <div className="relative">
            <Icon
              d={ICONS.search}
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search menu…"
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500/60 focus:bg-white/10 focus:ring-2 focus:ring-blue-500/20"
            />
            {needle && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-1.5 text-slate-500 hover:text-white"
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
                      : "text-slate-400 hover:bg-white/10 hover:text-white"
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
                      anyActive ? "text-blue-400" : "text-slate-500"
                    } transition hover:text-slate-300`}
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
                                : "text-slate-400 hover:bg-white/5 hover:text-white"
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
                                  : "text-slate-500 group-hover:text-slate-300"
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
              <p className="px-3 py-6 text-center text-sm text-slate-500">
                No menu items found.
              </p>
            )}
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-white/5 p-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(
              name || "User"
            )} text-sm font-bold text-white shadow-lg`}
          >
            {(name || "U")
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{name}</p>
              <p className="truncate text-[11px] text-slate-400">{email}</p>
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
            className={`flex w-full items-center rounded-xl bg-white/5 py-2 text-sm font-medium text-slate-300 transition hover:bg-rose-500/20 hover:text-rose-300 ${
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
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            {sidebar}
          </div>
        </div>
      )}
    </>
  );
}
