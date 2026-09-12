"use client";

import { useEffect } from "react";

const STYLE_ID = "pos-ux-enhancer-style";

function textOf(el: Element) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function hideButton(button: HTMLButtonElement) {
  button.setAttribute("data-pos-ux-hidden", "true");
  button.style.display = "none";
}

function applyPosUx(root: HTMLElement) {
  // Categories are the primary POS filter, so visually promote them above the
  // item toolbar without changing the React component structure.
  root.querySelectorAll<HTMLElement>(".pos-workspace-grid > .min-w-0").forEach((catalog) => {
    catalog.classList.add("pos-ux-catalog-column");
  });

  // Make List View the default every time the POS / Quick Sale browser mounts.
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
  });

  root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    if (button.dataset.posUxHidden === "true") return;
    const label = textOf(button);
    const insideBilling = Boolean(button.closest(".pos-billing-drawer"));
    const insideToolbar = Boolean(button.closest(".pos-item-toolbar"));

    // These are duplicated elsewhere in the POS shell and add noise.
    if (label === "Customers" && !insideBilling) hideButton(button);
    if (label === "Hold Bill" && !insideBilling) hideButton(button);
    if (label === "Recent Sales" && insideBilling) hideButton(button);

    // Categories already provide the catch-all item filter. Keep the toolbar
    // focused on type/search/view instead of showing a second "All Items".
    if (label === "All Items" && insideToolbar) hideButton(button);

    // Save Draft remains as the single hold mechanism in the standard POS.
    if (label === "Save Draft" && insideBilling) {
      button.textContent = "Hold / Draft";
      button.setAttribute("aria-label", "Hold or save draft");
    }

    // The primary Pay & Print action is the normal completion path; remove the
    // competing Settle Only button from the always-visible footer.
    if ((label === "₹ Settle Only" || label === "Settle Only") && insideBilling) hideButton(button);

    if (label === "Clear all" && insideBilling) {
      button.textContent = "Clear";
    }
  });

  root.querySelectorAll<HTMLElement>(".pos-billing-drawer [data-sticky-drawer=\"true\"]").forEach((drawer) => {
    drawer.classList.add("pos-ux-billing-card");
  });
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .pos-premium-root .pos-ux-catalog-column {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }

    .pos-premium-root .pos-ux-catalog-column > * {
      order: 3;
    }

    .pos-premium-root .pos-ux-catalog-column > .pos-category-chips {
      order: 1;
      margin-top: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 3px !important;
    }

    .pos-premium-root .pos-ux-catalog-column > .pos-item-toolbar {
      order: 2;
      margin-top: 0 !important;
      margin-bottom: 6px !important;
    }

    .pos-premium-root .pos-ux-catalog-column > .pos-category-chips + .pos-item-toolbar {
      margin-top: 0 !important;
    }

    .pos-premium-root .pos-ux-catalog-column > [class*="mt-4"] {
      margin-top: 5px !important;
    }

    .pos-premium-root .pos-billing-drawer {
      min-height: 0;
    }

    .pos-premium-root .pos-ux-billing-card {
      max-height: calc(100vh - 7.25rem) !important;
      border-radius: 16px !important;
      box-shadow: 0 8px 28px rgba(15, 23, 42, 0.08) !important;
    }

    .pos-premium-root .pos-ux-billing-card > :first-child {
      min-height: 52px;
      padding: 9px 12px !important;
    }

    .pos-premium-root .pos-ux-billing-card > :nth-child(2) {
      padding: 9px 12px !important;
      scrollbar-width: thin;
    }

    .pos-premium-root .pos-ux-billing-card > :last-child {
      padding: 9px 12px !important;
    }

    .pos-premium-root .pos-ux-billing-card [data-cart-item-key] {
      padding: 8px !important;
      border-radius: 10px !important;
    }

    .pos-premium-root .pos-ux-billing-card [data-cart-item-key] .mt-2,
    .pos-premium-root .pos-ux-billing-card [data-cart-item-key] .mt-2\.5 {
      margin-top: 6px !important;
    }

    .pos-premium-root .pos-ux-billing-card .space-y-2,
    .pos-premium-root .pos-ux-billing-card .space-y-2\.5,
    .pos-premium-root .pos-ux-billing-card .space-y-3 {
      row-gap: 6px !important;
    }

    .pos-premium-root .pos-ux-billing-card .grid.grid-cols-2 {
      gap: 6px !important;
    }

    .pos-premium-root .pos-ux-billing-card .py-3\.5 {
      padding-top: 8px !important;
      padding-bottom: 8px !important;
    }

    .pos-premium-root .pos-ux-billing-card .py-4 {
      padding-top: 9px !important;
      padding-bottom: 9px !important;
    }

    .pos-premium-root .pos-ux-billing-card .text-xl {
      font-size: 1.15rem !important;
    }

    .pos-premium-root .pos-ux-billing-card .btn-3d-tactile-primary {
      min-height: 44px;
      padding-top: 10px !important;
      padding-bottom: 10px !important;
    }

    @media (min-width: 1024px) {
      .pos-premium-root .pos-workspace-grid {
        grid-template-columns: minmax(0, 1fr) 380px !important;
        gap: 12px !important;
      }
    }

    @media (max-width: 1279px) and (min-width: 1024px) {
      .pos-premium-root .pos-workspace-grid {
        grid-template-columns: minmax(0, 1fr) 360px !important;
      }
    }

    @media (max-width: 1023px) {
      .pos-premium-root .pos-ux-billing-card {
        max-height: none !important;
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

    const observer = new MutationObserver(() => applyPosUx(root));
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
