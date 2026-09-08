import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { approveAction, claimApprovedAction } from "@/lib/ai/approval-gate";
import { calculateGstInvoice } from "@/lib/gst";
import { checkWhatsAppHealth, repairMetaPhoneNumberId } from "@/lib/whatsapp-health";

export const dynamic = "force-dynamic";

type SaleLine = {
  product_id: string | null;
  service_id: string | null;
  description: string;
  qty: number;
  rate: number;
  cost_price: number;
  hsn_sac: string | null;
  gst_rate: number;
  tax_treatment: string;
};

async function markExecuted(id: string, reference: string | null) {
  const supabase = await createClient();
  const { data } = await supabase.from("ai_action_approvals").update({ status: "executed", execution_reference: reference, executed_at: new Date().toISOString() }).eq("id", id).eq("status", "executing").select("id, action, status, execution_reference, approved_at, executed_at").single();
  return data;
}

async function restoreApproved(id: string, note: string) {
  const supabase = await createClient();
  await supabase.from("ai_action_approvals").update({ status: "approved", decision_note: note }).eq("id", id).eq("status", "executing");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Approval id is required" }, { status: 400 });
  const body = await request.json().catch(() => ({}));

  try {
    const approval = await approveAction(id, typeof body?.note === "string" ? body.note : undefined);

    if (approval.action === "repair_whatsapp") {
      const claimed = await claimApprovedAction(id);
      const payload = claimed.request_payload as any;
      if (payload?.repair_kind !== "meta_phone_number_id") throw new Error("Unsupported AI repair plan.");

      const before = await checkWhatsAppHealth();
      if (before.connected) {
        const executed = await markExecuted(id, "already-healthy");
        return NextResponse.json({ approval: executed ?? { ...claimed, status: "executed" }, mode: "verified", executed: true, repair: { changed: false, message: "WhatsApp was already healthy; no configuration was changed." } });
      }
      if (before.provider !== "meta") throw new Error(`This approved repair is only valid for Meta WhatsApp. Current provider: ${before.provider || "not configured"}.`);

      const repair = await repairMetaPhoneNumberId();
      const after = await checkWhatsAppHealth();
      if (!after.connected) {
        await restoreApproved(id, `Repair attempted but verification still failed: ${after.error || after.status}.`);
        throw new Error(`Repair was attempted, but WhatsApp is still unhealthy: ${after.error || after.status}. No further automatic changes were made.`);
      }
      const executed = await markExecuted(id, repair?.phoneNumberId ? `meta-phone-number-id:${repair.phoneNumberId}` : "meta-health-repair");
      return NextResponse.json({ approval: executed ?? { ...claimed, status: "executed" }, mode: "self-healed", executed: true, repair: { changed: true, message: "WhatsApp was repaired and the connection was verified successfully." } });
    }

    if (approval.action !== "create_sale") return NextResponse.json({ approval, mode: "approved", executed: false });

    const claimed = await claimApprovedAction(id);
    const payload = claimed.request_payload as any;
    const supabase = await createClient();
    const itemsPayload = Array.isArray(payload.items) ? payload.items : [];
    if (!itemsPayload.length) throw new Error("Approved sale contains no items.");

    const ids = itemsPayload.map((x: any) => x.id).filter(Boolean);
    const [{ data: products }, { data: services }] = await Promise.all([
      supabase.from("products").select("id,name,sale_price,cost_price,stock_qty,hsn_code,gst_rate").in("id", ids),
      supabase.from("services").select("id,name,sale_price,cost_price,sac_code,gst_rate").in("id", ids),
    ]);
    const catalog = [...(products ?? []).map((p: any) => ({ ...p, kind: "product" })), ...(services ?? []).map((s: any) => ({ ...s, kind: "service" }))];
    const lines: SaleLine[] = itemsPayload.map((item: any) => {
      const current = catalog.find((x: any) => x.id === item.id && x.kind === item.kind);
      if (!current) throw new Error(`Item no longer exists: ${item.name || item.id}`);
      const currentRate = Number(current.sale_price);
      if (Math.abs(currentRate - Number(item.rate)) > 0.001) throw new Error(`${current.name} price changed from ₹${Number(item.rate).toFixed(2)} to ₹${currentRate.toFixed(2)}. A new approval is required.`);
      const qty = Math.floor(Number(item.qty));
      if (qty <= 0) throw new Error(`Invalid quantity for ${current.name}.`);
      if (current.kind === "product" && Number(current.stock_qty) < qty) throw new Error(`${current.name} no longer has enough stock.`);
      return { product_id: current.kind === "product" ? current.id : null, service_id: current.kind === "service" ? current.id : null, description: current.name, qty, rate: currentRate, cost_price: Number(current.cost_price ?? 0), hsn_sac: current.kind === "product" ? current.hsn_code ?? null : current.sac_code ?? null, gst_rate: Number(current.gst_rate ?? 0), tax_treatment: Number(current.gst_rate ?? 0) > 0 ? "taxable" : "non_gst" };
    });

    const gst = calculateGstInvoice({ lines: lines.map((x) => ({ qty: x.qty, rate: x.rate, gstRate: x.gst_rate, hsnSac: x.hsn_sac, taxTreatment: x.tax_treatment as any })), invoiceLumpSumDiscount: 0, supplierStateCode: "19", customerStateCode: payload.customer_state_code ?? null, customerGstin: payload.customer_gstin ?? null });
    const rpcItems = gst.lines.map((line, idx) => ({ ...lines[idx], amount: line.lineTotal, taxable_value: line.taxableValue, cgst_rate: line.cgstRate, cgst_amount: line.cgstAmount, sgst_rate: line.sgstRate, sgst_amount: line.sgstAmount, igst_rate: line.igstRate, igst_amount: line.igstAmount }));
    const expectedTotal = Number(payload.expected_total);
    if (Math.abs(gst.invoiceTotal - expectedTotal) > 0.01) throw new Error(`Sale total changed from ₹${expectedTotal.toFixed(2)} to ₹${gst.invoiceTotal.toFixed(2)}. A new approval is required.`);

    const { data: sale, error: saleError } = await supabase.rpc("create_sale", { p_customer_id: payload.customer_id ?? null, p_invoice_date: new Date().toISOString().slice(0, 10), p_subtotal: Number(gst.totalGross.toFixed(2)), p_discount: 0, p_total: Number(gst.invoiceTotal.toFixed(2)), p_payments: Array.isArray(payload.payment) ? payload.payment : [], p_items: rpcItems, p_previous_due: 0, p_previous_due_method: null, p_previous_due_instrument_id: null, p_advance_used: 0, p_place_of_supply: gst.placeOfSupply, p_supply_type: gst.supplyType, p_customer_gstin: gst.customerGstin, p_b2b_or_b2c: gst.b2bCategory, p_total_taxable_value: gst.totalTaxableValue, p_total_cgst: gst.totalCgst, p_total_sgst: gst.totalSgst, p_total_igst: gst.totalIgst, p_is_reverse_charge: false });
    if (saleError) throw new Error(saleError.message);
    const executed = await markExecuted(id, (sale as any)?.id ?? (sale as any)?.invoice_id ?? null);
    return NextResponse.json({ approval: executed ?? { ...claimed, status: "executed" }, mode: "executed", executed: true, sale });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to approve/execute action" }, { status: 403 });
  }
}
