"use client";

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const C = { border: "0.75", borderColor: "#cbd5e1" };

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#0f172a", fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1.5", borderBottomColor: "#0f172a", paddingBottom: 10, marginBottom: 14 },
  shopName: { fontSize: 16, fontWeight: "bold" },
  shopMeta: { fontSize: 9, color: "#475569", marginTop: 2 },
  title: { fontSize: 12, fontWeight: "bold", textAlign: "right" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  sectionTitle: { fontSize: 10, fontWeight: "bold", marginTop: 10, marginBottom: 4 },
  tableHead: { flexDirection: "row", borderTop: C.border, borderBottom: C.border, backgroundColor: "#f1f5f9", fontWeight: "bold" },
  cell: { padding: 6, flex: 1 },
  cellSmall: { padding: 6, width: 50, textAlign: "right" },
  cellQty: { padding: 6, width: 45, textAlign: "center" },
  cellRate: { padding: 6, width: 75, textAlign: "right" },
  cellAmt: { padding: 6, width: 85, textAlign: "right" },
  itemRow: { flexDirection: "row", borderBottom: "0.5", borderBottomColor: "#e2e8f0" },
  itemCell: { padding: 6, flex: 1 },
  itemCellRate: { padding: 6, width: 75, textAlign: "right" },
  itemCellAmt: { padding: 6, width: 85, textAlign: "right" },
  itemCellQty: { padding: 6, width: 45, textAlign: "center" },
  totals: { marginTop: 10, marginLeft: "auto", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandRow: { flexDirection: "row", justifyContent: "space-between", fontWeight: "bold", borderTop: "1", borderTopColor: "#0f172a", marginTop: 2, paddingTop: 4 },
  payments: { marginTop: 10 },
  footer: { position: "absolute", bottom: 30, left: 36, right: 36, textAlign: "center", fontSize: 8, color: "#64748b", borderTop: "0.5", borderTopColor: "#cbd5e1", paddingTop: 6 },
});

export type InvoicePdfData = {
  invoice: any;
  items: any[];
  payments: any[];
  settings: any;
};

export default function InvoicePdf({ invoice, items, payments, settings }: InvoicePdfData) {
  const cur = settings?.currency_symbol || "₹";
  const money = (n: number | string) =>
    cur +
    Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.shopName}>{settings?.shop_name || "Shop"}</Text>
            {settings?.address && <Text style={styles.shopMeta}>{settings.address}</Text>}
            {settings?.phone && <Text style={styles.shopMeta}>Ph: {settings.phone}</Text>}
            {settings?.email && <Text style={styles.shopMeta}>{settings.email}</Text>}
          </View>
          <View>
            <Text style={styles.title}>INVOICE</Text>
            <Text style={{ fontSize: 9, textAlign: "right", marginTop: 4, color: "#475569" }}>
              No: {invoice.invoice_number}
            </Text>
            <Text style={{ fontSize: 9, textAlign: "right", color: "#475569" }}>
              Date: {invoice.invoice_date}
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={{ fontWeight: "bold" }}>Bill To:</Text>
          <Text>{invoice.customers?.name || "Walk-in Customer"}</Text>
        </View>
        {invoice.customers?.phone && (
          <View style={styles.row}>
            <Text style={{ width: 60 }}>Phone:</Text>
            <Text>{invoice.customers.phone}</Text>
          </View>
        )}
        {invoice.customers?.address && (
          <View style={styles.row}>
            <Text style={{ width: 60 }}>Address:</Text>
            <Text style={{ flex: 1, textAlign: "right" }}>{invoice.customers.address}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Items</Text>
        <View style={styles.tableHead}>
          <Text style={styles.cell}>Item</Text>
          <Text style={styles.cellQty}>Qty</Text>
          <Text style={styles.cellRate}>Rate</Text>
          <Text style={styles.cellAmt}>Amount</Text>
        </View>
        {items.map((it) => (
          <View key={it.id} style={styles.itemRow}>
            <Text style={styles.itemCell}>{it.products?.name || it.services?.name || it.description || "-"}</Text>
            <Text style={styles.itemCellQty}>{Number(it.qty)}</Text>
            <Text style={styles.itemCellRate}>{money(it.rate)}</Text>
            <Text style={styles.itemCellAmt}>{money(it.amount)}</Text>
          </View>
        ))}
        {items.length === 0 && (
          <View style={styles.itemRow}>
            <Text style={styles.itemCell}>-</Text>
          </View>
        )}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>{money(invoice.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Discount</Text>
            <Text>{money(invoice.discount)}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text>Total</Text>
            <Text>{money(invoice.total)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Paid</Text>
            <Text>{money(invoice.paid)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Due</Text>
            <Text>{money(invoice.due)}</Text>
          </View>
        </View>

        {payments.length > 0 && (
          <View style={styles.payments}>
            <Text style={styles.sectionTitle}>Payments</Text>
            {payments.map((p) => (
              <View key={p.id} style={styles.totalRow}>
                <Text>
                  {String(p.method).toUpperCase()} · {p.received_at ? new Date(p.received_at).toLocaleString("en-IN") : ""}
                </Text>
                <Text>{money(p.amount)}</Text>
              </View>
            ))}
          </View>
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
