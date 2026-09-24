import { createCscDigiPayAdapter, type CscDigiPaySelectors } from "@/lib/ai/portal-adapters/csc-digipay";
import { createEzeePayAdapter, type EzeePaySelectors } from "@/lib/ai/portal-adapters/ezeepay";

export type PortalAdapterName = "CSC DigiPay" | "EzeePay";

export { createCscDigiPayAdapter, createEzeePayAdapter };
export type { CscDigiPaySelectors, EzeePaySelectors };

/**
 * Adapter construction is explicit. A production worker must supply the
 * selector map learned from the user's authenticated portal session; no
 * credentials, OTPs, PINs, passwords, or payment authorization data belong in
 * this registry.
 */
export function createPortalAdapter(
  providerName: PortalAdapterName,
  config: { cscDigiPay?: CscDigiPaySelectors; ezeePay?: EzeePaySelectors },
) {
  switch (providerName) {
    case "CSC DigiPay":
      if (!config.cscDigiPay) throw new Error("CSC DigiPay configuration missing");
      return createCscDigiPayAdapter(config.cscDigiPay);
    case "EzeePay":
      if (!config.ezeePay) throw new Error("EzeePay configuration missing");
      return createEzeePayAdapter(config.ezeePay);
  }
}
