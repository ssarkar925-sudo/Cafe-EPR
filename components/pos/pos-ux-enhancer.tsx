"use client";

import { useEffect } from "react";

const STYLE_ID = "pos-ux-enhancer-style";

type RestoreStyle = {
  el: HTMLElement;
  overflow: string;
  overflowX: string;
  overflowY: string;
};

function textOf(el: Element) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function getSharedRecall(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
    return textOf(button).startsWith("Recall") && !button.closest(".pos-billing-drawer");
  });
}

function hideSharedRecall(root: HTMLElement) {
  getSharedRecall(root)?.style.setProperty("display", "none", "important");
}

function syncMode(root: HTMLElement) {
  const mode = root.querySelector(".pos-cart-drawer") ? "quick" : "standard";
  if (root.dataset.posMode !== mode) root.dataset.posMode = mode;
  return mode === "quick";
}

function syncViewportHeight(root: HTMLElement) {
  if (window.innerWidth < 1024) {
    root.style.removeProperty("--pos-root-height");
    return;
  }

  const top = Math.max(0, root.getBoundingClientRect().top);
  const height = Math.max(420, Math.floor(window.innerHeight - top - 8));
  root.style.setProperty("--pos-root-height", `${height}px`);
}

function ensureStandardRecall(root: HTMLElement) {
  const billing = root.querySelector<HTMLElement>(".pos-billing-drawer:not(.pos-cart-drawer)");
  const card = billing?.querySelector<HTMLElement>('[data-sticky-drawer="true"]');
  const header = card?.firstElementChild as HTMLElement | null;
  if (!billing || !header) return;

  header.dataset.posUxStandardHeader = "1";

  let recall = header.querySelector<HTMLButtonElement>('[data-pos-ux-standard-recall="1"]');
  if (!recall) {
    recall = document.createElement("button");
    recall.type = "button";
    recall.dataset.posUxStandardRecall = "1";
    recall.className =
      "inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100 active:scale-95 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300";
    recall.title = "Recall held bills and drafts";
    recall.setAttribute("aria-label", "Recall held bills and drafts");
    recall.addEventListener("click", (event) => {
      event.preventDefault();
      getSharedRecall(root)?.click();
    });
    header.appendChild(recall);
  }

  const source = getSharedRecall(root);
  if (source) {
    recall.innerHTML = source.innerHTML || "Recall";
    recall.title = source.title || "Recall held bills and drafts";
  } else if (!recall.innerHTML) {
    recall.textContent = "Recall";
  }
}

function cleanupControls(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    const label = textOf(button);
    const insideBilling = Boolean(button.closest(".pos-billing-drawer"));
    const insideToolbar = Boolean(button.closest(".pos-item-toolbar"));
    const isStandardRecall = button.hasAttribute("data-pos-ux-standard-recall");

    if (label.startsWith("Recall") && !insideBilling && !isStandardRecall) {
      button.style.setProperty("display", "none", "important");
    }
    if (label === "Customers" && !insideBilling) button.style.setProperty("display", "none", "important");
    if (label === "Hold Bill" && !insideBilling) button.style.setProperty("display", "none", "important");
    if (label === "All Items" && insideToolbar) button.style.setProperty("display", "none", "important");

    if (insideBilling && label === "Save Draft") {
      button.textContent = "Hold / Draft";
      button.setAttribute("aria-label", "Hold or save draft");
    }

    if (insideBilling && (label === "₹ Settle Only" || label === "Settle Only")) {
      button.style.setProperty("display", "none", "important");
    }
  });
}

function apply(root: HTMLElement) {
  const quick = syncMode(root);
  hideSharedRecall(root);

  if (quick) {
    root.querySelectorAll<HTMLElement>('[data-pos-ux-standard-recall="1"]').forEach((node) => node.remove());
  } else {
    ensureStandardRecall(root);
  }

  cleanupControls(root);
  syncViewportHeight(root);
}

