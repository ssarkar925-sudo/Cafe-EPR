"use client";

import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { numberToWordsInr } from "@/lib/format";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    color: "#0f172a",
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  topBar: {
    height: 4,
    backgroundColor: "#2563eb",
    marginBottom: 12,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1.5",
    borderBottomColor: "#e2e8f0",
    paddingBottom: 10,
    marginBottom: 12,
  },
  shopLogoBadge: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  shopLogoText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  shopHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  shopName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0f172a",
  },
  shopMeta: {
    fontSize: 8,
    color: "#475569",
    marginTop: 1.5,
    lineHeight: 1.3,
  },
  titleRight: {
    alignItems: "flex-end",
  },
  statusBadgePaid: {
    backgroundColor: "#dcfce7",
    color: "#15803d",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  statusBadgeDue: {
    backgroundColor: "#fef3c7",
    color: "#b45309",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  statusBadgeCancelled: {
    backgroundColor: "#f1f5f9",
    color: "#64748b",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0f172a",
    letterSpacing: 0.5,
  },
  metaText: {
    fontSize: 8.5,
    color: "#475569",
    marginTop: 1.5,
  },
  cardsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  infoCard: {
    flex: 1,
    padding: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 4,
    border: "0.5",
    borderColor: "#e2e8f0",
  },
  infoCardLabel: {
    fontSize: 7.5,
    fontWeight: "bold",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  customerName: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 2,
  },
  cardMetaText: {
    fontSize: 8,
    color: "#334155",
    lineHeight: 1.3,
  },
  table: {
    marginTop: 4,
    marginBottom: 8,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    borderRadius: 3,
    fontWeight: "bold",
    fontSize: 8,
  },
  th: {
    padding: 5,
    color: "#ffffff",
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5",
    borderBottomColor: "#f1f5f9",
    fontSize: 8,
    alignItems: "center",
  },
  tableRowAlt: {
    flexDirection: "row",
    backgroundColor: "#fafafa",
    borderBottom: "0.5",
    borderBottomColor: "#f1f5f9",
    fontSize: 8,
    alignItems: "center",
  },
  td: {
    padding: 5,
    color: "#1e293b",
  },
  bottomSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 8,
    gap: 12,
  },
  bottomLeft: {
    flex: 1.2,
  },
  wordsBox: {
    padding: 6,
    backgroundColor: "#f8fafc",
    borderRadius: 3,
    border: "0.5",
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },
  wordsLabel: {
    fontSize: 7,
    fontWeight: "bold",
    color: "#64748b",
    textTransform: "uppercase",
  },
  wordsVal: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#0f172a",
    marginTop: 1,
  },
  qrCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 6,
    backgroundColor: "#f0fdf4",
    border: "0.5",
    borderColor: "#bbf7d0",
    borderRadius: 4,
    marginBottom: 8,
  },
  qrImage: {
    width: 54,
    height: 54,
    borderRadius: 3,
    marginRight: 8,
    backgroundColor: "#ffffff",
  },
  qrTitle: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: "#166534",
  },
  qrSub: {
    fontSize: 7,
    color: "#15803d",
    marginTop: 1,
  },
  qrUpiId: {
    fontSize: 7.5,
    fontWeight: "bold",
    color: "#1e40af",
    marginTop: 2,
    fontFamily: "Courier",
  },
  summaryCard: {
    flex: 1,
    padding: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 4,
    border: "0.5",
    borderColor: "#cbd5e1",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    fontSize: 8.5,
    color: "#475569",
  },
  discountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    fontSize: 8.5,
    color: "#15803d",
    fontWeight: "bold",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    padding: 6,
    borderRadius: 3,
    marginTop: 4,
    marginBottom: 4,
    fontWeight: "bold",
    fontSize: 10.5,
  },
  dueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    fontSize: 8.5,
    color: "#b45309",
    fontWeight: "bold",
  },
  signSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 8,
  },
  signBox: {
    width: "45%",
    alignItems: "center",
  },
  signLine: {
    width: 130,
    borderBottom: "0.75",
    borderBottomColor: "#64748b",
    height: 22,
    marginBottom: 3,
  },
  signLabel: {
    fontSize: 7.5,
    fontWeight: "bold",
    color: "#475569",
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 30,
    right: 30,
    borderTop: "0.5",
    borderTopColor: "#e2e8f0",
    paddingTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: "#94a3b8",
  },
});

export type InvoicePdfData = {
  invoice: any;
  items: any[];
  payments: any[];
  settings: any;
  qrDataUrl?: string;
  upiId?: string;
};

