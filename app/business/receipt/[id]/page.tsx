import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/receipt/print-button";

export const dynamic = "force-dynamic";

const SERVICE_TITLE: Record<string, string> = {
  aeps: "AEPS CASH WITHDRAWAL",
  dmt: "DMT MONEY TRANSFER",
  upi: "UPI CASH OUT",
};

export default async function BusinessReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{`
        @page { size: 80mm auto; margin: 4mm; }
        @media print { body { background: #fff !important; } }
      `}</style>
      <div className="mx-auto max-w-sm rounded-lg bg-white p-4 shadow print:max-w-none print:rounded-none print:shadow-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <h1 className="text-lg font-semibold text-slate-900">Service Receipt</h1>
          <div className="flex items-center gap-2">
            <a
              href={`/business/receipt/${id}/a4`}
              target="_blank"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              A4 / PDF
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
              <div className="flex justify-between text-sm font-bold">
                <span>TRANSFERRED</span>
                <span>{money(txn.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer Fee</span>
                <span>{money(txn.service_fee)}</span>
              </div>
              <div className="flex justify-between">
                <span>Portal Charge</span>
                <span>{money(txn.portal_commission)}</span>
              </div>
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

          {txn.remarks && (
            <>
              <div className="my-2 border-t border-dashed border-slate-400" />
              <div>Note: {txn.remarks}</div>
            </>
          )}

          {settings?.receipt_footer && (
            <>
              <div className="my-2 border-t border-dashed border-slate-400" />
              <div className="text-center">{settings.receipt_footer}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
