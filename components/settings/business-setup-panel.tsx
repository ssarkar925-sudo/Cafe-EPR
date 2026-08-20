"use client";

import SettingsSection from "@/components/settings/settings-section";
import MasterClient from "@/components/business/master-client";
import RechargeProvidersPanel from "@/components/settings/recharge-providers-panel";
import { type MasterData } from "@/components/settings/settings-config";

const SECTIONS = [
  { key: "banks", label: "Banks" },
  { key: "portals", label: "Portals" },
  { key: "merchant-qrs", label: "Merchant QRs" },
  { key: "recharge", label: "Recharge Providers" },
] as const;

export default function BusinessSetupPanel({
  active,
  section,
  onSection,
  initialBanks,
  initialPortals,
  initialMerchantQrs,
  initialRechargeProviders,
  initialRechargeSlabs,
}: {
  active: boolean;
  section: string;
  onSection: (s: string) => void;
  initialBanks?: MasterData;
  initialPortals?: MasterData;
  initialMerchantQrs?: MasterData;
  initialRechargeProviders?: any[];
  initialRechargeSlabs?: any[];
}) {
  return (
    <div className={active ? "mt-6" : "hidden"}>
      <SettingsSection
        icon="M3 21V9l9-6 9 6v12M9 21v-6h6v6"
        tone="indigo"
        title="Business Setup"
        desc="Banks, settlement portals, merchant QR codes and recharge providers used by the business modules. Records with past transactions are archived (deactivated), never deleted."
      >
        <div className="mb-2 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => onSection(s.key)}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                section === s.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="-mx-6 -mb-6">
          {section === "banks" && (
            <MasterClient
              embedded
              title="AEPS Banks"
              desc="Banks used for AEPS cash withdrawals."
              table="aeps_banks"
              fields={[
                { key: "name", label: "Bank Name", required: true, placeholder: "State Bank of India" },
                { key: "code", label: "Code", placeholder: "SBI" },
              ]}
              rows={initialBanks?.rows ?? []}
              usage={initialBanks?.usage ?? {}}
            />
          )}
          {section === "portals" && (
            <MasterClient
              embedded
              title="AEPS Portals"
              desc="AEPS settlement portals used by the shop."
              table="aeps_portals"
              fields={[
                { key: "name", label: "Portal Name", required: true, placeholder: "PayNearby" },
                { key: "code", label: "Code", placeholder: "PN" },
                { key: "remarks", label: "Remarks", placeholder: "Settlement daily by 6 PM" },
              ]}
              rows={initialPortals?.rows ?? []}
              usage={initialPortals?.usage ?? {}}
            />
          )}
          {section === "merchant-qrs" && (
            <MasterClient
              embedded
              title="UPI Merchant QRs"
              desc="Shop UPI QR codes used for UPI cash-out transfers."
              table="upi_merchant_qrs"
              fields={[
                { key: "display_name", label: "Display Name", required: true, placeholder: "Shop Main QR" },
                { key: "upi_id", label: "UPI ID", required: true, placeholder: "shop@sbi" },
              ]}
              rows={initialMerchantQrs?.rows ?? []}
              usage={initialMerchantQrs?.usage ?? {}}
              display={(r) => r.display_name || r.name || ""}
            />
          )}
          {section === "recharge" && (
            <RechargeProvidersPanel
              initialProviders={initialRechargeProviders ?? []}
              initialSlabs={initialRechargeSlabs ?? []}
            />
          )}
        </div>
      </SettingsSection>
    </div>
  );
}