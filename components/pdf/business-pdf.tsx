"use client";

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const SERVICE_TITLE: Record<string, string> = {
  aeps: "AEPS CASH WITHDRAWAL",
  dmt: "DMT MONEY TRANSFER",
  upi: "UPI CASH OUT",
};

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#0f172a", fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1.5", borderBottomColor: "#0f172a", paddingBottom: 10, marginBottom: 14 },
  shopName: { fontSize: 16, fontWeight: "bold" },
  shopMeta: { fontSize: 9, color: "#475569", marginTop: 2 },
  title: { fontSize: 12, fontWeight: "bold", textAlign: "right" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  label: { width: 130, color: "#475569" },
  sectionTitle: { fontSize: 10, fontWeight: "bold", marginTop: 10, marginBottom: 4, borderTop: "0.75", borderTopColor: "#cbd5e1", paddingTop: 6 },
  moneyRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, fontWeight: "bold", fontSize: 11 },
  note: { marginTop: 10, fontSize: 9, color: "#475569" },
  footer: { position: "absolute", bottom: 30, left: 36, right: 36, textAlign: "center", fontSize: 8, color: "#64748b", borderTop: "0.5", borderTopColor: "#cbd5e1", paddingTop: 6 },
});

export type BusinessPdfData = {
  txn: any;
  settings: any;
  showFees?: boolean;
};

export default function BusinessPdf({ txn, settings, showFees = false }: BusinessPdfData) {
  const rawCur = settings?.currency_symbol || "Rs.";
  const cur = rawCur === "₹" ? "Rs. " : (rawCur.trim() + " ");
  const money = (n: number | string) =>
    cur +
    Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const service = txn.service_type as keyof typeof SERVICE_TITLE;
  const title = SERVICE_TITLE[service] || String(txn.service_type).toUpperCase();

  const isDeducted = txn.fee_source === "cut_from_withdrawal";
  const cashHanded = isDeducted
    ? Math.max(0, Number(txn.amount || 0) - Number(txn.service_fee || 0))
    : Number(txn.amount || 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.shopName}>{settings?.shop_name || "Shop"}</Text>
            {settings?.address && <Text style={styles.shopMeta}>{settings.address}</Text>}
            {settings?.phone && <Text style={styles.shopMeta}>Ph: {settings.phone}</Text>}
          </View>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text style={{ fontSize: 9, textAlign: "right", marginTop: 4, color: "#475569" }}>
              No: {txn.transaction_number}
            </Text>
            <Text style={{ fontSize: 9, textAlign: "right", color: "#475569" }}>
              Date: {txn.transaction_date}
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <Text>{String(txn.status).toUpperCase()}</Text>
        </View>
        {txn.reference && (
          <View style={styles.row}>
            <Text style={styles.label}>Reference</Text>
            <Text>{txn.reference}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.label}>Customer</Text>
          <Text>{txn.customers?.name || "Walk-in"}</Text>
        </View>
        {txn.customer_mobile && (
          <View style={styles.row}>
            <Text style={styles.label}>Mobile</Text>
            <Text>{txn.customer_mobile}</Text>
          </View>
        )}

        {service === "aeps" && (
          <>
            <Text style={styles.sectionTitle}>AEPS Cash Withdrawal Details</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Bank</Text>
              <Text>{txn.banks?.name || "-"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Aadhaar Last 4</Text>
              <Text>XXXX XXXX XXXX {txn.aadhaar_last4}</Text>
            </View>
            <View style={styles.sectionTitle} />
            <View style={styles.moneyRow}>
              <Text>Withdrawal Amount</Text>
              <Text>{money(txn.amount)}</Text>
            </View>
            {showFees && (
              <>
                {Number(txn.service_fee || 0) > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Service Fee ({isDeducted ? "Deducted" : "Separate"})</Text>
                    <Text>{isDeducted ? `-${money(txn.service_fee)}` : `+${money(txn.service_fee)}`}</Text>
                  </View>
                )}
                <View style={styles.moneyRow}>
                  <Text>Cash Handed to Customer</Text>
                  <Text>{money(cashHanded)}</Text>
                </View>
                {Number(txn.portal_commission || 0) > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Portal Commission</Text>
                    <Text>+{money(txn.portal_commission)}</Text>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {service === "dmt" && (
          <>
            <Text style={styles.sectionTitle}>DMT Money Transfer Details</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Transfer Method</Text>
              <Text>{txn.transfer_method === "upi" ? "UPI" : "BANK ACCOUNT"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Sender</Text>
              <Text>{txn.sender_name || "-"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Beneficiary</Text>
              <Text>{txn.beneficiary_name || "-"}</Text>
            </View>
            {txn.transfer_method === "upi" ? (
              <View style={styles.row}>
                <Text style={styles.label}>UPI ID</Text>
                <Text>{txn.upi_id}</Text>
              </View>
            ) : (
              <>
                <View style={styles.row}>
                  <Text style={styles.label}>Bank</Text>
                  <Text>{txn.beneficiary_bank}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Account Number</Text>
                  <Text>{txn.beneficiary_account}</Text>
                </View>
                {txn.beneficiary_ifsc && (
                  <View style={styles.row}>
                    <Text style={styles.label}>IFSC</Text>
                    <Text>{txn.beneficiary_ifsc}</Text>
                  </View>
                )}
              </>
            )}
            <View style={styles.sectionTitle} />
            <View style={styles.row}>
              <Text style={styles.label}>Transfer Amount</Text>
              <Text>{money(txn.amount)}</Text>
            </View>
            {showFees && (
              <View style={styles.moneyRow}>
                <Text>Total Received from Customer</Text>
                <Text>{money(Number(txn.amount) + Number(txn.service_fee || 0))}</Text>
              </View>
            )}
          </>
        )}

        {service === "upi" && (
          <>
            <Text style={styles.sectionTitle}>UPI Cash Out Details</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Merchant QR</Text>
              <Text>{txn.merchant_qrs?.display_name || "-"}</Text>
            </View>
            {txn.merchant_qrs?.upi_id && (
              <View style={styles.row}>
                <Text style={styles.label}>UPI ID</Text>
                <Text>{txn.merchant_qrs.upi_id}</Text>
              </View>
            )}
            <View style={styles.sectionTitle} />
            <View style={styles.moneyRow}>
              <Text>Cash-out Amount</Text>
              <Text>{money(txn.amount)}</Text>
            </View>
            {showFees && (
              <View style={styles.moneyRow}>
                <Text>Cash Handed to Customer</Text>
                <Text>{money(Number(txn.amount) - Number(txn.service_fee || 0))}</Text>
              </View>
            )}
          </>
        )}

        {service === "recharge" && (
          <>
            <Text style={styles.sectionTitle}>Recharge Details</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Provider</Text>
              <Text>{txn.providers?.name || "-"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Mobile / ID</Text>
              <Text>{txn.customer_mobile || "-"}</Text>
            </View>
            <View style={styles.sectionTitle} />
            <View style={styles.moneyRow}>
              <Text>Total Amount Paid</Text>
              <Text>{money(txn.amount)}</Text>
            </View>
          </>
        )}

        {txn.remarks && (
          <Text style={styles.note}>Note: {txn.remarks}</Text>
        )}

        {settings?.receipt_footer && (
          <View style={styles.footer}>
            <Text>{settings.receipt_footer}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
