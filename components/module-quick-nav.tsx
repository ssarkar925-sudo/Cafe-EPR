"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const modules = [
  { label: "Products", href: "/catalog/products", icon: "▦" },
  { label: "Services", href: "/catalog/services", icon: "✦" },
  { label: "Purchases", href: "/purchases", icon: "↓" },
  { label: "Inventory", href: "/inventory/movements", icon: "◇" },
  { label: "Suppliers", href: "/suppliers", icon: "♙" },
  { label: "Returns", href: "/returns", icon: "↶" },
  { label: "Cash Book", href: "/finance/cashbook", icon: "₹" },
  { label: "Reports", href: "/reports", icon: "▥" },
  { label: "AI Audit", href: "/ai/self-audit", icon: "✧" },
];

export default function ModuleQuickNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-14 z-10 border-b border-slate-200/80 bg-white/90 px-3 py-2 backdrop-blur lg:top-16 lg:px-6 dark:border-white/10 dark:bg-slate-950/85">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 overflow-x-auto scrollbar-thin">
        <span className="mr-1 shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
          Quick access
        </span>
        {modules.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                active
                  ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                  : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:border-white/10 dark:hover:bg-white/5 dark:hover:text-white"
              }`}
            >
              <span className="text-xs leading-none opacity-80">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
