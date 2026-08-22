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
  const cur = settings?.currency_symbol || "₹";
  const money = (n: number | string) =>
    cur +
    Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const service = txn.service_type as keyof typeof SERVICE_TITLE;
  const title = SERVICE_TITLE[service] || String(txn.service_type).toUpperCase();

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
            <Text style={styles.sectionTitle}>AEPS Withdrawal Details</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Bank</Text>
              <Text>{txn.banks?.name || "-"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Portal</Text>
              <Text>{txn.portals?.name || "-"}</Text>
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
                <View style={styles.row}>
                  <Text style={styles.label}>Service Fee</Text>
                  <Text>{money(txn.service_fee)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Portal Commission</Text>
                  <Text>{money(txn.portal_commission)}</Text>
                </View>
                <View style={styles.moneyRow}>
                  <Text>Cash Handed</Text>
                  <Text>{money(Number(txn.amount) - Number(txn.service_fee))}</Text>
                </View>
              </>
            )}
          </>
        )}

        {service === "dmt" && (
          <>
            <Text style={styles.sectionTitle}>DMT Transfer Details</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Method</Text>
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
                  <Text style={styles.label}>Account</Text>
                  <Text>{txn.beneficiary_account}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>IFSC</Text>
                  <Text>{txn.beneficiary_ifsc}</Text>
                </View>
              </>
            )}
            <View style={styles.sectionTitle} />
            <View style={styles.row}>
              <Text style={styles.label}>Money Sent From</Text>
              <Text>{(txn.paid_from ?? "bank") === "portal" ? "DMT Portal Wallet" : "Bank Account"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Customer Paid Via</Text>
              <Text>{txn.customer_pay_method || "Cash"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Transfer (Money Out)</Text>
              <Text>{money(txn.amount)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Customer Fee</Text>
              <Text>{money(txn.service_fee)}</Text>
            </View>
            <View style={styles.moneyRow}>
              <Text>Total Collected from Customer</Text>
              <Text>{money(Number(txn.amount) + Number(txn.service_fee))}</Text>
            </View>
            {showFees && (
              <View style={styles.row}>
                <Text style={styles.label}>Portal Charge</Text>
                <Text>{money(txn.portal_commission)}</Text>
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
                <Text style={styles.label}>UPI</Text>
                <Text>{txn.merchant_qrs.upi_id}</Text>
              </View>
            )}
            <View style={styles.sectionTitle} />
            <View style={styles.moneyRow}>
              <Text>UPI Amount</Text>
              <Text>{money(txn.amount)}</Text>
            </View>
            {showFees && (
              <>
                <View style={styles.row}>
                  <Text style={styles.label}>Service Fee</Text>
                  <Text>{money(txn.service_fee)}</Text>
                </View>
                <View style={styles.moneyRow}>
                  <Text>Cash Handed</Text>
                  <Text>{money(Number(txn.amount) - Number(txn.service_fee))}</Text>
                </View>
              </>
            )}
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
