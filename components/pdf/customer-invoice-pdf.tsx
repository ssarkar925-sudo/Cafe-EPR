import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { numberToWordsInr } from "@/lib/format";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: "#0f172a", fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottom: "1.5", borderBottomColor: "#cbd5e1", paddingBottom: 12, marginBottom: 14 },
  shop: { fontSize: 17, fontWeight: "bold" },
  small: { fontSize: 8, color: "#475569", marginTop: 2 },
  title: { fontSize: 16, fontWeight: "bold" },
  row2: { flexDirection: "row", gap: 10, marginBottom: 14 },
  card: { flex: 1, padding: 9, backgroundColor: "#f8fafc", border: "0.5", borderColor: "#e2e8f0", borderRadius: 4 },
  label: { fontSize: 7, fontWeight: "bold", color: "#64748b", textTransform: "uppercase", marginBottom: 3 },
  value: { fontSize: 9, fontWeight: "bold" },
  head: { flexDirection: "row", backgroundColor: "#0f172a", color: "#fff", fontSize: 8, fontWeight: "bold" },
  line: { flexDirection: "row", borderBottom: "0.5", borderBottomColor: "#e2e8f0", fontSize: 8, paddingVertical: 5 },
  no: { width: 28, textAlign: "center" },
  desc: { flex: 1 },
  qty: { width: 45, textAlign: "center" },
  rate: { width: 75, textAlign: "right" },
  amt: { width: 85, textAlign: "right" },
  summary: { alignSelf: "flex-end", width: 250, marginTop: 12, padding: 10, backgroundColor: "#f8fafc", border: "0.5", borderColor: "#cbd5e1", borderRadius: 4 },
  sr: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, fontSize: 8.5 },
  total: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#0f172a", color: "#fff", padding: 7, marginTop: 4, borderRadius: 3, fontWeight: "bold", fontSize: 10 },
  due: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, color: "#b45309", fontWeight: "bold", fontSize: 9 },
  footer: { marginTop: 22, borderTop: "0.5", borderTopColor: "#e2e8f0", paddingTop: 7, textAlign: "center", color: "#64748b", fontSize: 7.5 },
});

export default function CustomerInvoicePdf({ invoice, items, payments, settings }: { invoice: any; items: any[]; payments: any[]; settings: any }) {
  const cur = settings?.currency_symbol === "₹" ? "Rs. " : `${settings?.currency_symbol || "Rs."} `;
  const money = (n: any) => cur + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hasDue = Number(invoice.due || 0) > 0 && invoice.status !== "cancelled";

  return (
    <Document title={`Invoice ${invoice.invoice_number}`} author={settings?.shop_name || "Shop"}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.shop}>{settings?.shop_name || "Sarkar Communication"}</Text>
            {settings?.address && <Text style={styles.small}>{settings.address}</Text>}
            {settings?.phone && <Text style={styles.small}>Ph: {settings.phone}</Text>}
            {settings?.email && <Text style={styles.small}>Email: {settings.email}</Text>}
            {settings?.tax_id && <Text style={styles.small}>GSTIN / Tax ID: {settings.tax_id}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.title}>TAX INVOICE</Text>
            <Text style={styles.small}>#{invoice.invoice_number}</Text>
            <Text style={styles.small}>Date: {invoice.invoice_date}</Text>
            <Text style={{ ...styles.small, fontWeight: "bold", color: hasDue ? "#b45309" : "#15803d" }}>{hasDue ? `BALANCE DUE: ${money(invoice.due)}` : "FULLY PAID"}</Text>
          </View>
        </View>

        <View style={styles.row2}>
          <View style={styles.card}>
            <Text style={styles.label}>Billed To</Text>
            <Text style={styles.value}>{invoice.customers?.name || "Walk-in Customer"}</Text>
            {invoice.customers?.phone && <Text style={styles.small}>Phone: {invoice.customers.phone}</Text>}
            {invoice.customers?.address && <Text style={styles.small}>{invoice.customers.address}</Text>}
            {invoice.customers?.code && <Text style={styles.small}>Customer ID: {invoice.customers.code}</Text>}
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Invoice Status</Text>
            <Text style={styles.value}>{String(invoice.status || "completed").toUpperCase()}</Text>
            <Text style={styles.small}>Payment Mode: {payments?.length ? payments.map((p: any) => String(p.method).toUpperCase()).join(", ") : "—"}</Text>
          </View>
        </View>

        <View>
          <View style={styles.head}>
            <Text style={{ ...styles.no, paddingVertical: 5 }}>#</Text>
            <Text style={{ ...styles.desc, paddingVertical: 5 }}>Item Description</Text>
            <Text style={{ ...styles.qty, paddingVertical: 5 }}>Qty</Text>
            <Text style={{ ...styles.rate, paddingVertical: 5 }}>Rate</Text>
            <Text style={{ ...styles.amt, paddingVertical: 5 }}>Amount</Text>
          </View>
          {(items || []).map((it: any, index: number) => {
            const name = it.products?.name || it.services?.name || it.description || "Item";
            return <View key={it.id || index} style={styles.line}><Text style={styles.no}>{index + 1}</Text><Text style={styles.desc}>{name}</Text><Text style={styles.qty}>{Number(it.qty || 0)}</Text><Text style={styles.rate}>{money(it.rate)}</Text><Text style={{ ...styles.amt, fontWeight: "bold" }}>{money(it.amount)}</Text></View>;
          })}
        </View>

        <View style={styles.summary}>
          <View style={styles.sr}><Text>Subtotal</Text><Text>{money(invoice.subtotal)}</Text></View>
          {Number(invoice.discount || 0) > 0 && <View style={styles.sr}><Text>Discount</Text><Text>- {money(invoice.discount)}</Text></View>}
          <View style={styles.total}><Text>Grand Total</Text><Text>{money(invoice.total)}</Text></View>
          <View style={styles.sr}><Text>Amount Paid</Text><Text>{money(invoice.paid)}</Text></View>
          {hasDue && <View style={styles.due}><Text>Balance Outstanding</Text><Text>{money(invoice.due)}</Text></View>}
        </View>

        <Text style={{ ...styles.small, marginTop: 12 }}>Amount in Words: {numberToWordsInr(Number(invoice.total))}</Text>
        <View style={styles.footer}><Text>{settings?.receipt_footer || "Thank you for your business."}</Text></View>
      </Page>
    </Document>
  );
}
