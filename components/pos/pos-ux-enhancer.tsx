"use client";

import { useEffect } from "react";

const STYLE_ID = "pos-ux-enhancer-style";

function textOf(el: Element) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function hideButton(button: HTMLButtonElement, reason = "default") {
  button.setAttribute("data-pos-ux-hidden", reason);
  button.style.display = "none";
}

function restoreButton(button: HTMLButtonElement, reason: string) {
  if (button.getAttribute("data-pos-ux-hidden") === reason) {
    button.removeAttribute("data-pos-ux-hidden");
    button.style.removeProperty("display");
  }
}

function syncWorkspaceHeight(root: HTMLElement) {
  const workspaces = root.querySelectorAll<HTMLElement>(".pos-workspace-grid");
  workspaces.forEach((workspace) => {
    const rect = workspace.getBoundingClientRect();
    const available = Math.max(360, Math.floor(window.innerHeight - rect.top - 10));
    workspace.style.setProperty("--pos-workspace-height", `${available}px`);
  });

  const rootRect = root.getBoundingClientRect();
  const rootHeight = Math.max(420, Math.floor(window.innerHeight - rootRect.top - 8));
  root.style.setProperty("--pos-root-height", `${rootHeight}px`);
}

function applyPosUx(root: HTMLElement) {
  const quickMode = Boolean(root.querySelector(".pos-cart-drawer"));
  root.dataset.posMode = quickMode ? "quick" : "standard";

  root.querySelectorAll<HTMLElement>(".pos-workspace-grid > .min-w-0").forEach((catalog) => {
    catalog.classList.add("pos-ux-catalog-column");
  });

  root.querySelectorAll<HTMLElement>(".pos-item-toolbar").forEach((toolbar) => {
    if (toolbar.dataset.posUxListDefault !== "1") {
      try {
        window.localStorage.setItem("sccomm-pos-view", "list");
        window.localStorage.setItem("sccomm-qs-view", "list");
      } catch {}
      const listButton = toolbar.querySelector<HTMLButtonElement>("button[title=\"List view\"]");
      if (listButton && !listButton.disabled) listButton.click();
      toolbar.dataset.posUxListDefault = "1";
    }

    const next = toolbar.nextElementSibling;
    const quickFavouriteRow =
      quickMode &&
      next instanceof HTMLElement &&
      next.classList.contains("pos-category-chips") &&
      textOf(next).includes("Favourites");
    const duplicateFav = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => textOf(button) === "Favorites"
    );
    if (duplicateFav) {
      if (quickFavouriteRow) hideButton(duplicateFav, "quick-favourites");
      else restoreButton(duplicateFav, "quick-favourites");
    }
  });

  root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    const hiddenReason = button.getAttribute("data-pos-ux-hidden");
    if (hiddenReason && hiddenReason !== "quick-recall" && hiddenReason !== "quick-favourites") return;

    const label = textOf(button);
    const insideBilling = Boolean(button.closest(".pos-billing-drawer"));
    const insideToolbar = Boolean(button.closest(".pos-item-toolbar"));

    if (label === "Customers" && !insideBilling) hideButton(button);
    if (label === "Hold Bill" && !insideBilling) hideButton(button);

    if (label.startsWith("Recall") && !insideBilling) {
      if (quickMode) hideButton(button, "quick-recall");
      else restoreButton(button, "quick-recall");
    }

    if (label === "Recent Sales" && insideBilling) hideButton(button);
    if (label === "All Items" && insideToolbar) hideButton(button);

    if (label === "Save Draft" && insideBilling) {
      button.textContent = "Hold / Draft";
      button.setAttribute("aria-label", "Hold or save draft");
    }

    if ((label === "₹ Settle Only" || label === "Settle Only") && insideBilling) hideButton(button);

    if (label === "Clear all" && insideBilling) {
      button.textContent = "Clear";
    }
  });

  root.querySelectorAll<HTMLElement>(".pos-billing-drawer [data-sticky-drawer=\"true\"]").forEach((drawer) => {
    drawer.classList.add("pos-ux-billing-card");
  });

  root.querySelectorAll<HTMLElement>(".pos-billing-drawer h2").forEach((heading) => {
    if (textOf(heading) === "Current Invoice") heading.textContent = "Current Bill";
  });

  syncWorkspaceHeight(root);
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Treat the POS as a viewport-filling application surface. */
    .pos-premium-root {
      height: var(--pos-root-height, auto) !important;
      max-height: var(--pos-root-height, none) !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }

    .pos-premium-root .pos-workspace-grid {
      min-height: 0 !important;
      max-height: var(--pos-workspace-height, none) !important;
      height: var(--pos-workspace-height, auto) !important;
      overflow: hidden !important;
      align-items: stretch !important;
    }

    .pos-premium-root .pos-ux-catalog-column {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      height: 100% !important;
      overflow: hidden !important;
    }

    .pos-premium-root .pos-ux-catalog-column > * {
      order: 3;
      min-width: 0;
    }

    .pos-premium-root .pos-ux-catalog-column > .pos-category-chips {
      order: 1;
      flex: 0 0 auto;
      margin-top: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 3px !important;
      position: sticky;
      top: 0;
      z-index: 12;
      background: inherit;
    }

    .pos-premium-root .pos-ux-catalog-column > .pos-item-toolbar {
      order: 2;
      flex: 0 0 auto;
      margin-top: 0 !important;
      margin-bottom: 5px !important;
      position: sticky;
      top: 0;
      z-index: 11;
      background: inherit;
    }

    .pos-premium-root .pos-ux-catalog-column > .pos-category-chips + .pos-item-toolbar {
      margin-top: 0 !important;
    }

    .pos-premium-root .pos-ux-catalog-column > [class*="mt-4"] {
      margin-top: 4px !important;
    }

    /* Only the catalogue itself scrolls on desktop. */
    .pos-premium-root .pos-ux-catalog-column > :not(.pos-category-chips):not(.pos-item-toolbar) {
      order: 3;
      flex: 1 1 0% !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }

    /* The checkout is a normal grid column, never a viewport-floating card. */
    .pos-premium-root .pos-billing-drawer,
    .pos-premium-root .pos-cart-drawer {
      min-width: 0 !important;
      min-height: 0 !important;
      height: 100% !important;
      position: relative !important;
    }

    .pos-premium-root .pos-ux-billing-card {
      position: relative !important;
      inset: auto !important;
      width: 100% !important;
      height: 100% !important;
      max-height: none !important;
      border-radius: 16px !important;
      box-shadow: 0 8px 28px rgba(15, 23, 42, 0.08) !important;
      display: flex !important;
      flex-direction: column !important;
      min-height: 0 !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      z-index: auto !important;
    }

    .pos-premium-root .pos-cart-drawer {
      position: relative !important;
      inset: auto !important;
      width: 100% !important;
      height: 100% !important;
      max-height: none !important;
      display: flex !important;
      flex-direction: column !important;
      min-height: 0 !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      z-index: auto !important;
    }

    .pos-premium-root .pos-ux-billing-card > :first-child,
    .pos-premium-root .pos-cart-drawer > :first-child {
      min-height: 48px;
      padding: 8px 12px !important;
      background: rgba(248, 250, 252, 0.76);
      flex: 0 0 auto;
    }

    .pos-premium-root .pos-ux-billing-card > :nth-child(2),
    .pos-premium-root .pos-cart-drawer > :nth-child(2) {
      padding: 8px 12px !important;
      scrollbar-width: thin;
      overflow-y: auto !important;
      min-height: 0 !important;
      flex: 1 1 auto !important;
    }

    .pos-premium-root .pos-ux-billing-card > :last-child,
    .pos-premium-root .pos-cart-drawer > :last-child {
      position: sticky;
      bottom: 0;
      z-index: 5;
      padding: 8px 12px !important;
      background: rgba(248, 250, 252, 0.96);
      backdrop-filter: blur(10px);
      flex: 0 0 auto;
    }

    .pos-premium-root .pos-ux-billing-card [data-cart-item-key],
    .pos-premium-root .pos-cart-drawer [data-cart-item-key],
    .pos-premium-root .pos-cart-drawer [data-quick-cart-key] {
      padding: 7px !important;
      border-radius: 10px !important;
    }

    .pos-premium-root .pos-ux-billing-card .space-y-2,
    .pos-premium-root .pos-ux-billing-card .space-y-2\\.5,
    .pos-premium-root .pos-ux-billing-card .space-y-3,
    .pos-premium-root .pos-cart-drawer .space-y-2,
    .pos-premium-root .pos-cart-drawer .space-y-2\\.5,
    .pos-premium-root .pos-cart-drawer .space-y-3 {
      row-gap: 5px !important;
    }

    .pos-premium-root .pos-ux-billing-card .grid.grid-cols-2,
    .pos-premium-root .pos-ux-billing-card .grid.grid-cols-3,
    .pos-premium-root .pos-ux-billing-card .grid.grid-cols-4,
    .pos-premium-root .pos-cart-drawer .grid.grid-cols-2,
    .pos-premium-root .pos-cart-drawer .grid.grid-cols-3,
    .pos-premium-root .pos-cart-drawer .grid.grid-cols-4 {
      gap: 5px !important;
    }

    .pos-premium-root .pos-ux-billing-card .grid.grid-cols-3 > button,
    .pos-premium-root .pos-ux-billing-card .grid.grid-cols-4 > button,
    .pos-premium-root .pos-cart-drawer .grid.grid-cols-3 > button,
    .pos-premium-root .pos-cart-drawer .grid.grid-cols-4 > button {
      min-height: 34px;
      padding-top: 6px !important;
      padding-bottom: 6px !important;
    }

    .pos-premium-root .pos-ux-billing-card .py-3\\.5,
    .pos-premium-root .pos-cart-drawer .py-3\\.5,
    .pos-premium-root .pos-ux-billing-card .py-4,
    .pos-premium-root .pos-cart-drawer .py-4 {
      padding-top: 7px !important;
      padding-bottom: 7px !important;
    }

    .pos-premium-root .pos-ux-billing-card .text-xl,
    .pos-premium-root .pos-cart-drawer .text-xl {
      font-size: 1.15rem !important;
    }

    .pos-premium-root .pos-ux-billing-card .btn-3d-tactile-primary,
    .pos-premium-root .pos-cart-drawer .btn-3d-tactile-primary {
      min-height: 44px;
      padding-top: 9px !important;
      padding-bottom: 9px !important;
    }

    /* Compact operational bars so the catalogue gets the recovered height. */
    .pos-premium-root .pos-ops-strip {
      min-height: 42px !important;
      margin-bottom: 6px !important;
      padding-top: 6px !important;
      padding-bottom: 6px !important;
    }

    /* The Quick Sale activity summary is useful, but should be a thin status line. */
    .pos-premium-root [class*="rounded-xl"][class*="bg-white"][class*="ring-1"] {
      margin-bottom: 6px !important;
    }

    @media (min-width: 1024px) {
      .pos-premium-root .pos-workspace-grid {
        grid-template-columns: minmax(0, 1fr) 360px !important;
        gap: 10px !important;
      }
    }

    @media (max-width: 1279px) and (min-width: 1024px) {
      .pos-premium-root .pos-workspace-grid {
        grid-template-columns: minmax(0, 1fr) 340px !important;
        gap: 9px !important;
      }
    }

    @media (max-width: 1023px) {
      .pos-premium-root {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }

      .pos-premium-root .pos-workspace-grid {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }

      .pos-premium-root .pos-ux-catalog-column {
        height: auto !important;
        overflow: visible !important;
      }

      .pos-premium-root .pos-ux-catalog-column > :not(.pos-category-chips):not(.pos-item-toolbar) {
        overflow-y: visible !important;
        flex: none !important;
      }

      .pos-premium-root .pos-ux-billing-card,
      .pos-premium-root .pos-cart-drawer {
        position: static !important;
        width: auto !important;
        height: auto !important;
        max-height: none !important;
      }

      .pos-premium-root .pos-ux-billing-card > :nth-child(2),
      .pos-premium-root .pos-cart-drawer > :nth-child(2) {
        overflow-y: visible !important;
      }
    }
  `;
  document.head.appendChild(style);
}

export default function PosUxEnhancer() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".pos-premium-root");
    if (!root) return;

    ensureStyles();
    applyPosUx(root);

    const resize = () => syncWorkspaceHeight(root);
    window.addEventListener("resize", resize);

    const observer = new MutationObserver(() => applyPosUx(root));
    observer.observe(root, { childList: true, subtree: true });

    const ro = new ResizeObserver(resize);
    ro.observe(root);

    return () => {
      window.removeEventListener("resize", resize);
      observer.disconnect();
      ro.disconnect();
    };
  }, []);

  return null;
}
