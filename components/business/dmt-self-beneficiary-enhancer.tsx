"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

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

function removeRequestedMandatoryMarkers() {
  const targets = [
    { label: "Account Number", placeholder: "Enter account number" },
    { label: "Bank IFSC Code", placeholder: "e.g. SBIN0001234" },
    { label: "Beneficiary UPI ID (VPA)", placeholder: "e.g. username@oksbi or 9876543210@paytm" },
  ];

  for (const target of targets) {
    const label = findLabel(target.label);
    if (label) {
      label.querySelectorAll(".text-rose-500").forEach((node) => node.remove());
    }

    const input = Array.from(document.querySelectorAll("input"))
      .find((el) => el.getAttribute("placeholder") === target.placeholder && isVisible(el as HTMLElement)) as HTMLInputElement | undefined;
    if (input) input.removeAttribute("required");
  }
}

function addSelfButton(onClick: () => void) {
  const label = findLabel("Beneficiary Bank") || findLabel("Beneficiary UPI ID (VPA)");
  if (!label) return;

  const field = label.closest(".space-y-1") as HTMLElement | null;
  if (!field || field.querySelector("[data-dmt-self-beneficiary]") ) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.dmtSelfBeneficiary = "true";
  button.title = "Fill your configured shop account or UPI as the beneficiary";
  button.className = "inline-flex shrink-0 items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:text-indigo-300";
  button.textContent = "↪ Use Self";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
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

async function chooseSearchableOption(field: HTMLElement, desired: string) {
  if (!desired) return;
  const selector = Array.from(field.querySelectorAll("button"))
    .find((btn) => !btn.dataset.dmtSelfBeneficiary && isVisible(btn as HTMLElement)) as HTMLButtonElement | undefined;
  if (!selector) return;

  selector.click();
  await new Promise((resolve) => window.setTimeout(resolve, 30));

  const search = field.querySelector('input[placeholder="Search…"]') as HTMLInputElement | null;
  if (search) setNativeValue(search, desired);

  await new Promise((resolve) => window.setTimeout(resolve, 50));
  const option = Array.from(field.querySelectorAll("button"))
    .find((btn) => !btn.dataset.dmtSelfBeneficiary && btn.textContent?.trim() === desired && isVisible(btn as HTMLElement)) as HTMLButtonElement | undefined;
  option?.click();
}

export default function DmtSelfBeneficiaryEnhancer() {
  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let busy = false;

    const applyUiRepair = () => {
      if (disposed) return;
      removeRequestedMandatoryMarkers();
      addSelfButton(fillSelfBeneficiary);
    };

    const fillSelfBeneficiary = async () => {
      if (busy || disposed) return;
      busy = true;
      try {
        const upiInput = Array.from(document.querySelectorAll("input"))
          .find((el) => el.getAttribute("placeholder") === "e.g. username@oksbi or 9876543210@paytm" && isVisible(el as HTMLElement)) as HTMLInputElement | undefined;

        const accountInput = Array.from(document.querySelectorAll("input"))
          .find((el) => el.getAttribute("placeholder") === "Enter account number" && isVisible(el as HTMLElement)) as HTMLInputElement | undefined;

        if (upiInput) {
          let ownUpi = "";
          let ownName = "Self";

          const { data: instruments } = await supabase
            .from("payment_instruments")
            .select("*")
            .order("name");
          const upiInstrument = (instruments || []).find((i: any) =>
            ["upi", "upi_qr"].includes(i?.type) && (i?.upi_id || i?.vpa || i?.handle)
          );

          if (upiInstrument) {
            ownUpi = String(upiInstrument.upi_id ?? upiInstrument.vpa ?? upiInstrument.handle ?? "").trim().toLowerCase();
            ownName = String(
              upiInstrument.account_name ?? upiInstrument.holder_name ?? upiInstrument.owner_name ??
              upiInstrument.display_name ?? upiInstrument.name ?? "Self"
            ) || "Self";
          }

          if (!ownUpi) {
            const { data: qrs } = await supabase
              .from("upi_merchant_qrs")
              .select("display_name, upi_id")
              .order("display_name")
              .limit(20);
            const qr = (qrs || []).find((row: any) => row?.upi_id);
            if (qr?.upi_id) {
              ownUpi = String(qr.upi_id).trim().toLowerCase();
              ownName = String(qr.display_name || ownName);
            }
          }

          if (!ownUpi) {
            window.alert("No shop UPI VPA is configured for Self Beneficiary.");
            return;
          }

          setNativeValue(upiInput, ownUpi);
          const receiver = Array.from(document.querySelectorAll("input"))
            .find((el) => el.getAttribute("placeholder") === "e.g. Suman Mondal" && isVisible(el as HTMLElement)) as HTMLInputElement | undefined;
          if (receiver) setNativeValue(receiver, ownName);
          window.setTimeout(applyUiRepair, 0);
          return;
        }

        if (accountInput) {
          const { data: instruments } = await supabase
            .from("payment_instruments")
            .select("*")
            .order("name");
          const bank = (instruments || []).find((i: any) =>
            i?.type === "bank" && (i?.account_number || i?.account_no || i?.accountNumber)
          ) || (instruments || []).find((i: any) => i?.type === "bank");

          if (!bank) {
            window.alert("No shop bank account is configured for Self Beneficiary.");
            return;
          }

          const account = String(bank.account_number ?? bank.account_no ?? bank.accountNumber ?? "").replace(/\s+/g, "");
          const ifsc = String(bank.ifsc ?? bank.ifsc_code ?? bank.bank_ifsc ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
          const bankName = String(bank.bank_name ?? bank.bank ?? bank.institution_name ?? bank.name ?? "");
          const ownName = String(
            bank.account_name ?? bank.holder_name ?? bank.owner_name ?? "Self"
          ) || "Self";
          const ownMobile = String(bank.mobile ?? bank.phone ?? "").replace(/\D/g, "").slice(0, 10);

          setNativeValue(accountInput, account);

          const ifscInput = Array.from(document.querySelectorAll("input"))
            .find((el) => el.getAttribute("placeholder") === "e.g. SBIN0001234" && isVisible(el as HTMLElement)) as HTMLInputElement | undefined;
          if (ifscInput) setNativeValue(ifscInput, ifsc);

          const nameInput = Array.from(document.querySelectorAll("input"))
            .find((el) => el.getAttribute("placeholder") === "e.g. Suman Mondal" && isVisible(el as HTMLElement)) as HTMLInputElement | undefined;
          if (nameInput) setNativeValue(nameInput, ownName);

          const mobileInput = Array.from(document.querySelectorAll("input"))
            .find((el) => el.getAttribute("placeholder") === "10-digit mobile" && isVisible(el as HTMLElement)) as HTMLInputElement | undefined;
          if (mobileInput && ownMobile) setNativeValue(mobileInput, ownMobile);

          const bankLabel = findLabel("Beneficiary Bank");
          const field = bankLabel?.closest(".space-y-1") as HTMLElement | null;
          if (field && bankName) await chooseSearchableOption(field, bankName);

          window.setTimeout(applyUiRepair, 0);
        }
      } catch (err: any) {
        console.error("DMT self beneficiary enhancement failed:", err);
        window.alert(err?.message || "Could not fill Self Beneficiary.");
      } finally {
        busy = false;
      }
    };

    applyUiRepair();
    const observer = new MutationObserver(() => applyUiRepair());
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  return null;
}
