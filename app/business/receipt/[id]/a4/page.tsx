import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import A4Actions from "@/components/pdf/a4-actions";
import Link from "next/link";

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
  searchParams: Promise<{ mode?: string; detail?: string }>;
}) {
  const { id } = await params;
  const { mode, detail } = await searchParams;
  const isDetailed = mode === "detailed" || detail === "true";

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
    Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const service = txn.service_type as keyof typeof SERVICE_TITLE;
  const title = SERVICE_TITLE[service] || txn.service_type.toUpperCase();

  // Mask mobile for privacy
  const maskedMobile = txn.customer_mobile && txn.customer_mobile.length === 10
    ? `${txn.customer_mobile.slice(0, 2)}••••••${txn.customer_mobile.slice(-2)}`
    : txn.customer_mobile;

  // Exact Cash Handed calculation
  const isDeducted = txn.fee_source === "cut_from_withdrawal";
  const cashHanded = isDeducted
    ? Math.max(0, Number(txn.amount || 0) - Number(txn.service_fee || 0))
    : Number(txn.amount || 0);

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
        
        {/* Top Controls & Print Mode Selector (Print Hidden) */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 print:hidden">
          <div>
            <h1 className="text-sm font-bold text-slate-900">Transaction Invoice (A4)</h1>
            <p className="text-xs text-slate-500">#{txn.transaction_number} · Standard Customer Invoice</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Display Mode Toggle */}
            <div className="flex items-center rounded-xl bg-slate-100 p-1 text-xs font-bold">
              <Link
                href={`/business/receipt/${id}/a4`}
                className={`rounded-lg px-2.5 py-1 transition ${!isDetailed ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
              >
                Basic
              </Link>
              <Link
                href={`/business/receipt/${id}/a4?mode=detailed`}
                className={`rounded-lg px-2.5 py-1 transition ${isDetailed ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
              >
                Detailed (With Fee)
              </Link>
            </div>

            <A4Actions
              variant="business"
              data={{ txn, settings }}
              filename={`${txn.transaction_number}.pdf`}
              receiptUrl={`/business/receipt/${id}${isDetailed ? "?mode=detailed" : ""}`}
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
            {maskedMobile && <p className="text-sm text-slate-600">{maskedMobile}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transaction</p>
            <div className="mt-1 space-y-0.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Status</span>
                <span className="font-bold text-emerald-700 capitalize">{txn.status}</span>
              </div>
              {txn.reference && (
                <div className="flex justify-between text-slate-600">
                  <span>Reference / UTR</span>
                  <span className="font-semibold text-slate-900">{txn.reference}</span>
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
                <span className="text-slate-600">Aadhaar Last 4</span>
                <span className="font-medium text-slate-900">XXXX XXXX XXXX {txn.aadhaar_last4}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-2 font-bold text-slate-900">
                <span>Withdrawal Amount</span>
                <span>{money(txn.amount)}</span>
              </div>

              {/* Fee Breakdown (Only in Detailed Mode) */}
              {isDetailed && Number(txn.service_fee || 0) > 0 && (
                <>
                  {isDeducted ? (
                    <div className="flex justify-between border-b border-slate-100 py-1.5 text-slate-600">
                      <span>Service Fee (Deducted from Payout)</span>
                      <span>-{money(txn.service_fee)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between border-b border-slate-100 py-1.5 text-slate-600">
                      <span>Service Fee (Collected Separately via {txn.customer_pay_method ? txn.customer_pay_method.toUpperCase() : "CASH"})</span>
                      <span>+{money(txn.service_fee)}</span>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between py-2 text-base font-bold text-slate-900">
                <span>Cash Handed to Customer</span>
                <span className="text-emerald-700">{money(cashHanded)}</span>
              </div>
            </>
          )}

          {txn.remarks && (
            <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Remarks:</span> {txn.remarks}
            </div>
          )}
        </div>

        <div className="mt-12 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          <p>{settings?.receipt_footer || "Thank you for your business."}</p>
        </div>
      </div>
    </div>
  );
}
