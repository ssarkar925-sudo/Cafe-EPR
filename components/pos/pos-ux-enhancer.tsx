"use client";

import { useEffect } from "react";

const STYLE_ID = "pos-ux-enhancer-style";

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
  const quick = Boolean(root.querySelector(".pos-cart-drawer"));
  root.dataset.posMode = quick ? "quick" : "standard";
  return quick;
}

function syncWorkspace(root: HTMLElement) {
  if (window.innerWidth < 1024) return;
  root.querySelectorAll<HTMLElement>(".pos-workspace-grid").forEach((workspace) => {
    const rect = workspace.getBoundingClientRect();
    workspace.style.setProperty(
      "--pos-workspace-height",
      `${Math.max(360, Math.floor(window.innerHeight - rect.top - 8))}px`
    );
  });
}

function setupCatalogScroll(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".pos-workspace-grid").forEach((workspace) => {
    const catalog = Array.from(workspace.children).find((el): el is HTMLElement => {
      return (
        el instanceof HTMLElement &&
        !el.classList.contains("pos-billing-drawer") &&
        !el.classList.contains("pos-cart-drawer")
      );
    });
    if (!catalog) return;

    catalog.classList.add("pos-ux-catalog-column");
    Array.from(catalog.children).forEach((child) => child.classList.remove("pos-ux-catalog-scroll"));
    const target = Array.from(catalog.children).find((child) => {
      return (
        child instanceof HTMLElement &&
        !child.classList.contains("pos-category-chips") &&
        !child.classList.contains("pos-item-toolbar")
      );
    });
    target?.classList.add("pos-ux-catalog-scroll");
  });
}

function forceList(root: HTMLElement) {
  const key = root.dataset.posMode === "quick" ? "sccomm-qs-view" : "sccomm-pos-view";
  root.querySelectorAll<HTMLElement>(".pos-item-toolbar").forEach((toolbar) => {
    try {
      window.localStorage.setItem(key, "list");
    } catch {}
    const list = toolbar.querySelector<HTMLButtonElement>('button[title="List view"]');
    if (list && !list.disabled) {
      const selected = list.getAttribute("aria-pressed") === "true" || list.className.includes("bg-white");
      if (!selected) list.click();
    }
  });
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
    if (label === "Customers" && !insideBilling) button.style.display = "none";
    if (label === "Hold Bill" && !insideBilling) button.style.display = "none";
    if (label === "All Items" && insideToolbar) button.style.display = "none";

    if (insideBilling && label === "Save Draft") {
      button.textContent = "Hold / Draft";
      button.setAttribute("aria-label", "Hold or save draft");
    }

    if (insideBilling && (label === "₹ Settle Only" || label === "Settle Only")) {
      button.style.display = "none";
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
  setupCatalogScroll(root);
  forceList(root);
  syncWorkspace(root);
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .pos-premium-root {
      min-height: 0 !important;
      padding-top: 8px !important;
      padding-bottom: 8px !important;
    }

    /* Tighten the space between the shared POS header/status bar and the workspace. */
    .pos-premium-root > .mb-3\\.5 {
      margin-bottom: 8px !important;
    }

    /* Quick Sale has its own wrapper margin; it does not need another 20px top gap. */
    .pos-premium-root[data-pos-mode="quick"] > .mt-5 {
      margin-top: 0 !important;
    }

    .pos-premium-root[data-pos-mode="quick"] > .mt-5 > .mb-3\\.5 {
      margin-bottom: 8px !important;
    }

    .pos-premium-root .pos-workspace-grid {
      height: var(--pos-workspace-height, auto) !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: hidden !important;
      align-items: stretch !important;
      gap: 8px !important;
      margin-top: 0 !important;
    }

    .pos-premium-root .pos-ux-catalog-column {
      display: flex !important;
      flex-direction: column !important;
      min-width: 0 !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }

    .pos-premium-root .pos-ux-catalog-column > .pos-category-chips,
    .pos-premium-root .pos-ux-catalog-column > .pos-item-toolbar {
      flex: 0 0 auto !important;
      min-height: 0 !important;
      position: relative !important;
      margin-top: 0 !important;
    }

    .pos-premium-root .pos-ux-catalog-scroll {
      flex: 1 1 0 !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      overflow-x: auto !important;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }

    .pos-premium-root .pos-workspace-grid > .pos-billing-drawer,
    .pos-premium-root .pos-workspace-grid > .pos-cart-drawer {
      min-width: 0 !important;
      min-height: 0 !important;
      height: 100% !important;
      position: relative !important;
      overflow: hidden !important;
    }

    .pos-premium-root .pos-billing-drawer > [data-sticky-drawer="true"],
    .pos-premium-root .pos-cart-drawer > [data-sticky-drawer="true"] {
      position: relative !important;
      inset: auto !important;
      width: 100% !important;
      height: 100% !important;
      max-height: none !important;
      display: flex !important;
      flex-direction: column !important;
      min-height: 0 !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }

    .pos-premium-root .pos-billing-drawer > [data-sticky-drawer="true"] > :first-child,
    .pos-premium-root .pos-cart-drawer > [data-sticky-drawer="true"] > :first-child {
      flex: 0 0 auto !important;
    }

    /* Make the native Standard POS header behave like Quick Sale: left title + compact actions on the right. */
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

    .pos-premium-root .pos-billing-drawer > [data-sticky-drawer="true"] > :nth-child(2),
    .pos-premium-root .pos-cart-drawer > [data-sticky-drawer="true"] > :nth-child(2) {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
    }

    .pos-premium-root .pos-billing-drawer > [data-sticky-drawer="true"] > :last-child,
    .pos-premium-root .pos-cart-drawer > [data-sticky-drawer="true"] > :last-child {
      flex: 0 0 auto !important;
      position: relative !important;
      bottom: auto !important;
    }

    /* Trim the extra vertical padding at the top/bottom of both workspaces. */
    .pos-premium-root[data-pos-mode="quick"] .pos-cart-drawer > [data-sticky-drawer="true"] > :first-child,
    .pos-premium-root[data-pos-mode="standard"] .pos-billing-drawer > [data-sticky-drawer="true"] > :first-child {
      padding-top: 8px !important;
      padding-bottom: 8px !important;
    }

    @media (min-width: 1280px) {
      .pos-premium-root .pos-workspace-grid {
        grid-template-columns: minmax(0,1fr) 380px !important;
      }
    }
    @media (max-width: 1279px) and (min-width: 1024px) {
      .pos-premium-root .pos-workspace-grid {
        grid-template-columns: minmax(0,1fr) 350px !important;
      }
    }
    @media (max-width: 1023px) {
      .pos-premium-root {
        height: auto !important;
        min-height: 0 !important;
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
      .pos-premium-root .pos-ux-catalog-scroll { flex: none !important; }
      .pos-premium-root .pos-billing-drawer > [data-sticky-drawer="true"] > :nth-child(2),
      .pos-premium-root .pos-cart-drawer > [data-sticky-drawer="true"] > :nth-child(2) { overflow: visible !important; }
    }
  `;
  document.head.appendChild(style);
}

export default function PosUxEnhancer() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".pos-premium-root");
    if (!root) return;
    ensureStyles();
    apply(root);

    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (root.isConnected) apply(root);
      });
    };
    window.addEventListener("resize", schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, []);

  return null;
}