function lockScrollContainers(root: HTMLElement) {
  const candidates: HTMLElement[] = [document.documentElement, document.body];
  let parent = root.parentElement;

  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    const scrollY = style.overflowY === "auto" || style.overflowY === "scroll";
    const scrollX = style.overflowX === "auto" || style.overflowX === "scroll";
    if (scrollY || scrollX) candidates.push(parent);
    parent = parent.parentElement;
  }

  const seen = new Set<HTMLElement>();
  const restores: RestoreStyle[] = [];

  for (const el of candidates) {
    if (seen.has(el)) continue;
    seen.add(el);
    restores.push({
      el,
      overflow: el.style.overflow,
      overflowX: el.style.overflowX,
      overflowY: el.style.overflowY,
    });
    el.style.setProperty("overflow", "hidden", "important");
    el.style.setProperty("overflow-x", "hidden", "important");
    el.style.setProperty("overflow-y", "hidden", "important");
  }

  return () => {
    for (const item of restores.reverse()) {
      item.el.style.overflow = item.overflow;
      item.el.style.overflowX = item.overflowX;
      item.el.style.overflowY = item.overflowY;
    }
  };
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .pos-premium-root {
      box-sizing: border-box !important;
      min-width: 0 !important;
      min-height: 0 !important;
      width: 100% !important;
      overflow-x: hidden !important;
      overscroll-behavior: none !important;
    }

    @media (min-width: 1024px) {
      .pos-premium-root {
        height: var(--pos-root-height, calc(100vh - 120px)) !important;
        max-height: var(--pos-root-height, calc(100vh - 120px)) !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        padding-top: 4px !important;
        padding-bottom: 4px !important;
      }

      .pos-premium-root > .mb-3\\.5 {
        flex: 0 0 auto !important;
        margin-bottom: 6px !important;
      }

      .pos-premium-root > .mb-4 {
        flex: 0 0 auto !important;
        margin-bottom: 6px !important;
      }

      .pos-premium-root[data-pos-mode="standard"] > .pos-workspace-grid {
        flex: 1 1 0 !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow: hidden !important;
        margin: 0 !important;
      }

      .pos-premium-root[data-pos-mode="standard"] > .mt-4.rounded-2xl {
        flex: 0 0 auto !important;
        max-height: 34% !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        margin-top: 6px !important;
        margin-bottom: 0 !important;
      }

      .pos-premium-root[data-pos-mode="quick"] > .mt-5 {
        flex: 1 1 0 !important;
        min-height: 0 !important;
        height: auto !important;
        max-height: none !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        margin-top: 0 !important;
      }

      .pos-premium-root[data-pos-mode="quick"] > .mt-5 > .mb-3\\.5 {
        flex: 0 0 auto !important;
        margin-bottom: 6px !important;
      }

      .pos-premium-root[data-pos-mode="quick"] > .mt-5 > .pos-workspace-grid {
        flex: 1 1 0 !important;
        min-height: 0 !important;
        height: auto !important;
        max-height: none !important;
        overflow: hidden !important;
        margin: 0 !important;
      }

      .pos-premium-root[data-pos-mode="quick"] > .mt-5 > .mt-4.rounded-2xl {
        flex: 0 0 auto !important;
        max-height: 34% !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        margin-top: 6px !important;
      }

      .pos-premium-root[data-pos-mode="quick"] > .mt-5 > [data-pos-ux-shortcuts="1"] {
        flex: 0 0 auto !important;
        margin-top: 6px !important;
      }

      .pos-premium-root .pos-workspace-grid {
        width: 100% !important;
        min-width: 0 !important;
        position: relative !important;
        overflow: hidden !important;
        align-items: stretch !important;
        gap: 8px !important;
      }

      .pos-premium-root .pos-ux-catalog-column {
        display: flex !important;
        flex-direction: column !important;
        min-width: 0 !important;
        min-height: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        overflow: hidden !important;
      }

      .pos-premium-root .pos-ux-catalog-column > .pos-category-chips,
      .pos-premium-root .pos-ux-catalog-column > .pos-item-toolbar {
        flex: 0 0 auto !important;
        min-width: 0 !important;
        min-height: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        margin-top: 0 !important;
      }

      .pos-premium-root .pos-ux-catalog-scroll {
        flex: 1 1 0 !important;
        min-width: 0 !important;
        min-height: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain !important;
        scrollbar-width: thin;
      }

      .pos-premium-root .pos-workspace-grid > .pos-billing-drawer,
      .pos-premium-root .pos-workspace-grid > .pos-cart-drawer {
        min-width: 0 !important;
        min-height: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        height: 100% !important;
        position: relative !important;
        overflow: hidden !important;
      }

      .pos-premium-root .pos-billing-drawer > [data-sticky-drawer="true"],
      .pos-premium-root .pos-cart-drawer > [data-sticky-drawer="true"] {
        position: relative !important;
        inset: auto !important;
        width: 100% !important;
        max-width: 100% !important;
        height: 100% !important;
        max-height: none !important;
        display: flex !important;
        flex-direction: column !important;
        min-width: 0 !important;
        min-height: 0 !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }

      .pos-premium-root .pos-billing-drawer > [data-sticky-drawer="true"] > :first-child,
      .pos-premium-root .pos-cart-drawer > [data-sticky-drawer="true"] > :first-child {
        flex: 0 0 auto !important;
      }

      .pos-premium-root .pos-billing-drawer > [data-sticky-drawer="true"] > :nth-child(2),
      .pos-premium-root .pos-cart-drawer > [data-sticky-drawer="true"] > :nth-child(2) {
        flex: 1 1 0 !important;
        min-width: 0 !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain !important;
      }

      .pos-premium-root .pos-billing-drawer > [data-sticky-drawer="true"] > :last-child,
      .pos-premium-root .pos-cart-drawer > [data-sticky-drawer="true"] > :last-child {
        flex: 0 0 auto !important;
        position: relative !important;
        inset: auto !important;
        bottom: auto !important;
        min-width: 0 !important;
        max-width: 100% !important;
      }

      .pos-premium-root[data-pos-mode="standard"] [data-pos-ux-standard-header] {
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
        gap: 8px !important;
      }

      .pos-premium-root[data-pos-mode="standard"] [data-pos-ux-standard-header] > :first-child {
        flex: 1 1 auto !important;
        min-width: 0 !important;
      }

      .pos-premium-root [data-pos-ux-standard-recall="1"] {
        flex: 0 0 auto !important;
        white-space: nowrap !important;
      }
    }

    @media (max-width: 1023px) {
      .pos-premium-root {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        padding-top: 6px !important;
        padding-bottom: 6px !important;
      }

      .pos-premium-root .pos-workspace-grid,
      .pos-premium-root .pos-ux-catalog-column,
      .pos-premium-root .pos-ux-catalog-scroll,
      .pos-premium-root .pos-workspace-grid > .pos-billing-drawer,
      .pos-premium-root .pos-workspace-grid > .pos-cart-drawer,
      .pos-premium-root .pos-billing-drawer > [data-sticky-drawer="true"],
      .pos-premium-root .pos-cart-drawer > [data-sticky-drawer="true"] {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
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
    let lastMode: "standard" | "quick" | null = null;
    let restoreScrollLock: (() => void) | null = null;

    const applyNow = () => {
      const quick = syncMode(root);
      apply(root);
      if (window.innerWidth >= 1024 && !restoreScrollLock) {
        restoreScrollLock = lockScrollContainers(root);
      }
      if (window.innerWidth < 1024 && restoreScrollLock) {
        restoreScrollLock();
        restoreScrollLock = null;
      }
      lastMode = quick ? "quick" : "standard";
    };

    applyNow();

    const onResize = () => applyNow();
    window.addEventListener("resize", onResize);

    const observer = new MutationObserver(() => {
      const mode = root.querySelector(".pos-cart-drawer") ? "quick" : "standard";
      if (mode !== lastMode) applyNow();
    });
    observer.observe(root, { childList: true });

    return () => {
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      restoreScrollLock?.();
    };
  }, []);

  return null;
}
