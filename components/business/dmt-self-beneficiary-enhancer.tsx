"use client";

import { useEffect } from "react";

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function isVisible(el: HTMLElement | null) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
}

function findLabel(fragment: string): HTMLLabelElement | undefined {
  return Array.from(document.querySelectorAll("label")).find((el) => {
    return el.textContent?.toLowerCase().includes(fragment.toLowerCase()) && isVisible(el as HTMLElement);
  }) as HTMLLabelElement | undefined;
}

function findInputByPlaceholder(placeholder: string): HTMLInputElement | undefined {
  return Array.from(document.querySelectorAll("input")).find((el) => {
    return el.getAttribute("placeholder") === placeholder && isVisible(el as HTMLElement);
  }) as HTMLInputElement | undefined;
}

function findFieldInput(labelFragment: string): HTMLInputElement | undefined {
  const label = findLabel(labelFragment);
  if (!label) return undefined;
  const field = label.closest(".space-y-1") as HTMLElement | null;
  return field?.querySelector("input") as HTMLInputElement | undefined;
}

function findSenderInput(labelFragment: string): HTMLInputElement | undefined {
  return findFieldInput(labelFragment);
}

function removeRequiredAndStar(labelFragment: string, placeholder?: string) {
  const label = findLabel(labelFragment);
  if (label) {
    for (const child of Array.from(label.children)) {
      if (child.textContent?.trim() === "*") child.remove();
    }
    for (const node of Array.from(label.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent) {
        node.textContent = node.textContent.replace(/\s*\*\s*$/, "");
      }
    }
    const field = label.closest(".space-y-1") as HTMLElement | null;
    field?.querySelectorAll("input, select, textarea").forEach((el) => {
      el.removeAttribute("required");
      el.setAttribute("aria-required", "false");
    });
  }

  if (placeholder) {
    const input = findInputByPlaceholder(placeholder);
    input?.removeAttribute("required");
    input?.setAttribute("aria-required", "false");
  }
}

function makeOptionalDmtBeneficiaryDetails() {
  removeRequiredAndStar("Account Number", "Enter account number");
  removeRequiredAndStar("Bank IFSC Code", "e.g. SBIN0001234");
  removeRequiredAndStar("Beneficiary UPI ID (VPA)", "e.g. username@oksbi or 9876543210@paytm");
}

function findCustomerValue(labelFragment: string, placeholderFallback?: string): string {
  const input = findSenderInput(labelFragment) ?? (placeholderFallback ? findInputByPlaceholder(placeholderFallback) : undefined);
  return input?.value?.trim() || "";
}

function fillSelfBeneficiary() {
  const customerName = findCustomerValue("Sender Name");
  const customerMobile = findCustomerValue("Sender Mobile");

  const beneficiaryName = findFieldInput("Beneficiary Name") ?? findInputByPlaceholder("e.g. Suman Mondal");
  const beneficiaryMobile = findFieldInput("Beneficiary Mobile") ?? findInputByPlaceholder("10-digit mobile");

  if (beneficiaryName && customerName) setNativeValue(beneficiaryName, customerName);
  if (beneficiaryMobile && customerMobile) {
    setNativeValue(beneficiaryMobile, customerMobile.replace(/\D/g, "").slice(-10));
  }

  // Self means only customer identity (name/mobile). Never copy shop funding
  // accounts, bank credentials, IFSC, or UPI details.
  makeOptionalDmtBeneficiaryDetails();
}

function addSelfButton() {
  const label = findLabel("Beneficiary Bank") ?? findLabel("Beneficiary UPI ID (VPA)");
  if (!label) return;
  const field = label.closest(".space-y-1") as HTMLElement | null;
  if (!field || field.querySelector("[data-dmt-self-beneficiary]")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.dmtSelfBeneficiary = "true";
  button.title = "Copy the selected customer name and mobile into the beneficiary fields";
  button.className = "inline-flex shrink-0 items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:text-indigo-300";
  button.textContent = "↪ Use Self";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    fillSelfBeneficiary();
  });

  const existingHeader = label.parentElement;
  if (existingHeader?.classList.contains("flex") && existingHeader.classList.contains("items-center")) {
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

export default function DmtSelfBeneficiaryEnhancer() {
  useEffect(() => {
    let disposed = false;

    const apply = () => {
      if (disposed) return;
      makeOptionalDmtBeneficiaryDetails();
      addSelfButton();
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  return null;
}
