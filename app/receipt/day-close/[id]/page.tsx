import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import A4Actions from "@/components/pdf/a4-actions";

export const dynamic = "force-dynamic";

const POOL_LABEL: Record<string, string> = {
  cash: "Physical Cash in Hand",
  bank: "Bank Accounts Balance",
  wallet: "Digital Wallet Balance",
  dmt: "DMT Money Transfer Float",
  aeps: "AEPS Portal Float",
  upi_qr: "UPI Merchant QR Float",
  credit_card: "Credit Card Available Limit",
  recharge: "Recharge Service Float",
};

export default async function DayCloseA4Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: settings } = await supabase.from("settings").select("*").single();

  let closing: any = null;
  let rows: any[] = [];

  const { data: cl } = await supabase
    .from("closings")
    .select("*, closing_balances(*)")
    .eq("id", id)
    .maybeSingle();

  if (cl) {
    closing = cl;
    rows = (cl.closing_balances ?? []).map((b: any) => ({
      pool: b.pool,
      opening: Number(b.opening || 0),
      movements: Number(b.movements || 0),
      adjustment: Number(b.adjustment || 0),
      final: Number(b.final || 0),
    }));
  } else {
    const { data: oc } = await supabase.rpc("get_open_close");
    if (oc && (oc.id === id || oc.closing_number === id)) {
      closing = oc;
      rows = (oc.rows ?? []).map((r: any) => ({
        pool: r.pool,
        opening: Number(r.opening || 0),
        movements: Number(r.movements || 0),
        adjustment: Number(r.adjustment || 0),
        final: Number(r.final || 0),
      }));
    }
  }

  if (!closing) notFound();

  const cur = settings?.currency_symbol || "₹";
  const money = (n: number | string | undefined | null) =>
    cur +
    Number(n || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const totOpening = rows.reduce((s, r) => s + Number(r.opening || 0), 0);
  const totMovements = rows.reduce((s, r) => s + Number(r.movements || 0), 0);
  const totAdjustments = rows.reduce((s, r) => s + Number(r.adjustment || 0), 0);
  const totFinal = rows.reduce((s, r) => s + Number(r.final || 0), 0);

  const pdfData = {
    closing: {
      ...closing,
      rows,
    },
    settings,
  };

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

      <div className="a4-print-card mx-auto max-w-[800px] rounded-2xl border border-slate-200 bg-white p-8 shadow-xl print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none">
        <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4 print:hidden">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Handover Certificate A4 Print / PDF</h1>
            <p className="text-xs text-slate-500">Official Store End-of-Day Handover &amp; Audit Certificate</p>
          </div>
          <A4Actions
            variant="day_close"
            data={pdfData as any}
            filename={`Handover_${closing.closing_number}_${closing.close_date}.pdf`}
          />
        </div>

        <div className="border-b-2 border-slate-900 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-black tracking-tight text-slate-900">
                {settings?.shop_name || "Sarkar Communication"}
              </p>
              {settings?.address && <p className="mt-1 text-xs text-slate-600">{settings.address}</p>}
              <p className="text-xs text-slate-600">
                {settings?.phone && <span>Ph: {settings.phone}</span>}
                {settings?.phone && settings?.email && <span> · </span>}
                {settings?.email && <span>Email: {settings.email}</span>}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block rounded-md bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                OFFICIAL AUDIT CERTIFICATE
              </span>
              <p className="mt-2 text-base font-bold tracking-tight text-slate-900">
                STORE END-OF-DAY HANDOVER
              </p>
              <p className="mt-0.5 text-xs text-slate-600 font-mono">Shift #{closing.closing_number}</p>
              <p className="text-xs text-slate-600">Date: {closing.close_date}</p>
              <p className="text-xs font-semibold text-emerald-700 uppercase">
                Status: {String(closing.status || "OPEN").toUpperCase()}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="border-l-4 border-emerald-600 bg-slate-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-800">
            1. Multi-Channel Liquidity &amp; Account Balances
          </h3>
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-100/80 font-bold text-slate-700">
                <th className="py-2 pl-3 pr-2">Channel / Asset Pool</th>
                <th className="py-2 px-2 text-right">Opening</th>
                <th className="py-2 px-2 text-right">Movements</th>
                <th className="py-2 px-2 text-right">Adjustment</th>
                <th className="py-2 pl-2 pr-3 text-right">Closing Position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r: any) => (
                <tr key={r.pool} className="text-slate-800">
                  <td className="py-2 pl-3 pr-2 font-medium">{POOL_LABEL[r.pool] || r.pool}</td>
                  <td className="py-2 px-2 text-right text-slate-600">{money(r.opening)}</td>
                  <td className="py-2 px-2 text-right text-slate-600">{money(r.movements)}</td>
                  <td className="py-2 px-2 text-right text-slate-600">{money(r.adjustment)}</td>
                  <td className="py-2 pl-2 pr-3 text-right font-bold text-slate-900">{money(r.final)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-y-2 border-slate-900 bg-slate-50 font-bold text-slate-900">
                <td className="py-2.5 pl-3 pr-2">TOTAL NET LIQUID POSITION</td>
                <td className="py-2.5 px-2 text-right">{money(totOpening)}</td>
                <td className="py-2.5 px-2 text-right">{money(totMovements)}</td>
                <td className="py-2.5 px-2 text-right">{money(totAdjustments)}</td>
                <td className="py-2.5 pl-2 pr-3 text-right text-emerald-700">{money(totFinal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-6">
          <h3 className="border-l-4 border-blue-600 bg-slate-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-800">
            2. Financial Reconciliation &amp; Audit
          </h3>
          <div className="mt-2 grid grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Net Shift Profit</p>
              <p className={`mt-1 text-sm font-bold ${Number(closing.net_profit || 0) >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                {money(closing.net_profit || 0)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Owner Inflows</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{money(closing.owner_deposits || 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Owner Withdrawals</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{money(closing.owner_withdrawals || 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Drawer Balance Check</p>
              <p className={`mt-1 text-sm font-bold ${Math.abs(Number(closing.balance_check || 0)) < 0.01 ? "text-slate-700" : "text-rose-600"}`}>
                {money(closing.balance_check || 0)}
              </p>
            </div>
          </div>
        </div>

        {closing.remarks && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">Shift Remarks / Variance Notes: </span>
            {closing.remarks}
          </div>
        )}

        <div className="mt-12 grid grid-cols-2 gap-10 border-t border-dashed border-slate-300 pt-8">
          <div className="text-center">
            <div className="mx-auto h-12 w-48 border-b-2 border-slate-600" />
            <p className="mt-2 text-xs font-bold text-slate-800">Cashier / Operator Signature</p>
            <p className="text-[10px] text-slate-500">Handed Over By · Physical Cash &amp; Drawer Certified</p>
          </div>
          <div className="text-center">
            <div className="mx-auto h-12 w-48 border-b-2 border-slate-600" />
            <p className="mt-2 text-xs font-bold text-slate-800">Store Manager / Auditor Signature</p>
            <p className="text-[10px] text-slate-500">Verified &amp; Received · Day Close Reconciled</p>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">
          <div className="flex items-center justify-between">
            <span>Smart Business Suite ERP · Store Audited System</span>
            <span>Generated: {new Date().toLocaleString("en-IN")}</span>
            <span>Official Legal Audit Document</span>
          </div>
        </div>
      </div>
    </div>
  );
}
