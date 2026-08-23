import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import PrintButton from "@/components/receipt/print-button";
import FeesToggle from "@/components/business/fees-toggle";
import { generateUpiString, generateQrDataUrl } from "@/lib/qr";

export const dynamic = "force-dynamic";

const SERVICE_TITLE: Record<string, string> = {
  aeps: "AEPS CASH WITHDRAWAL",
  dmt: "DMT MONEY TRANSFER",
  upi: "UPI CASH OUT",
};

export default async function BusinessReceiptPage({
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

  const { data: defaultMerchantQr } = await supabase
    .from("upi_merchant_qrs")
    .select("upi_id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data: upiInstrument } = await supabase
    .from("payment_instruments")
    .select("account_number")
    .eq("type", "upi")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const cur = settings?.currency_symbol || "₹";
  const money = (n: number | string) =>
    cur +
    Number(n || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const service = txn.service_type as keyof typeof SERVICE_TITLE;
  const title = SERVICE_TITLE[service] || txn.service_type.toUpperCase();

  // UPI QR Code calculation
  const upiId =
    (settings as any)?.upi_id ||
    defaultMerchantQr?.upi_id ||
    upiInstrument?.account_number ||
    "";

  const upiString = upiId
    ? generateUpiString({
        upiId,
        name: settings?.shop_name || "Shop",
        amount: Number(txn.amount || 0),
        note: `Tr ${txn.transaction_number}`,
      })
    : "";

  const qrDataUrl = upiString ? await generateQrDataUrl(upiString, { width: 140 }) : "";

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print {
          body { background: #fff !important; color: #000 !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
      <div className="mx-auto max-w-[340px] rounded-2xl border border-slate-200 bg-white p-5 shadow-lg print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none">
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-slate-100 pb-3 print:hidden">
          <div>
            <h1 className="text-sm font-bold text-slate-900">Receipt (80mm)</h1>
            <p className="text-[11px] text-slate-500">#{txn.transaction_number}</p>
          </div>
          <div className="flex items-center gap-2">
            <FeesToggle showFees={showFees} />
            <a
              href={`/business/receipt/${id}/a4${showFees ? "?show_fees=1" : ""}`}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
            >
              📄 Invoice (A4)
            </a>
            <PrintButton />
          </div>
        </div>

        <div className="font-mono text-xs leading-relaxed text-slate-900">
          <div className="text-center">
            <p className="text-sm font-bold">{settings?.shop_name || "Shop"}</p>
            {settings?.address && <p>{settings.address}</p>}
            {settings?.phone && <p>Ph: {settings.phone}</p>}
            <p className="mt-1 text-[11px] font-bold">{title}</p>
          </div>

          <div className="my-2 border-t border-dashed border-slate-400" />
          <div className="flex justify-between">
            <span>Tr. No</span>
            <span>{txn.transaction_number}</span>
          </div>
          <div className="flex justify-between">
            <span>Date</span>
            <span>{txn.transaction_date}</span>
          </div>
          <div className="flex justify-between">
            <span>Status</span>
            <span>{txn.status.toUpperCase()}</span>
          </div>
          {txn.reference && (
            <div className="flex justify-between">
              <span>Reference</span>
              <span>{txn.reference}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Customer</span>
            <span>{txn.customers?.name || "Walk-in"}</span>
          </div>
          {txn.customer_mobile && (
            <div className="flex justify-between">
              <span>Mobile</span>
              <span>{txn.customer_mobile}</span>
            </div>
          )}

          <div className="my-2 border-t border-dashed border-slate-400" />
          {service === "aeps" && (
            <>
              <div className="flex justify-between">
                <span>Bank</span>
                <span>{txn.banks?.name || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span>Portal</span>
                <span>{txn.portals?.name || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span>Aadhaar Last 4</span>
                <span>XXXX XXXX XXXX {txn.aadhaar_last4}</span>
              </div>
              <div className="my-1 border-t border-dashed border-slate-400" />
              <div className="flex justify-between text-sm font-bold">
                <span>WITHDRAWAL</span>
                <span>{money(txn.amount)}</span>
              </div>
              {showFees && (
                <>
                  <div className="flex justify-between">
                    <span>Service Fee</span>
                    <span>{money(txn.service_fee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Portal Commission</span>
                    <span>{money(txn.portal_commission)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span>CASH HANDED</span>
                    <span>{money(Number(txn.amount) - Number(txn.service_fee))}</span>
                  </div>
                </>
              )}
            </>
          )}
          {service === "dmt" && (
            <>
              <div className="flex justify-between">
                <span>Method</span>
                <span>{txn.transfer_method === "upi" ? "UPI" : "BANK ACCOUNT"}</span>
              </div>
              <div className="flex justify-between">
                <span>Sender</span>
                <span>{txn.sender_name || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span>Beneficiary</span>
                <span>{txn.beneficiary_name || "-"}</span>
              </div>
              {txn.transfer_method === "upi" ? (
                <div className="flex justify-between">
                  <span>UPI ID</span>
                  <span>{txn.upi_id}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>Bank</span>
                    <span>{txn.beneficiary_bank}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>A/C</span>
                    <span>{txn.beneficiary_account}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>IFSC</span>
                    <span>{txn.beneficiary_ifsc}</span>
                  </div>
                </>
              )}
              <div className="my-1 border-t border-dashed border-slate-400" />
              <div className="flex justify-between">
                <span>Transfer (Money Out)</span>
                <span className="font-semibold">{money(txn.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Paid From</span>
                <span>
                  {(txn.paid_from ?? "bank") === "portal"
                    ? `Portal (${txn.portals?.name || "Wallet"})`
                    : txn.remarks?.match(/\[Account:\s*([^\]]+)\]/)?.[1]
                    ? `Bank (${txn.remarks.match(/\[Account:\s*([^\]]+)\]/)[1]})`
                    : txn.banks?.name
                    ? `Bank (${txn.banks.name})`
                    : "Bank Account"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Service Fee</span>
                <span>{money(txn.service_fee)}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer Paid Via</span>
                <span className="capitalize">{txn.customer_pay_method || "Cash"}</span>
              </div>
              <div className="my-1 border-t border-dashed border-slate-400" />
              <div className="flex justify-between text-sm font-bold">
                <span>TOTAL COLLECTED</span>
                <span>{money(Number(txn.amount) + Number(txn.service_fee))}</span>
              </div>
              {showFees && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Portal Charge</span>
                  <span>{money(txn.portal_commission)}</span>
                </div>
              )}
            </>
          )}
          {service === "upi" && (
            <>
              <div className="flex justify-between">
                <span>Merchant QR</span>
                <span>{txn.merchant_qrs?.display_name || "-"}</span>
              </div>
              {txn.merchant_qrs?.upi_id && (
                <div className="flex justify-between">
                  <span>UPI</span>
                  <span>{txn.merchant_qrs.upi_id}</span>
                </div>
              )}
              <div className="my-1 border-t border-dashed border-slate-400" />
              <div className="flex justify-between text-sm font-bold">
                <span>UPI AMOUNT</span>
                <span>{money(txn.amount)}</span>
              </div>
              {showFees && (
                <>
                  <div className="flex justify-between">
                    <span>Service Fee</span>
                    <span>{money(txn.service_fee)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span>CASH HANDED</span>
                    <span>{money(Number(txn.amount) - Number(txn.service_fee))}</span>
                  </div>
                </>
              )}
            </>
          )}

          {txn.remarks && (
            <>
              <div className="my-2 border-t border-dashed border-slate-300" />
              <div>Note: {txn.remarks}</div>
            </>
          )}

          {/* Dynamic UPI QR Code for Business Services */}
          {qrDataUrl && (
            <>
              <div className="my-2.5 border-t-2 border-dashed border-slate-400" />
              <div className="flex flex-col items-center justify-center text-center py-1 bg-slate-50/70 rounded-xl p-2.5">
                <img
                  src={qrDataUrl}
                  alt="Scan to Pay via UPI"
                  className="h-28 w-28 object-contain rounded-lg border border-slate-300 bg-white p-1"
                />
                <p className="mt-1.5 font-black text-[11px] tracking-wider text-slate-900">
                  SCAN &amp; PAY VIA UPI
                </p>
                <p className="text-[10px] font-bold text-emerald-800">
                  Amount: {money(txn.amount)}
                </p>
                {upiId && <p className="text-[9px] font-mono text-slate-600 truncate max-w-full">UPI: {upiId}</p>}
                <p className="text-[8px] text-slate-500">Google Pay · PhonePe · Paytm · BHIM</p>
              </div>
            </>
          )}

          {settings?.receipt_footer && (
            <>
              <div className="my-2 border-t border-dashed border-slate-300" />
              <div className="text-center text-[10px] text-slate-600 whitespace-pre-line">{settings.receipt_footer}</div>
            </>
          )}

          <div className="mt-2 text-center text-[9px] text-slate-400">
            *** Thank You! Visit Again ***
          </div>
        </div>
      </div>
    </div>
  );
}