export default function InvoicePdf({
  invoice,
  items,
  payments,
  settings,
  qrDataUrl,
  upiId,
}: InvoicePdfData) {
  const rawCur = settings?.currency_symbol || "Rs.";
  const cur = rawCur === "₹" ? "Rs. " : (rawCur.trim() + " ");
  const money = (n: number | string | undefined | null) =>
    cur +
    Number(n || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const isPaid = Number(invoice.due || 0) <= 0 && invoice.status !== "cancelled";
  const isDue = Number(invoice.due || 0) > 0 && invoice.status !== "cancelled";
  const shopInitial = (settings?.shop_name || "S").charAt(0).toUpperCase();
  const totalNum = Number(invoice.total || 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topBar} />

        <View style={styles.header}>
          <View style={{ flex: 1.3 }}>
            <View style={styles.shopHeaderLeft}>
              <View style={styles.shopLogoBadge}>
                <Text style={styles.shopLogoText}>{shopInitial}</Text>
              </View>
              <View>
                <Text style={styles.shopName}>{settings?.shop_name || "Sarkar Communication"}</Text>
                <Text style={{ fontSize: 7.5, color: "#64748b", textTransform: "uppercase", fontWeight: "bold" }}>
                  SMART BUSINESS SUITE
                </Text>
              </View>
            </View>
            {settings?.address && <Text style={styles.shopMeta}>{settings.address}</Text>}
            <Text style={styles.shopMeta}>
              {settings?.phone ? "Ph: " + settings.phone : ""}
              {settings?.phone && settings?.email ? "  ·  " : ""}
              {settings?.email ? "Email: " + settings.email : ""}
            </Text>
            {settings?.tax_id && <Text style={styles.shopMeta}>GSTIN: {settings.tax_id}</Text>}
          </View>

          <View style={styles.titleRight}>
            {isPaid && <Text style={styles.statusBadgePaid}>✓ FULLY PAID</Text>}
            {isDue && <Text style={styles.statusBadgeDue}>⚠ BALANCE DUE: {money(invoice.due)}</Text>}
            {invoice.status === "cancelled" && <Text style={styles.statusBadgeCancelled}>CANCELLED</Text>}

            <Text style={styles.docTitle}>TAX INVOICE</Text>
            <Text style={{ ...styles.metaText, fontWeight: "bold", color: "#0f172a", fontSize: 9 }}>
              #{invoice.invoice_number}
            </Text>
            <Text style={styles.metaText}>Date: {invoice.invoice_date}</Text>
          </View>
        </View>

        <View style={styles.cardsRow}>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardLabel}>Billed To (Customer)</Text>
            <Text style={styles.customerName}>
              {invoice.customers?.name || "Walk-in Customer"}
            </Text>
            {invoice.customers?.phone && (
              <Text style={styles.cardMetaText}>Phone: {invoice.customers.phone}</Text>
            )}
            {invoice.customers?.address && (
              <Text style={styles.cardMetaText}>Address: {invoice.customers.address}</Text>
            )}
            {invoice.customers?.code && (
              <Text style={styles.cardMetaText}>Customer ID: {invoice.customers.code}</Text>
            )}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoCardLabel}>Invoice &amp; Settlement Details</Text>
            <Text style={styles.cardMetaText}>
              Invoice Date: <Text style={{ fontWeight: "bold" }}>{invoice.invoice_date}</Text>
            </Text>
            <Text style={styles.cardMetaText}>
              Payment Mode:{" "}
              <Text style={{ fontWeight: "bold" }}>
                {payments && payments.length > 0
                  ? payments.map((p) => String(p.method).toUpperCase()).join(", ")
                  : "CASH"}
              </Text>
            </Text>
            <Text style={styles.cardMetaText}>
              Status: <Text style={{ fontWeight: "bold" }}>{String(invoice.status || "COMPLETED").toUpperCase()}</Text>
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={{ ...styles.th, width: 25, textAlign: "center" }}>#</Text>
            <Text style={{ ...styles.th, flex: 2.2 }}>Item Description</Text>
            <Text style={{ ...styles.th, width: 45, textAlign: "center" }}>Qty</Text>
            <Text style={{ ...styles.th, width: 75, textAlign: "right" }}>Rate</Text>
            <Text style={{ ...styles.th, width: 85, textAlign: "right" }}>Amount</Text>
          </View>

          {items.map((it, idx) => {
            const isAlt = idx % 2 === 1;
            const itemName = it.products?.name || it.services?.name || it.description || "Item";
            return (
              <View key={it.id || idx} style={isAlt ? styles.tableRowAlt : styles.tableRow}>
                <Text style={{ ...styles.td, width: 25, textAlign: "center", color: "#64748b" }}>
                  {idx + 1}
                </Text>
                <Text style={{ ...styles.td, flex: 2.2, fontWeight: "bold" }}>{itemName}</Text>
                <Text style={{ ...styles.td, width: 45, textAlign: "center" }}>{Number(it.qty)}</Text>
                <Text style={{ ...styles.td, width: 75, textAlign: "right" }}>{money(it.rate)}</Text>
                <Text style={{ ...styles.td, width: 85, textAlign: "right", fontWeight: "bold" }}>
                  {money(it.amount)}
                </Text>
              </View>
            );
          })}

          {items.length === 0 && (
            <View style={styles.tableRow}>
              <Text style={{ ...styles.td, flex: 1, textAlign: "center", color: "#94a3b8" }}>
                No items recorded on this invoice
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bottomSection}>
          <View style={styles.bottomLeft}>
            <View style={styles.wordsBox}>
              <Text style={styles.wordsLabel}>Amount in Words:</Text>
              <Text style={styles.wordsVal}>{numberToWordsInr(totalNum)}</Text>
            </View>

            {qrDataUrl ? (
              <View style={styles.qrCard}>
                <Image src={qrDataUrl} style={styles.qrImage} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.qrTitle}>Scan &amp; Pay via Any UPI App</Text>
                  <Text style={styles.qrSub}>Google Pay · PhonePe · Paytm · BHIM · Any Bank UPI</Text>
                  {upiId && <Text style={styles.qrUpiId}>UPI ID: {upiId}</Text>}
                  <Text style={{ fontSize: 7, color: "#166534", marginTop: 2 }}>
                    Instant settlement for Invoice #{invoice.invoice_number}
                  </Text>
                </View>
              </View>
            ) : null}

            {payments && payments.length > 0 && (
              <View style={{ marginTop: 2 }}>
                <Text style={{ fontSize: 7.5, fontWeight: "bold", color: "#64748b", textTransform: "uppercase" }}>
                  Payment Transactions:
                </Text>
                {payments.map((p, pIdx) => (
                  <Text key={p.id || pIdx} style={{ fontSize: 7.5, color: "#334155", marginTop: 1 }}>
                    • {String(p.method).toUpperCase()} — {money(p.amount)}
                    {p.received_at ? " (" + new Date(p.received_at).toLocaleDateString("en-IN") + ")" : ""}
                  </Text>
                ))}
              </View>
            )}
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text>Subtotal</Text>
              <Text style={{ fontWeight: "bold", color: "#0f172a" }}>{money(invoice.subtotal)}</Text>
            </View>

            {Number(invoice.discount || 0) > 0 && (
              <View style={styles.discountRow}>
                <Text>Discount Savings</Text>
                <Text>- {money(invoice.discount)}</Text>
              </View>
            )}

            <View style={styles.grandTotalRow}>
              <Text style={{ color: "#ffffff" }}>Grand Total</Text>
              <Text style={{ color: "#ffffff" }}>{money(invoice.total)}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text>Amount Paid</Text>
              <Text style={{ fontWeight: "bold", color: "#15803d" }}>{money(invoice.paid)}</Text>
            </View>

            {Number(invoice.due || 0) > 0 && (
              <View style={styles.dueRow}>
                <Text>Balance Outstanding</Text>
                <Text>{money(invoice.due)}</Text>
              </View>
            )}
          </View>
        </View>

        {settings?.receipt_footer && (
          <View style={{ marginTop: 8, padding: 5, backgroundColor: "#fafafa", borderRadius: 3, border: "0.5", borderColor: "#f1f5f9" }}>
            <Text style={{ fontSize: 7, color: "#64748b", textAlign: "center" }}>{settings.receipt_footer}</Text>
          </View>
        )}

        <View style={styles.signSection}>
          <View style={styles.signBox}>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Customer Acknowledgment</Text>
          </View>
          <View style={styles.signBox}>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Authorized Signatory (Store Stamp)</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>Smart Business Suite ERP · Thank you for your business!</Text>
          <Text>Generated: {new Date().toLocaleDateString("en-IN")}</Text>
          <Text>Page 1 of 1</Text>
        </View>
      </Page>
    </Document>
  );
}