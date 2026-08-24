/**
 * ==============================================================================
 * AI Document Vault & Compliance Score Engine
 * ==============================================================================
 */

export type DocumentVaultItem = {
  id: string;
  title: string;
  category: "gst_challan" | "tax_bill" | "distributor_invoice" | "rent_receipt" | "bank_statement" | "kyc_doc" | "other";
  file_url?: string | null;
  document_date: string;
  amount?: number | null;
  vendor_name?: string | null;
  reference_number?: string | null;
  tags?: string[];
  notes?: string | null;
  created_at: string;
};

export type ComplianceReadinessReport = {
  score: number; // 0 - 100
  gstReadiness: number; // %
  itrReadiness: number; // %
  dayCloseDiscipline: number; // %
  documentCompleteness: number; // %
  status: "compliant" | "needs_attention" | "audit_risk";
  actionItems: string[];
};

export function calculateComplianceScore(params: {
  documents: DocumentVaultItem[];
  customersWithGstinCount: number;
  dayCloseCountThisMonth: number;
  negativeStockCount: number;
}): ComplianceReadinessReport {
  const { documents, dayCloseCountThisMonth, negativeStockCount } = params;

  let gstScore = 90;
  let itrScore = 95;
  let dayCloseScore = Math.min(100, Math.round((dayCloseCountThisMonth / 25) * 100));
  let docScore = Math.min(100, documents.length * 15);

  const actionItems: string[] = [];

  if (dayCloseScore < 70) {
    actionItems.push("Increase Day-Close frequency to maintain unbroken daily cash audit trails.");
  }
  if (documents.length < 3) {
    actionItems.push("Upload distributor purchase invoices and electricity bills into Document Vault.");
  }
  if (negativeStockCount > 0) {
    actionItems.push("Correct negative stock inventory to avoid audit flags.");
  }

  const overall = Math.round((gstScore * 0.3) + (itrScore * 0.3) + (dayCloseScore * 0.25) + (docScore * 0.15));

  return {
    score: Math.max(20, Math.min(100, overall)),
    gstReadiness: gstScore,
    itrReadiness: itrScore,
    dayCloseDiscipline: dayCloseScore,
    documentCompleteness: docScore,
    status: overall >= 85 ? "compliant" : overall >= 65 ? "needs_attention" : "audit_risk",
    actionItems,
  };
}
