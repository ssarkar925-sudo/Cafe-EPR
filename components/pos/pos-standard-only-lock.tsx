"use client";

import { useEffect } from "react";

/**
 * POS presentation guard.
 *
 * The live POS is intentionally a single billing workspace. This component
 * also owns a small scoped visual layer for the payment area so the cashier
 * sees exactly four choices: Cash, UPI, Khata and Split.
 */
export default function PosStandardOnlyLock() {
  useEffect(() => {
    const STYLE_ID = "pos-invoice-cashier-ux-v2";
    const normalizeText = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

    const styleText = `
      /* --- Current Invoice / Cashier panel --- */
      .pos-modern-only .pos-billing-drawer {
        width: 100% !important;
        min-width: 0 !important;
        border-radius: 16px !important;
        border: 1px solid var(--pos-modern-line, #e4e8ed) !important;
        background: var(--pos-modern-surface, #fff) !important;
        box-shadow: 0 10px 28px rgba(15, 23, 42, .07) !important;
        overflow: hidden !important;
      }

      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] {
        border-radius: 16px !important;
        overflow: hidden !important;
      }

      /* Invoice title strip */
      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] > div:first-child {
        min-height: 58px !important;
        padding: 10px 14px !important;
        border-bottom: 1px solid var(--pos-modern-line, #e4e8ed) !important;
        background: linear-gradient(180deg, var(--pos-modern-surface, #fff), var(--pos-modern-soft, #f7f8fa)) !important;
      }

      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] > div:first-child h2 {
        font-size: 13px !important;
        line-height: 1.2 !important;
        letter-spacing: -.01em !important;
      }

      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] > div:first-child p {
        margin-top: 2px !important;
        font-size: 10px !important;
        color: var(--pos-modern-muted, #667085) !important;
      }

      /* Main invoice body */
      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] > div:nth-child(2) {
        padding: 10px 12px !important;
        background: var(--pos-modern-surface, #fff) !important;
      }

      /* Customer block: single strong field rather than nested boxes */
      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] > div:nth-child(2) input,
      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] > div:nth-child(2) select {
        min-height: 36px !important;
        border-radius: 9px !important;
        border: 1px solid var(--pos-modern-line, #e4e8ed) !important;
        background: var(--pos-modern-soft, #f7f8fa) !important;
        box-shadow: none !important;
        font-size: 11px !important;
      }

      /* Receipt-like cart rows */
      .pos-modern-only .pos-billing-drawer [data-cart-item-key] {
        padding: 7px 2px !important;
        margin: 0 !important;
        border: 0 !important;
        border-bottom: 1px solid color-mix(in srgb, var(--pos-modern-line, #e4e8ed) 74%, transparent) !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }

      .pos-modern-only .pos-billing-drawer [data-cart-item-key] > div:first-child {
        min-width: 0 !important;
      }

      .pos-modern-only .pos-billing-drawer [data-cart-item-key] input[type="number"] {
        min-height: 28px !important;
        background: transparent !important;
        border: 0 !important;
        padding: 0 2px !important;
        font-size: 11px !important;
      }

      .pos-modern-only .pos-billing-drawer [data-cart-item-key] button {
        min-width: 28px !important;
        min-height: 28px !important;
        padding: 0 !important;
        border-radius: 8px !important;
      }

      /* Payment area: four-card control */
      .pos-modern-only .pos-billing-drawer div.grid-cols-3:has(> button:nth-child(8)) {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 7px !important;
        margin-top: 6px !important;
      }

      .pos-modern-only .pos-billing-drawer div.grid-cols-3:has(> button:nth-child(8)) > button {
        order: 20 !important;
        min-height: 52px !important;
        padding: 8px 8px !important;
        border-radius: 11px !important;
        border: 1px solid var(--pos-modern-line, #e4e8ed) !important;
        background: var(--pos-modern-soft, #f7f8fa) !important;
        color: var(--pos-modern-ink, #18212f) !important;
        box-shadow: none !important;
        font-size: 11px !important;
        font-weight: 900 !important;
        letter-spacing: -.01em !important;
        transition: transform .12s ease, border-color .12s ease, background .12s ease !important;
      }

      .pos-modern-only .pos-billing-drawer div.grid-cols-3:has(> button:nth-child(8)) > button:hover {
        transform: translateY(-1px) !important;
        border-color: color-mix(in srgb, var(--pos-modern-primary, #2563eb) 38%, var(--pos-modern-line, #e4e8ed)) !important;
      }

      .pos-modern-only .pos-billing-drawer div.grid-cols-3:has(> button:nth-child(8)) > button:nth-child(1) {
        order: 1 !important;
        color: #087f52 !important;
        border-color: #b8ead5 !important;
        background: #f0fbf6 !important;
      }

      .pos-modern-only .pos-billing-drawer div.grid-cols-3:has(> button:nth-child(8)) > button:nth-child(2) {
        order: 2 !important;
        color: #05758a !important;
        border-color: #b9e7ee !important;
        background: #f0fbfd !important;
      }

      .pos-modern-only .pos-billing-drawer div.grid-cols-3:has(> button:nth-child(8)) > button:nth-child(8) {
        order: 3 !important;
        color: #45515f !important;
        border-color: #d6dce3 !important;
        background: #f5f7f9 !important;
      }

      .pos-modern-only .pos-billing-drawer div.grid-cols-3:has(> button:nth-child(8)) > button[data-pos-split-card],
      .pos-modern-only .pos-billing-drawer div.grid-cols-3:has(> button:nth-child(8)) > button:nth-child(3) {
        order: 4 !important;
        color: #4a35b6 !important;
        border-color: #d7cffd !important;
        background: #f5f2ff !important;
      }

      /* Never display the old payment methods: Bank / Wallet / Debit / Credit */
      .pos-modern-only .pos-billing-drawer div.grid-cols-3:has(> button:nth-child(8)) > button:nth-child(4),
      .pos-modern-only .pos-billing-drawer div.grid-cols-3:has(> button:nth-child(8)) > button:nth-child(5),
      .pos-modern-only .pos-billing-drawer div.grid-cols-3:has(> button:nth-child(8)) > button:nth-child(6),
      .pos-modern-only .pos-billing-drawer div.grid-cols-3:has(> button:nth-child(8)) > button:nth-child(7) {
        display: none !important;
      }

      /* Old split widget becomes a hidden state engine; show only its split editor. */
      .pos-modern-only .pos-standard-split-payment {
        margin: 2px 0 4px !important;
        padding: 0 !important;
        border: 0 !important;
        background: transparent !important;
        border-radius: 0 !important;
      }

      .pos-modern-only .pos-standard-split-payment > div:first-child,
      .pos-modern-only .pos-standard-split-payment > div:nth-child(2),
      .pos-modern-only .pos-standard-split-payment > div:nth-child(3) {
        display: none !important;
      }

      .pos-modern-only .pos-standard-split-payment > div:nth-child(4) {
        display: none !important;
        margin-top: 8px !important;
        padding: 9px !important;
        border: 1px solid #d7cffd !important;
        border-radius: 11px !important;
        background: #f8f6ff !important;
      }

      .pos-modern-only .pos-standard-split-payment:has(> div:nth-child(4)) > div:nth-child(4) {
        display: block !important;
      }

      .pos-modern-only .pos-standard-split-payment > div:nth-child(4) select,
      .pos-modern-only .pos-standard-split-payment > div:nth-child(4) input {
        min-height: 32px !important;
        border-radius: 8px !important;
        border-color: #ddd8fb !important;
        background: #fff !important;
        font-size: 10px !important;
      }

      /* Discount + total controls */
      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] > div:nth-child(2) .border-t {
        border-top-color: var(--pos-modern-line, #e4e8ed) !important;
      }

      /* Billing footer: always reads as the final checkout zone */
      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] > div:nth-child(3) {
        padding: 10px 12px 12px !important;
        border-top: 1px solid var(--pos-modern-line, #e4e8ed) !important;
        background: var(--pos-modern-soft, #f7f8fa) !important;
      }

      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] > div:nth-child(3) .text-base {
        font-size: 12px !important;
      }

      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] > div:nth-child(3) [class*="text-blue-600"] {
        font-size: 21px !important;
        line-height: 1 !important;
        letter-spacing: -.02em !important;
      }

      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] > div:nth-child(3) .btn-3d-tactile-primary {
        min-height: 49px !important;
        margin-top: 8px !important;
        border-radius: 11px !important;
        font-size: 11px !important;
      }

      /* Reduce duplicate visual containers in footer */
      .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] > div:nth-child(3) .grid-cols-2 button {
        min-height: 34px !important;
        font-size: 10px !important;
      }

      /* Split card uses the existing Card action internally, but never presents
         the word Card to the cashier. */
      .pos-modern-only [data-pos-split-card] {
        color: #4a35b6 !important;
        border-color: #d7cffd !important;
        background: #f5f2ff !important;
      }

      @media (min-width: 1280px) {
        .pos-modern-only .pos-billing-drawer > [data-sticky-drawer="true"] {
          max-height: calc(100vh - 5.25rem) !important;
        }
      }
    `;

    const installStyles = () => {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = styleText;
      document.head.appendChild(style);
    };

    const markPaymentCards = () => {
      const root = document.querySelector(".pos-modern-only");
      if (!root) return;

      const grids = Array.from(root.querySelectorAll("div.grid-cols-3"));
      const grid = grids.find((el) => el.querySelectorAll(":scope > button").length >= 8);
      if (grid) {
        const buttons = Array.from(grid.querySelectorAll(":scope > button"));
        const splitButton = buttons[2] as HTMLButtonElement | undefined;
        if (splitButton && !splitButton.dataset.posSplitCard) {
          splitButton.dataset.posSplitCard = "true";
          splitButton.setAttribute("aria-label", "Split payment");
          splitButton.setAttribute("title", "Split payment");
          splitButton.textContent = "Split";
        }
      }

      const posLinks = Array.from(document.querySelectorAll('a[href="/pos"]'));
      for (const link of posLinks) {
        for (const node of Array.from(link.querySelectorAll("span"))) {
          if (normalizeText(node.textContent) === "f2 fast") {
            node.style.setProperty("display", "none", "important");
          }
        }
      }
    };

    const blockLegacyAndSplit = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target.closest("button") : null;
      if (!element) return;

      if (element.dataset.posSplitCard === "true") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const splitTrigger = document.querySelector<HTMLButtonElement>(
          ".pos-modern-only .pos-standard-split-payment > div:first-child button"
        );
        splitTrigger?.click();
      }
    };

    const blockLegacyMode = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    installStyles();
    markPaymentCards();
    document.addEventListener("click", blockLegacyAndSplit, true);
    window.addEventListener("keydown", blockLegacyMode, true);

    const observer = new MutationObserver(() => {
      installStyles();
      markPaymentCards();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    return () => {
      document.removeEventListener("click", blockLegacyAndSplit, true);
      window.removeEventListener("keydown", blockLegacyMode, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
