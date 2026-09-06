"use client";

import SettingsClient from "@/components/settings/settings-client";

type SettingsProps = Parameters<typeof SettingsClient>[0];
type PublicSettingsProps = Pick<SettingsProps, "initial" | "initialServices" | "initialPaymentMethods" | "initialTab" | "initialSection">;

const EMPTY_INSTRUMENTS: any[] = [];
const EMPTY_MASTER: any = { rows: [], usage: {} };
const EMPTY_ARRAY: any[] = [];
const EMPTY_OBJECT: Record<string, number> = {};

// Keep the canonical SettingsClient implementation private to this entry point.
// Operational master data is owned by its dedicated modules and is no longer
// fetched or threaded through the Settings route.
export default function SystemSettingsClient(props: PublicSettingsProps) {
  return (
    <SettingsClient
      {...props}
      initialInstruments={EMPTY_INSTRUMENTS}
      initialBanks={EMPTY_MASTER}
      initialPortals={EMPTY_MASTER}
      initialMerchantQrs={EMPTY_MASTER}
      initialRechargeProviders={EMPTY_ARRAY}
      initialRechargeSlabs={EMPTY_ARRAY}
      initialProducts={EMPTY_ARRAY}
      initialCatalogServices={EMPTY_ARRAY}
      initialCategories={EMPTY_ARRAY}
      categoryCounts={EMPTY_OBJECT}
    />
  );
}
