"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HUBS } from "@/lib/navigation/hub-navigation";

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

export default function Sidebar({
  name, email, shopName, logoUrl, avatarUrl, collapsed, onToggle, mobileOpen, onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const activeHub = HUBS.find((hub) => pathname === `/hubs/${hub.id}` || pathname.startsWith(`/hubs/${hub.id}/`));

  return (
    <>
      {mobileOpen && <button aria-label="Close menu" onClick={onMobileClose} className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200/80 bg-white/95 shadow-xl backdrop-blur-xl transition-all duration-300 dark:border-white/10 dark:bg-slate-950/95 ${collapsed ? "w-[76px]" : "w-[276px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex h-16 items-center gap-3 border-b border-slate-200/80 px-4 dark:border-white/10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg">
            {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" /> : <b>CE</b>}
          </div>
          {!collapsed && <div className="min-w-0"><div className="truncate text-sm font-black">{shopName || "Cafe ERP"}</div><div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">ERP Hub</div></div>}
          <button onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="ml-auto hidden h-8 w-8 rounded-lg lg:block">{collapsed ? "›" : "‹"}</button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-5">
            {!collapsed && <div className="mb-2 px-3 text-[10px] font-black tracking-widest text-slate-400">HOME</div>}
            <Link href="/dashboard" onClick={onMobileClose} className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold ${pathname === "/dashboard" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"}`}>
              <span className="w-5 text-center">⌂</span>{!collapsed && "Dashboard"}
            </Link>
          </div>

          <div>
            {!collapsed && <div className="mb-2 px-3 text-[10px] font-black tracking-widest text-slate-400">HUBS</div>}
            <div className="space-y-1">
              {HUBS.map((hub) => {
                const active = activeHub?.id === hub.id;
                return (
                  <Link key={hub.id} href={`/hubs/${hub.id}`} onClick={onMobileClose} title={collapsed ? hub.label : undefined} className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold transition ${active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"}`}>
                    <span className="flex w-5 shrink-0 justify-center text-base">{hub.icon}</span>
                    {!collapsed && <span className="truncate">{hub.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        <div className="border-t border-slate-200/80 p-3 dark:border-white/10">
          <div className={`flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 dark:bg-white/[.04] ${collapsed ? "justify-center" : ""}`}>
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-9 w-9 rounded-xl object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-xs font-black text-white">{(name || "U").slice(0, 2).toUpperCase()}</div>}
            {!collapsed && <div className="min-w-0"><div className="truncate text-xs font-black">{name || "User"}</div><div className="truncate text-[10px] text-slate-500">{email}</div></div>}
          </div>
        </div>
      </aside>
    </>
  );
}
