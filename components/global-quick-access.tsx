"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { DEFAULT_QUICK_ACCESS, type QuickAccessItem } from "@/components/quick-access-registry";
import {
  loadQuickAccessDisplayMode,
  loadQuickAccessItems,
  subscribeQuickAccess,
  type QuickAccessDisplayMode,
} from "@/components/quick-access-store";

const ICONS: Record<string, string> = {
  dashboard: "⌂",
  pos: "▣",
  "customer-crm": "♙",
  "cash-book": "▤",
  aeps: "▥",
  "aeps-cash-out": "▥",
  dmt: "➤",
  expenses: "↘",
  "day-close": "◷",
  invoices: "▧",
  returns: "↶",
  catalog: "▦",
  products: "◇",
  services: "✦",
  categories: "▦",
  brands: "◆",
  units: "▤",
  inventory: "▱",
  "inventory-movements": "⇄",
  purchases: "🛒",
  "purchase-entry": "▣",
  suppliers: "▰",
  business: "◈",
  "bill-payment": "▣",
  recharge: "◉",
  "google-play": "▶",
  "utility-bills": "▤",
  upi: "⌁",
  whatsapp: "◌",
  banks: "▥",
  portals: "◫",
  "merchant-qrs": "▦",
  "finance-hub": "▥",
  pnl: "↗",
  journal: "≣",
  "trial-balance": "⚖",
  accounts: "▤",
  settlements: "⇄",
  opening: "⌂",
  ledger: "≣",
  reports: "▥",
  gst: "▧",
  "tax-prep": "▤",
  "audit-log": "◉",
  ai: "✦",
  "self-audit": "✓",
  staff: "♙",
  security: "⌘",
  settings: "⚙",
};

function matchesCurrentRoute(item: QuickAccessItem, pathname: string, searchParams: URLSearchParams) {
  const [hrefPath, hrefQuery = ""] = item.href.split("?");
  if (hrefPath !== pathname) return false;
  if (!hrefQuery) return true;

  const target = new URLSearchParams(hrefQuery);
  for (const [key, value] of target.entries()) {
    if (searchParams.get(key) !== value) return false;
  }
  return true;
}

export default function GlobalQuickAccess() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const isPos = pathname === "/pos";
  const [items, setItems] = useState<QuickAccessItem[]>(DEFAULT_QUICK_ACCESS);
  const [displayMode, setDisplayMode] = useState<QuickAccessDisplayMode>("full");
  const [posPortalTarget, setPosPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => {
      setItems(loadQuickAccessItems());
      setDisplayMode(loadQuickAccessDisplayMode());
    };
    sync();
    return subscribeQuickAccess(sync);
  }, []);

  useEffect(() => {
    if (!isPos) {
      setPosPortalTarget(null);
      return;
    }

    const posRoot = document.querySelector<HTMLElement>(".cafeerp-pos-reference");
    if (!posRoot) return;

    const existingSlot = posRoot.querySelector<HTMLElement>("[data-pos-quick-access-slot]");
    const slot = existingSlot ?? document.createElement("div");
    slot.setAttribute("data-pos-quick-access-slot", "true");
    slot.style.flex = "0 0 52px";
    slot.style.height = "52px";
    slot.style.minHeight = "52px";
    slot.style.width = "100%";
    slot.style.overflow = "hidden";

    if (!existingSlot) {
      const posMain = Array.from(posRoot.children).find((child) => child.tagName === "MAIN");
      if (posMain) posRoot.insertBefore(slot, posMain);
      else posRoot.appendChild(slot);
    }

    setPosPortalTarget(slot);

    return () => {
      setPosPortalTarget(null);
      if (!existingSlot) slot.remove();
    };
  }, [isPos]);

  const nav = (
    <nav
      className="cafe-quick-access"
      aria-label="Quick Access"
      style={isPos ? {
        position: "relative",
        top: "auto",
        left: "auto",
        right: "auto",
        width: "100%",
        margin: 0,
        zIndex: 20,
      } : undefined}
    >
      <div className="cafe-quick-access__inner">
        <div className="cafe-quick-access__label" aria-hidden="true">
          <span className="cafe-quick-access__label-icon">⌁</span>
          <span>Quick Access</span>
        </div>

        <div className="cafe-quick-access__scroll">
          {items.map((item) => {
            const active = matchesCurrentRoute(item, pathname, searchParams);
            const icon = ICONS[item.icon] || "•";
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={`cafe-quick-access__item ${active ? "cafe-quick-access__item--active" : ""} ${displayMode === "icon" ? "cafe-quick-access__item--icon-only" : ""}`}
              >
                <span className="cafe-quick-access__icon" aria-hidden="true">{icon}</span>
                {displayMode === "full" && <span className="cafe-quick-access__text">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );

  if (isPos) {
    return posPortalTarget ? createPortal(nav, posPortalTarget) : null;
  }

  return nav;
}
