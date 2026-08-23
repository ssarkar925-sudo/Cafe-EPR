import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const supabase = createAdminClient();

  const { data: txn } = await supabase.rpc("get_transaction_receipt", {
    p_id: id,
  });
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
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 print:min-h-0 print:bg-white print:p-0">
      <style>{`
        @page { size: A4 portrait; margin: 8mm 10mm; }
        @media print {
          html, body {
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden { display: none !important; }
          .a4-print-card {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
          }
        }
      `}</style>

      <div className="a4-print-card mx-auto max-w-[800px] rounded-2xl border border-slate-200 bg-white p-8 md:p-10 shadow-xl print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-sm font-bold text-slate-900">Transaction Invoice (A4)</h1>
            <p className="text-xs text-slate-500">#{txn.transaction_number} · Standard Customer Invoice</p>
          </div>
          <div className="flex items-center gap-3">
            <FeesToggle showFees={showFees} />
            <A4Actions
              variant="business"
              data={{ txn, settings }}
              showFees={showFees}
              filename={`${txn.transaction_number}.pdf`}
              receiptUrl={`/business/receipt/${id}${showFees ? "?show_fees=1" : ""}`}
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
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-600">Money Sent From</span>
                <span className="font-medium text-slate-900">
                  {(txn.paid_from ?? "bank") === "portal"
                    ? `DMT Portal Wallet${txn.portals?.name ? ` (${txn.portals.name})` : ""}`
                    : txn.remarks?.match(/\[Account:\s*([^\]]+)\]/)?.[1]
                    ? `Our Bank (${txn.remarks.match(/\[Account:\s*([^\]]+)\]/)[1]})`
                    : txn.banks?.name
                    ? `Our Bank (${txn.banks.name})`
                    : "Our Bank Account"}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-600">Customer Paid Via</span>
                <span className="font-medium capitalize text-slate-900">{txn.customer_pay_method || "Cash"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-600">Transfer (Money Out)</span>
                <span className="font-semibold text-rose-600">{money(txn.amount)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-600">Customer Fee</span>
                <span className="font-medium text-slate-900">{money(txn.service_fee)}</span>
              </div>
              <div className="flex justify-between py-2 text-base font-bold text-slate-900">
                <span>Total Collected from Customer</span>
                <span className="text-emerald-700">{money(Number(txn.amount) + Number(txn.service_fee))}</span>
              </div>
              {showFees && (
                <div className="flex justify-between py-1 text-xs text-slate-400">
                  <span>Portal Charge</span>
                  <span>{money(txn.portal_commission)}</span>
                </div>
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
