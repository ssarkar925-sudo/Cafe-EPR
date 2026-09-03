"use client";

import Link from "next/link";
import SettingsSection from "@/components/settings/settings-section";
import { type InstrumentRow } from "@/components/settings/settings-config";

export type AccountReconDetail = {
  id: string;
  accountName: string;
  accountType: string;
  poolKey: string;
  currentBalance: number;
  openingBalance: number;
  credits: number;
  debits: number;
  fees: number;
  settlements: number;
  otherMovements: number;
  calculatedBalance: number;
  canonicalBalance: number;
  variance: number;
  isReconciled: boolean;
  statusLabel: string;
  statusVariant: "reconciled" | "variance" | "linked" | "credit_limit";
  isDebitCard?: boolean;
  isCreditCard?: boolean;
  parentBankName?: string;
  parentBankBalance?: number;
  creditLimit?: number;
  usedLimit?: number;
  contributingTxns: { id: string; number: string; type: string; amount: number; date: string; desc: string }[];
  lastRefreshedAt: string;
};

export default function PaymentAccountsPanel({ active }: { initialInstruments: InstrumentRow[]; active: boolean }) {
  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      <SettingsSection
        icon="M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"
        tone="cyan"
        title="Payment Accounts"
        desc="Account creation, balances, deactivation and reconciliation now live in the Finance module so there is one authoritative source for payment instruments."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link href="/finance/accounts" className="group rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 transition hover:-translate-y-0.5 hover:shadow-md dark:border-cyan-500/20 dark:bg-cyan-950/25">
            <div className="text-sm font-extrabold text-slate-900 dark:text-white">Manage Payment Accounts</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cash, bank, UPI, wallet and card instruments.</p>
            <span className="mt-3 inline-flex text-xs font-bold text-cyan-700 dark:text-cyan-300">Open Finance Accounts →</span>
          </Link>
          <Link href="/finance/reconciliation" className="group rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 transition hover:-translate-y-0.5 hover:shadow-md dark:border-emerald-500/20 dark:bg-emerald-950/25">
            <div className="text-sm font-extrabold text-slate-900 dark:text-white">Reconcile Balances</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Audit instrument balances and investigate variance.</p>
            <span className="mt-3 inline-flex text-xs font-bold text-emerald-700 dark:text-emerald-300">Open Reconciliation →</span>
          </Link>
        </div>
      </SettingsSection>
    </div>
  );
}
