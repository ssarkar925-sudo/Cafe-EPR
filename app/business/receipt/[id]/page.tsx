import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import PrintButton from "@/components/receipt/print-button";
import Link from "next/link";

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
  searchParams: Promise<{ mode?: string; detail?: string }>;
}) {
  const { id } = await params;
  const { mode, detail } = await searchParams;
  
  // Centralized Presentation Display Policy
  const isDetailed = mode === "detailed" || detail === "true";
  const showCustomerFeeDetails = isDetailed;
  // Internal business earnings (portal commission, operator net income) MUST NEVER appear on customer receipts
  const showInternalBusinessEarnings = false;

  const supabase = createAdminClient();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  let txnQuery = supabase
    .from("transactions")
    .select("*, customers(name, phone, code, address), aeps_banks(name), aeps_portals(name), upi_merchant_qrs(upi_id, display_name), recharge_providers(name)");

  if (isUuid) {
    txnQuery = txnQuery.eq("id", id);
  } else {
    txnQuery = txnQuery.eq("transaction_number", id);
  }

  const { data: txnRaw } = await txnQuery.maybeSingle();
  if (!txnRaw) notFound();

  const txn: any = {
    ...txnRaw,
    banks: txnRaw.aeps_banks || null,
    portals: txnRaw.aeps_portals || null,
    merchant_qrs: txnRaw.upi_merchant_qrs || null,
    providers: txnRaw.recharge_providers || null,
  };

  const { data: settings } = await supabase.from("settings").select("*").single();

  const cur = settings?.currency_symbol || "₹";
  const money = (n: number | string) =>
    cur +
    Number(n || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const service = txn.service_type as keyof typeof SERVICE_TITLE;
  const title = SERVICE_TITLE[service] || txn.service_type.toUpperCase();

  // Mask mobile for privacy
  const maskedMobile = txn.customer_mobile && txn.customer_mobile.length === 10
    ? `${txn.customer_mobile.slice(0, 2)}••••••${txn.customer_mobile.slice(-2)}`
    : txn.customer_mobile;

  // Exact Cash Handed calculation for customer-facing detailed view
  const isDeducted = txn.fee_source === "cut_from_withdrawal";
  const cashHanded = isDeducted
    ? Math.max(0, Number(txn.amount || 0) - Number(txn.service_fee || 0))
    : Number(txn.amount || 0);

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
        
        {/* Print Controls & Display Mode Selector (Print Hidden) */}
        <div className="mb-4 space-y-2.5 border-b border-slate-100 pb-3 print:hidden">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-sm font-bold text-slate-900">Receipt (80mm)</h1>
              <p className="text-[11px] text-slate-500">#{txn.transaction_number}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Link
                href={`/business/receipt/${id}/a4${showCustomerFeeDetails ? "?mode=detailed" : ""}`}
                className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
              >
                📄 A4 Invoice
              </Link>
              <PrintButton />
            </div>
          </div>

          {/* Receipt Display Mode Toggle */}
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-1 text-[11px] font-bold">
            <span className="text-slate-500 pl-1.5">Print Mode:</span>
            <div className="flex gap-1">
              <Link
                href={`/business/receipt/${id}`}
                className={`rounded-lg px-2 py-1 transition ${!showCustomerFeeDetails ? "bg-white text-slate-900 shadow-xs font-black" : "text-slate-500 hover:text-slate-800"}`}
              >
                Basic (Standard)
              </Link>
              <Link
                href={`/business/receipt/${id}?mode=detailed`}
                className={`rounded-lg px-2 py-1 transition ${showCustomerFeeDetails ? "bg-white text-slate-900 shadow-xs font-black" : "text-slate-500 hover:text-slate-800"}`}
              >
                Detailed (With Fee)
              </Link>
            </div>
          </div>
        </div>

        {/* Printable Receipt Content */}
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
            <span className="font-bold text-emerald-700">{txn.status.toUpperCase()}</span>
          </div>
          {txn.reference && (
            <div className="flex justify-between">
              <span>Reference / UTR</span>
              <span className="font-semibold">{txn.reference}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Customer</span>
            <span>{txn.customers?.name || "Walk-in"}</span>
          </div>
          {maskedMobile && (
            <div className="flex justify-between">
              <span>Mobile</span>
              <span>{maskedMobile}</span>
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
                <span>Aadhaar Last 4</span>
                <span>XXXX XXXX XXXX {txn.aadhaar_last4}</span>
              </div>
              <div className="my-1 border-t border-dashed border-slate-400" />
              <div className="flex justify-between text-sm font-bold">
                <span>WITHDRAWAL</span>
                <span>{money(txn.amount)}</span>
              </div>

              {/* Customer Fee Breakdown: Rendered ONLY in Detailed Mode. Never reveals internal earnings. */}
              {showCustomerFeeDetails && (
                <>
                  {Number(txn.service_fee || 0) > 0 && (
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>Service Fee ({isDeducted ? "Deducted" : txn.customer_pay_method ? txn.customer_pay_method.toUpperCase() : "SEPARATE"})</span>
                      <span>{isDeducted ? `-${money(txn.service_fee)}` : `+${money(txn.service_fee)}`}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm font-bold text-emerald-700">
                    <span>CASH HANDED</span>
                    <span>{money(cashHanded)}</span>
                  </div>
                </>
              )}
            </>
          )}

          {service === "dmt" && (
            <>
              <div className="flex justify-between">
                <span>Transfer Mode</span>
                <span>{txn.transfer_method === "upi" ? "UPI VPA" : "Bank IMPS/NEFT"}</span>
              </div>
              <div className="flex justify-between">
                <span>Sender</span>
                <span>{txn.sender_name || txn.customers?.name || "Walk-in"}</span>
              </div>
              <div className="flex justify-between">
                <span>Beneficiary</span>
                <span>{txn.beneficiary_name || txn.receiver_name || "Beneficiary"}</span>
              </div>
              {txn.transfer_method === "upi" ? (
                <div className="flex justify-between">
                  <span>UPI VPA</span>
                  <span>{txn.upi_id || "-"}</span>
                </div>
              ) : (
                <>
                  {txn.beneficiary_bank && (
                    <div className="flex justify-between">
                      <span>Bank</span>
                      <span>{txn.beneficiary_bank}</span>
                    </div>
                  )}
                  {txn.beneficiary_ifsc && (
                    <div className="flex justify-between">
                      <span>IFSC</span>
                      <span>{txn.beneficiary_ifsc}</span>
                    </div>
                  )}
                  {txn.beneficiary_account && (
                    <div className="flex justify-between">
                      <span>Account</span>
                      <span>XXXX XXXX {txn.beneficiary_account.slice(-4)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="my-1 border-t border-dashed border-slate-400" />
              <div className="flex justify-between text-sm font-bold">
                <span>TRANSFER AMOUNT</span>
                <span>{money(txn.amount)}</span>
              </div>
              {showCustomerFeeDetails && (Number(txn.service_fee || 0) > 0 || Number(txn.portal_charge || 0) > 0) && (
                <>
                  {Number(txn.service_fee || 0) > 0 && (
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>Service Fee ({txn.customer_pay_method ? txn.customer_pay_method.toUpperCase() : "CASH"})</span>
                      <span>+{money(txn.service_fee)}</span>
                    </div>
                  )}
                  {Number(txn.portal_charge || 0) > 0 && (
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>Portal / Provider Charge</span>
                      <span>+{money(txn.portal_charge)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-slate-900">
                    <span>TOTAL PAID</span>
                    <span>{money(Number(txn.amount || 0) + Number(txn.service_fee || 0) + Number(txn.portal_charge || 0))}</span>
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
