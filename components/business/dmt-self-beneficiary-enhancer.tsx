"use client";

import { useEffect } from "react";

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function isVisible(el: HTMLElement | null) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
}

function findLabel(fragment: string) {
  return Array.from(document.querySelectorAll("label"))
    .find((el) => el.textContent?.toLowerCase().includes(fragment.toLowerCase()) && isVisible(el as HTMLElement)) as HTMLLabelElement | undefined;
}

function findVisibleInput(placeholders: string[]) {
  return Array.from(document.querySelectorAll("input"))
    .find((el) => placeholders.includes(el.getAttribute("placeholder") || "") && isVisible(el as HTMLElement)) as HTMLInputElement | undefined;
}

function findCustomerValue(kind: "name" | "mobile") {
  const selectors = kind === "name"
    ? ['[data-dmt-customer-name]', '[data-customer-name]', 'input[name="customer_name"]', 'input[name="sender_name"]']
    : ['[data-dmt-customer-mobile]', '[data-customer-mobile]', 'input[name="customer_mobile"]', 'input[name="sender_mobile"]'];

  for (const selector of selectors) {
    const el = document.querySelector(selector) as HTMLInputElement | HTMLElement | null;
    if (!el || !isVisible(el)) continue;
    const value = el instanceof HTMLInputElement ? el.value : el.textContent?.trim();
    if (value) return value.trim();
  }
  return "";
}

function addSelfButton(onClick: () => void) {
  const labels = ["Beneficiary Bank", "Beneficiary UPI ID (VPA)"];
  const label = labels.map(findLabel).find(Boolean);
  if (!label) return;

  const field = label.closest(".space-y-1") as HTMLElement | null;
  if (!field || field.querySelector("[data-dmt-self-beneficiary]")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.dmtSelfBeneficiary = "true";
  button.title = "Use the selected DMT customer as the beneficiary";
  button.className = "inline-flex shrink-0 items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:text-indigo-300";
  button.textContent = "↪ Use Self";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void onClick();
  });

  const existingHeader = label.parentElement;
  if (existingHeader && existingHeader.classList.contains("flex") && existingHeader.classList.contains("items-center")) {
    existingHeader.appendChild(button);
    return;
  }

  const header = document.createElement("div");
  header.dataset.dmtSelfHeader = "true";
  header.className = "flex items-center justify-between gap-2";
  label.replaceWith(header);
  header.appendChild(label);
  header.appendChild(button);
  field.insertBefore(header, field.firstChild);
}

function clearAddedRequired() {
  const targets = ["Enter account number", "e.g. SBIN0001234", "e.g. username@oksbi or 9876543210@paytm"];
  for (const placeholder of targets) {
    const input = findVisibleInput([placeholder]);
    if (input?.dataset.dmtSelfOptional === "true") {
      input.removeAttribute("required");
      delete input.dataset.dmtSelfOptional;
    }
  }
}

async function fillSelfBeneficiary() {
  const customerName = findCustomerValue("name");
  const customerMobile = findCustomerValue("mobile");

  const receiver = findVisibleInput(["e.g. Suman Mondal"]);
  if (receiver && customerName) setNativeValue(receiver, customerName);

  const mobile = findVisibleInput(["10-digit mobile"]);
  if (mobile && customerMobile) setNativeValue(mobile, customerMobile.replace(/\D/g, "").slice(-10));

  // Self changes only the beneficiary identity. It must never add validation requirements.
  // Never read payment_instruments or shop merchant QR details here.
  const upiInput = findVisibleInput(["e.g. username@oksbi or 9876543210@paytm"]);
  if (upiInput) {
    const customerUpi = (upiInput.dataset.customerUpi || "").trim().toLowerCase();
    if (customerUpi) setNativeValue(upiInput, customerUpi);
    clearAddedRequired();
    if (!customerUpi) upiInput.focus();
    return;
  }

  const accountInput = findVisibleInput(["Enter account number"]);
  if (accountInput) {
    const customerAccount = (accountInput.dataset.customerAccount || "").replace(/\s+/g, "");
    const ifscInput = findVisibleInput(["e.g. SBIN0001234"]);
    const customerIfsc = (ifscInput?.dataset.customerIfsc || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);

    if (customerAccount) setNativeValue(accountInput, customerAccount);
    if (ifscInput && customerIfsc) setNativeValue(ifscInput, customerIfsc);

    clearAddedRequired();
    if (!customerAccount) accountInput.focus();
    else if (ifscInput && !customerIfsc) ifscInput.focus();
  }
}

export default function DmtSelfBeneficiaryEnhancer() {
  useEffect(() => {
    let disposed = false;

    const applyUiRepair = () => {
      if (disposed) return;
      clearAddedRequired();
      addSelfButton(fillSelfBeneficiary);
    };

    applyUiRepair();
    const observer = new MutationObserver(applyUiRepair);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  return null;
}
