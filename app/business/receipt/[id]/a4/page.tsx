import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import A4Actions from "@/components/pdf/a4-actions";
import FeesToggle from "@/components/business/fees-toggle";

export const dynamic = "force-dynamic";

const SERVICE_TITLE: Record<string, string> = {
  aeps: "AEPS CASH WITHDRAWAL",
  dmt: "DMT MONEY TRANSFER",
  upi: "UPI CASH OUT",
};

export default async function BusinessReceiptA4Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ show_fees?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const showFees = sp?.show_fees === "1";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: txn } = await supabase
    .from("transactions")
    .select(
      "*, customers(name, phone), banks:aeps_banks(name), portals:aeps_portals(name), merchant_qrs:upi_merchant_qrs(display_name, upi_id)"
    )
    .eq("id", id)
    .single();
  if (!txn) notFound();

  const { data: settings } = await supabase.from("settings").select("*").single();

  const cur = settings?.currency_symbol || "₹";
  const money = (n: number | string) =>
    cur +
    Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const service = txn.service_type as keyof typeof SERVICE_TITLE;
  const title = SERVICE_TITLE[service] || txn.service_type.toUpperCase();

  return (
    <div className="min-h-screen bg-slate-200 p-6 print:bg-white print:p-0">
      <style>{`
        @page { size: A4; margin: 15mm; }
        @media print { body { background: #fff !important; } }
      `}</style>

      <div className="mx-auto max-w-[800px] rounded-lg bg-white p-8 shadow-lg print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <h1 className="text-lg font-semibold text-slate-900">A4 Print / PDF</h1>
          <div className="flex items-center gap-3">
            <FeesToggle showFees={showFees} />
            <A4Actions
              variant="business"
              data={{ txn, settings }}
              showFees={showFees}
              filename={`${txn.transaction_number}.pdf`}
            />
          </div>
        </div>

        <div className="border-b-2 border-slate-900 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {settings?.shop_name || "Shop"}
              </p>
              {settings?.address && <p className="mt-1 text-sm text-slate-600">{settings.address}</p>}
              {settings?.phone && <p className="text-sm text-slate-600">Ph: {settings.phone}</p>}
            </div>
            <div className="text-right">
              <p className="text-xl font-bold tracking-wide text-slate-900">{title}</p>
              <p className="mt-1 text-sm text-slate-600">No: {txn.transaction_number}</p>
              <p className="text-sm text-slate-600">Date: {txn.transaction_date}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</p>
            <p className="mt-1 font-medium text-slate-900">{txn.customers?.name || "Walk-in"}</p>
            {txn.customer_mobile && <p className="text-sm text-slate-600">{txn.customer_mobile}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transaction</p>
            <div className="mt-1 space-y-0.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Status</span>
                <span className="font-medium text-slate-900 capitalize">{txn.status}</span>
              </div>
              {txn.reference && (
                <div className="flex justify-between text-slate-600">
                  <span>Reference</span>
                  <span className="font-medium text-slate-900">{txn.reference}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-1 text-sm">
          {service === "aeps" && (
            <>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-600">Bank</span>
                <span className="font-medium text-slate-900">{txn.banks?.name || "-"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-600">Portal</span>
                <span className="font-medium text-slate-900">{txn.portals?.name || "-"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-600">Aadhaar Last 4</span>
                <span className="font-medium text-slate-900">XXXX XXXX XXXX {txn.aadhaar_last4}</span>
              </div>
              <div className="flex justify-between py-1.5 font-bold text-slate-900">
                <span>Withdrawal Amount</span>
                <span>{money(txn.amount)}</span>
              </div>
              {showFees && (
                <>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600">Service Fee</span>
                    <span className="font-medium text-slate-900">{money(txn.service_fee)}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600">Portal Commission</span>
                    <span className="font-medium text-slate-900">{money(txn.portal_commission)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold text-slate-900">
                    <span>Cash Handed</span>
                    <span>{money(Number(txn.amount) - Number(txn.service_fee))}</span>
                  </div>
                </>
              )}
            </>
          )}
          {service === "dmt" && (
            <>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-600">Method</span>
                <span className="font-medium text-slate-900">{txn.transfer_method === "upi" ? "UPI" : "BANK ACCOUNT"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-600">Sender</span>
                <span className="font-medium text-slate-900">{txn.sender_name || "-"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-600">Beneficiary</span>
                <span className="font-medium text-slate-900">{txn.beneficiary_name || "-"}</span>
              </div>
              {txn.transfer_method === "upi" ? (
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="text-slate-600">UPI ID</span>
                  <span className="font-medium text-slate-900">{txn.upi_id}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-600">Bank</span>
                    <span className="font-medium text-slate-900">{txn.beneficiary_bank}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-600">Account</span>
                    <span className="font-medium text-slate-900">{txn.beneficiary_account}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-600">IFSC</span>
                    <span className="font-medium text-slate-900">{txn.beneficiary_ifsc}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between py-1.5 font-bold text-slate-900">
                <span>Transferred Amount</span>
                <span>{money(txn.amount)}</span>
              </div>
              {showFees && (
                <>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600">Customer Fee</span>
                    <span className="font-medium text-slate-900">{money(txn.service_fee)}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600">Portal Charge</span>
                    <span className="font-medium text-slate-900">{money(txn.portal_commission)}</span>
                  </div>
                </>
              )}
            </>
          )}
          {service === "upi" && (
            <>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-600">Merchant QR</span>
                <span className="font-medium text-slate-900">{txn.merchant_qrs?.display_name || "-"}</span>
              </div>
              {txn.merchant_qrs?.upi_id && (
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="text-slate-600">UPI</span>
                  <span className="font-medium text-slate-900">{txn.merchant_qrs.upi_id}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 font-bold text-slate-900">
                <span>UPI Amount</span>
                <span>{money(txn.amount)}</span>
              </div>
              {showFees && (
                <>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600">Service Fee</span>
                    <span className="font-medium text-slate-900">{money(txn.service_fee)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold text-slate-900">
                    <span>Cash Handed</span>
                    <span>{money(Number(txn.amount) - Number(txn.service_fee))}</span>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {txn.remarks && (
          <p className="mt-6 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">Note:</span> {txn.remarks}
          </p>
        )}

        {settings?.receipt_footer && (
          <p className="mt-10 border-t border-slate-200 pt-4 text-center text-sm text-slate-500">
            {settings.receipt_footer}
          </p>
        )}
      </div>
    </div>
  );
}
