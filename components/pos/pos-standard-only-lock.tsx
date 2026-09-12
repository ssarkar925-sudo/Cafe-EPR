"use client";

import { useEffect } from "react";

/**
 * The POS is a single modern billing workspace.
 * Legacy Standard/Quick mode controls are retained in the shared client for
 * compatibility, but are removed from the live UI and blocked from activation.
 */
export default function PosStandardOnlyLock() {
  useEffect(() => {
    const normalizeText = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

    const retireLegacyUi = () => {
      const root = document.querySelector(".pos-modern-only");
      if (!root) return;

      const buttons = Array.from(root.querySelectorAll("button"));
      const quickButton = buttons.find((b) => normalizeText(b.textContent).includes("quick fast-sale"));
      const standardButton = buttons.find((b) => normalizeText(b.textContent).includes("standard cart pos"));

      // Never allow a previously rendered Quick Sale state to remain active.
      if (root.querySelector(".pos-cart-drawer") && standardButton) {
        standardButton.click();
      }

      // Remove the legacy mode switcher from the live interface entirely.
      if (standardButton?.parentElement) {
        standardButton.parentElement.style.setProperty("display", "none", "important");
      } else if (quickButton?.parentElement) {
        quickButton.parentElement.style.setProperty("display", "none", "important");
      }

      // Hide the retired F2 FAST badge beside POS Billing in the sidebar.
      const posLinks = Array.from(document.querySelectorAll('a[href="/pos"]'));
      for (const link of posLinks) {
        for (const node of Array.from(link.querySelectorAll("span"))) {
          if (normalizeText(node.textContent) === "f2 fast") {
            node.style.setProperty("display", "none", "important");
          }
        }
      }
    };

    const blockLegacyMode = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (target && normalizeText(target.textContent).includes("quick fast-sale")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener("keydown", blockLegacyMode, true);
    document.addEventListener("click", retireLegacyUi, true);
    retireLegacyUi();

    const observer = new MutationObserver(() => retireLegacyUi());
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    return () => {
      window.removeEventListener("keydown", blockLegacyMode, true);
      document.removeEventListener("click", retireLegacyUi, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
