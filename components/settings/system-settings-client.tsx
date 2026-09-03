"use client";

import SettingsClient from "@/components/settings/settings-client";

type SettingsProps = Parameters<typeof SettingsClient>[0];
type PublicSettingsProps = Pick<SettingsProps, "initial" | "initialServices" | "initialPaymentMethods" | "initialTab" | "initialSection">;

// Keep the canonical SettingsClient implementation private to this entry point.
// Operational master data is owned by its dedicated modules and is no longer
// fetched or threaded through the Settings route.
export default function SystemSettingsClient(props: PublicSettingsProps) {
  return (
    <SettingsClient
      {...props}
      initialInstruments={[]}
      initialBanks={{ rows: [], usage: {} }}
      initialPortals={{ rows: [], usage: {} }}
      initialMerchantQrs={{ rows: [], usage: {} }}
      initialRechargeProviders={[]}
      initialRechargeSlabs={[]}
      initialProducts={[]}
      initialCatalogServices={[]}
      initialCategories={[]}
      categoryCounts={{}}
    />
  );
}
