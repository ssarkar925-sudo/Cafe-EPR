/**
 * Canonical GST Tax Calculation Engine
 * 
 * Implements deterministic 2-decimal half-up arithmetic for line items,
 * pro-rata invoice discount allocation, Place of Supply resolution,
 * and header tax aggregation.
 */

export type TaxTreatment = "taxable" | "nil_rated" | "exempt" | "non_gst";
export type SupplyType = "intra_state" | "inter_state";
export type B2BCategory = "B2B" | "B2C_SMALL" | "B2C_LARGE";

export interface GstLineInput {
  qty: number;
  rate: number;
  lineDiscount?: number;
  gstRate: number; // e.g. 0, 5, 12, 18, 28
  hsnSac?: string | null;
  taxTreatment?: TaxTreatment;
}

export interface GstLineResult {
  qty: number;
  rate: number;
  grossAmount: number;
  lineDiscount: number;
  proRataInvoiceDiscount: number;
  taxableValue: number;
  gstRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
  lineTotal: number;
  hsnSac: string | null;
  taxTreatment: TaxTreatment;
}

export interface GstInvoiceCalculation {
  lines: GstLineResult[];
  supplyType: SupplyType;
  placeOfSupply: string | null;
  customerGstin: string | null;
  b2bCategory: B2BCategory;
  totalGross: number;
  totalDiscount: number;
  totalTaxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTax: number;
  invoiceTotal: number;
}

/**
 * Standard half-up 2-decimal rounding.
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Resolves Place of Supply and Supply Type based on configured supplier and customer states.
 */
export function resolveSupplyType(
  supplierStateCode: string | null | undefined,
  customerStateCode: string | null | undefined
): { supplyType: SupplyType; placeOfSupply: string | null } {
  const cleanSupplier = supplierStateCode?.trim() || "19"; // Default shop state e.g. 19
  const cleanCustomer = customerStateCode?.trim() || null;

  if (!cleanCustomer || cleanCustomer === cleanSupplier) {
    return {
      supplyType: "intra_state",
      placeOfSupply: cleanCustomer ? `${cleanCustomer}` : `${cleanSupplier}-Intra-State`,
    };
  }

  return {
    supplyType: "inter_state",
    placeOfSupply: cleanCustomer,
  };
}

/**
 * Derives B2B / B2C classification at point of invoice posting.
 */
export function resolveB2BCategory(
  customerGstin: string | null | undefined,
  supplyType: SupplyType,
  invoiceTotal: number
): B2BCategory {
  const gstin = customerGstin?.trim();
  if (gstin && gstin.length >= 15) {
    return "B2B";
  }

  if (supplyType === "inter_state" && invoiceTotal > 250000) {
    return "B2C_LARGE";
  }

  return "B2C_SMALL";
}

/**
 * Computes deterministic multi-line GST tax schedule.
 */
export function calculateGstInvoice({
  lines,
  invoiceLumpSumDiscount = 0,
  supplierStateCode = "19",
  customerStateCode = null,
  customerGstin = null,
}: {
  lines: GstLineInput[];
  invoiceLumpSumDiscount?: number;
  supplierStateCode?: string | null;
  customerStateCode?: string | null;
  customerGstin?: string | null;
}): GstInvoiceCalculation {
  const { supplyType, placeOfSupply } = resolveSupplyType(supplierStateCode, customerStateCode);

  const rawGrossLines = lines.map((l) => {
    const qty = Math.max(0, Number(l.qty) || 0);
    const rate = Math.max(0, Number(l.rate) || 0);
    const gross = round2(qty * rate);
    const lineDisc = Math.min(gross, Math.max(0, Number(l.lineDiscount) || 0));
    return { ...l, qty, rate, gross, lineDisc };
  });

  const totalGrossSum = rawGrossLines.reduce((s, l) => s + l.gross, 0);
  const totalItemDiscounts = rawGrossLines.reduce((s, l) => s + l.lineDisc, 0);
  const grossAfterItemDisc = Math.max(0, totalGrossSum - totalItemDiscounts);
  const lumpSumDiscount = Math.min(grossAfterItemDisc, Math.max(0, Number(invoiceLumpSumDiscount) || 0));

  let totalTaxableValue = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const calculatedLines: GstLineResult[] = rawGrossLines.map((l) => {
    const proRataInvoiceDisc =
      grossAfterItemDisc > 0
        ? round2(((l.gross - l.lineDisc) / grossAfterItemDisc) * lumpSumDiscount)
        : 0;

    const taxableValue = Math.max(0, round2(l.gross - l.lineDisc - proRataInvoiceDisc));
    const taxTreatment = l.taxTreatment || (l.gstRate > 0 ? "taxable" : "non_gst");
    const gstRate = taxTreatment === "taxable" ? Math.max(0, Number(l.gstRate) || 0) : 0;

    let cgstRate = 0;
    let cgstAmount = 0;
    let sgstRate = 0;
    let sgstAmount = 0;
    let igstRate = 0;
    let igstAmount = 0;

    if (gstRate > 0 && taxableValue > 0) {
      if (supplyType === "intra_state") {
        cgstRate = gstRate / 2;
        sgstRate = gstRate / 2;
        cgstAmount = round2((taxableValue * cgstRate) / 100);
        sgstAmount = round2((taxableValue * sgstRate) / 100);
      } else {
        igstRate = gstRate;
        igstAmount = round2((taxableValue * igstRate) / 100);
      }
    }

    const totalTax = round2(cgstAmount + sgstAmount + igstAmount);
    const lineTotal = round2(taxableValue + totalTax);

    totalTaxableValue = round2(totalTaxableValue + taxableValue);
    totalCgst = round2(totalCgst + cgstAmount);
    totalSgst = round2(totalSgst + sgstAmount);
    totalIgst = round2(totalIgst + igstAmount);

    return {
      qty: l.qty,
      rate: l.rate,
      grossAmount: l.gross,
      lineDiscount: l.lineDisc,
      proRataInvoiceDiscount: proRataInvoiceDisc,
      taxableValue,
      gstRate,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      totalTax,
      lineTotal,
      hsnSac: l.hsnSac || null,
      taxTreatment,
    };
  });

  const totalTax = round2(totalCgst + totalSgst + totalIgst);
  const invoiceTotal = round2(totalTaxableValue + totalTax);
  const b2bCategory = resolveB2BCategory(customerGstin, supplyType, invoiceTotal);

  return {
    lines: calculatedLines,
    supplyType,
    placeOfSupply,
    customerGstin: customerGstin?.trim() || null,
    b2bCategory,
    totalGross: round2(totalGrossSum),
    totalDiscount: round2(totalItemDiscounts + lumpSumDiscount),
    totalTaxableValue,
    totalCgst,
    totalSgst,
    totalIgst,
    totalTax,
    invoiceTotal,
  };
}

