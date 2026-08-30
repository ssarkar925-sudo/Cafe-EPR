"use client";

import SettingsSection from "@/components/settings/settings-section";
import MasterClient from "@/components/business/master-client";
import RechargeProvidersPanel from "@/components/settings/recharge-providers-panel";
import BillCommissionPanel from "@/components/settings/bill-commission-panel";
import { type MasterData } from "@/components/settings/settings-config";

const SECTIONS = [
  { key: "banks", label: "Banks", hint: "AEPS" },
  { key: "portals", label: "Portals", hint: "Settlement" },
  { key: "merchant-qrs", label: "Merchant QRs", hint: "UPI" },
  { key: "recharge", label: "Recharge", hint: "Providers & Slabs" },
  { key: "bill-payment", label: "Bill Payment", hint: "Commission & Margin" },
] as const;

export default function BusinessSetupPanel({ active, section, onSection, initialBanks, initialPortals, initialMerchantQrs, initialRechargeProviders, initialRechargeSlabs }: {
  active: boolean;
  section: string;
  onSection: (s: string) => void;
  initialBanks?: MasterData;
  initialPortals?: MasterData;
  initialMerchantQrs?: MasterData;
  initialRechargeProviders?: any[];
  initialRechargeSlabs?: any[];
}) {
  const isRechargeActive = section === "recharge" || section === "recharge-slabs" || section === "recharge-providers";
  const isBillPaymentActive = section === "bill-payment" || section === "bill-commission";

  return (
    <div className={active ? "mt-6" : "hidden"}>
      <SettingsSection icon="M3 21V9l9-6 9 6v12M9 21v-6h6v6" tone="indigo" title="Business Setup" desc="Configure the providers, commission slabs, and settlement masters used by AEPS, UPI cash-out, bill payment, and recharge operations. Existing transaction references are protected from destructive deletion.">
        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-1.5 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
            {SECTIONS.map((s) => {
              const selected = s.key === "recharge" ? isRechargeActive : s.key === "bill-payment" ? isBillPaymentActive : section === s.key;
              return (
                <button key={s.key} onClick={() => onSection(s.key)} className={`relative rounded-xl px-3 py-2.5 text-left transition ${selected ? "bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10" : "text-slate-500 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-white/5"}`}>
                  <span className={`block text-sm font-bold ${selected ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"}`}>{s.label}</span>
                  <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-400">{s.hint}</span>
                  {selected && <span className="absolute bottom-1.5 left-3 right-3 h-0.5 rounded-full bg-indigo-500" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="-mx-6 -mb-6">
          {section === "banks" && <MasterClient embedded title="AEPS Banks" desc="Banks used for AEPS cash withdrawals." table="aeps_banks" fields={[{ key: "name", label: "Bank Name", required: true, placeholder: "State Bank of India" }, { key: "code", label: "Code", placeholder: "SBI" }]} rows={initialBanks?.rows ?? []} usage={initialBanks?.usage ?? {}} />}
          {section === "portals" && <MasterClient embedded title="AEPS Portals" desc="AEPS settlement portals used by the shop." table="aeps_portals" fields={[{ key: "name", label: "Portal Name", required: true, placeholder: "PayNearby" }, { key: "code", label: "Code", placeholder: "PN" }, { key: "remarks", label: "Remarks", placeholder: "Settlement daily by 6 PM" }]} rows={initialPortals?.rows ?? []} usage={initialPortals?.usage ?? {}} />}
          {section === "merchant-qrs" && <MasterClient embedded title="UPI Merchant QRs" desc="Shop UPI QR codes used for UPI cash-out transfers." table="upi_merchant_qrs" fields={[{ key: "display_name", label: "Display Name", required: true, placeholder: "Shop Main QR" }, { key: "upi_id", label: "UPI ID", required: true, placeholder: "shop@sbi" }]} rows={initialMerchantQrs?.rows ?? []} usage={initialMerchantQrs?.usage ?? {}} display={(r) => r.display_name || r.name || ""} />}
          {isRechargeActive && <RechargeProvidersPanel initialProviders={initialRechargeProviders ?? []} initialSlabs={initialRechargeSlabs ?? []} />}
          {isBillPaymentActive && (
            <div className="p-6">
              <BillCommissionPanel />
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
