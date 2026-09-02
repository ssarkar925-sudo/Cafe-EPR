import { createCscDigiPayAdapter, type CscDigiPaySelectors } from "@/lib/ai/portal-adapters/csc-digipay";

export type PortalAdapterName = "CSC DigiPay";

/**
 * Adapter construction is explicit. A production worker must supply the
 * selector map learned from the user's authenticated portal session; no
 * credentials, OTPs, PINs, passwords, or payment authorization data belong in
 * this registry.
 */
export function createPortalAdapter(
  providerName: PortalAdapterName,
  config: { cscDigiPay: CscDigiPaySelectors },
) {
  switch (providerName) {
    case "CSC DigiPay":
      return createCscDigiPayAdapter(config.cscDigiPay);
  }
}
