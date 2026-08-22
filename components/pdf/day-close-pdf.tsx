"use client";

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

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

const C = { border: "0.75", borderColor: "#cbd5e1" };

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 9,
    color: "#0f172a",
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1.5",
    borderBottomColor: "#0f172a",
    paddingBottom: 8,
    marginBottom: 10,
  },
  shopName: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#0f172a",
  },
  shopMeta: {
    fontSize: 8,
    color: "#475569",
    marginTop: 2,
  },
  certBadge: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    alignSelf: "flex-end",
    marginBottom: 4,
  },
  certBadgeText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  title: {
    fontSize: 11,
    fontWeight: "bold",
    textAlign: "right",
    color: "#0f172a",
  },
  metaText: {
    fontSize: 8,
    color: "#475569",
    textAlign: "right",
    marginTop: 1,
  },
  sectionHeader: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#1e293b",
    textTransform: "uppercase",
    backgroundColor: "#f8fafc",
    padding: 4,
    borderLeft: "2.5",
    borderLeftColor: "#059669",
    marginTop: 8,
    marginBottom: 4,
  },
  tableHead: {
    flexDirection: "row",
    borderTop: C.border,
    borderBottom: C.border,
    backgroundColor: "#f1f5f9",
    fontWeight: "bold",
    fontSize: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5",
    borderBottomColor: "#e2e8f0",
    fontSize: 8,
  },
  tableFoot: {
    flexDirection: "row",
    borderTop: "1",
    borderTopColor: "#0f172a",
    borderBottom: "1",
    borderBottomColor: "#0f172a",
    backgroundColor: "#f8fafc",
    fontWeight: "bold",
    fontSize: 8,
    marginTop: 1,
  },
  cellPool: { padding: 4.5, flex: 2 },
  cellNum: { padding: 4.5, flex: 1, textAlign: "right" },
  cellClosing: { padding: 4.5, flex: 1.2, textAlign: "right", fontWeight: "bold" },
  
  denomGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    border: "0.5",
    borderColor: "#e2e8f0",
    borderRadius: 3,
    padding: 4,
    backgroundColor: "#fafafa",
    marginTop: 3,
  },
  denomItem: {
    width: "25%",
    padding: 3,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  denomLabel: { fontSize: 8, color: "#475569", fontWeight: "bold" },
  denomVal: { fontSize: 8, color: "#0f172a", fontWeight: "bold" },
  denomTotalBar: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: "0.5",
    borderTopColor: "#cbd5e1",
    paddingTop: 3,
    marginTop: 2,
  },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    gap: 6,
  },
  summaryCard: {
    flex: 1,
    padding: 6,
    backgroundColor: "#f8fafc",
    border: "0.5",
    borderColor: "#e2e8f0",
    borderRadius: 3,
  },
  summaryCardLabel: {
    fontSize: 7.5,
    color: "#64748b",
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  summaryCardValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#0f172a",
    marginTop: 2,
  },

  sigSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    paddingTop: 10,
    borderTop: "0.75",
    borderTopColor: "#e2e8f0",
  },
  sigBox: {
    width: "45%",
    alignItems: "center",
  },
  sigLine: {
    width: 140,
    borderBottom: "1",
    borderBottomColor: "#475569",
    marginBottom: 4,
    height: 24,
  },
  sigTitle: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: "#1e293b",
  },
  sigSub: {
    fontSize: 7.5,
    color: "#64748b",
    marginTop: 1,
  },

  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    textAlign: "center",
    fontSize: 7.5,
    color: "#94a3b8",
    borderTop: "0.5",
    borderTopColor: "#e2e8f0",
    paddingTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export type DayClosePdfData = {
  closing: {
    closing_number: string;
    close_date: string;
    status: string;
    opened_at?: string;
    closed_at?: string | null;
    net_profit?: number;
    owner_deposits?: number;
    owner_withdrawals?: number;
    balance_check?: number;
    remarks?: string | null;
    rows: {
      pool: string;
      opening: number;
      movements: number;
      computed?: number;
      adjustment: number;
      final: number;
    }[];
  };
  denominations?: Record<string, string | number>;
  physicalCashTotal?: number;
  settings?: any;
};

export default function DayClosePdf({
  closing,
  denominations = {},
  physicalCashTotal = 0,
  settings,
}: DayClosePdfData) {
  const cur = settings?.currency_symbol || "₹";
  const money = (n: number | string | undefined | null) =>
    cur +
    Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rows = closing.rows || [];
  const totOpening = rows.reduce((s, r) => s + Number(r.opening || 0), 0);
  const totMovements = rows.reduce((s, r) => s + Number(r.movements || 0), 0);
  const totAdjustments = rows.reduce((s, r) => s + Number(r.adjustment || 0), 0);
  const totFinal = rows.reduce((s, r) => s + Number(r.final || 0), 0);

  const denomItems = [
    { label: "₹500", count: Number(denominations.n500) || 0, mult: 500 },
    { label: "₹200", count: Number(denominations.n200) || 0, mult: 200 },
    { label: "₹100", count: Number(denominations.n100) || 0, mult: 100 },
    { label: "₹50", count: Number(denominations.n50) || 0, mult: 50 },
    { label: "₹20", count: Number(denominations.n20) || 0, mult: 20 },
    { label: "₹10", count: Number(denominations.n10) || 0, mult: 10 },
    { label: "₹5", count: Number(denominations.n5) || 0, mult: 5 },
    { label: "Coins", count: Number(denominations.coins) || 0, mult: 1 },
  ];

  const hasCashCount = physicalCashTotal > 0 || denomItems.some((d) => d.count > 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.shopName}>{settings?.shop_name || "Sarkar Communication"}</Text>
            {settings?.address && <Text style={styles.shopMeta}>{settings.address}</Text>}
            {settings?.phone && <Text style={styles.shopMeta}>Ph: {settings.phone}</Text>}
            {settings?.email && <Text style={styles.shopMeta}>{settings.email}</Text>}
          </View>
          <View>
            <View style={styles.certBadge}>
              <Text style={styles.certBadgeText}>OFFICIAL AUDIT CERTIFICATE</Text>
            </View>
            <Text style={styles.title}>STORE END-OF-DAY HANDOVER</Text>
            <Text style={styles.metaText}>Shift #{closing.closing_number}</Text>
            <Text style={styles.metaText}>Date: {closing.close_date}</Text>
            <Text style={styles.metaText}>Status: {String(closing.status || "OPEN").toUpperCase()}</Text>
          </View>
        </View>

        {/* Section 1: Multi-Pool Liquidity & Position */}
        <Text style={styles.sectionHeader}>1. Multi-Channel Liquidity &amp; Account Balances</Text>
        <View style={styles.tableHead}>
          <Text style={styles.cellPool}>Channel / Asset Pool</Text>
          <Text style={styles.cellNum}>Opening</Text>
          <Text style={styles.cellNum}>Movements</Text>
          <Text style={styles.cellNum}>Adjustment</Text>
          <Text style={styles.cellClosing}>Closing Position</Text>
        </View>
        {rows.map((r) => (
          <View key={r.pool} style={styles.tableRow}>
            <Text style={styles.cellPool}>{POOL_LABEL[r.pool] || r.pool}</Text>
            <Text style={styles.cellNum}>{money(r.opening)}</Text>
            <Text style={styles.cellNum}>{money(r.movements)}</Text>
            <Text style={styles.cellNum}>{money(r.adjustment)}</Text>
            <Text style={styles.cellClosing}>{money(r.final)}</Text>
          </View>
        ))}
        <View style={styles.tableFoot}>
          <Text style={styles.cellPool}>TOTAL NET LIQUID POSITION</Text>
          <Text style={styles.cellNum}>{money(totOpening)}</Text>
          <Text style={styles.cellNum}>{money(totMovements)}</Text>
          <Text style={styles.cellNum}>{money(totAdjustments)}</Text>
          <Text style={{ ...styles.cellClosing, color: "#059669" }}>{money(totFinal)}</Text>
        </View>

        {/* Section 2: Cash Denominations (if counted) */}
        {hasCashCount && (
          <View style={{ marginTop: 6 }}>
            <Text style={styles.sectionHeader}>2. Physical Cash Drawer Denomination Count</Text>
            <View style={styles.denomGrid}>
              {denomItems.map((d) => (
                <View key={d.label} style={styles.denomItem}>
                  <Text style={styles.denomLabel}>{d.label} x {d.count}</Text>
                  <Text style={styles.denomVal}>{money(d.count * d.mult)}</Text>
                </View>
              ))}
              <View style={styles.denomTotalBar}>
                <Text style={{ fontSize: 8.5, fontWeight: "bold", color: "#0f172a" }}>
                  Total Physical Cash Counted in Drawer:
                </Text>
                <Text style={{ fontSize: 8.5, fontWeight: "bold", color: "#059669" }}>
                  {money(physicalCashTotal)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Section 3: Reconciliation & Audit */}
        <View style={{ marginTop: 6 }}>
          <Text style={styles.sectionHeader}>3. Financial Reconciliation &amp; Audit</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Net Shift Profit</Text>
              <Text style={{ ...styles.summaryCardValue, color: Number(closing.net_profit || 0) >= 0 ? "#059669" : "#dc2626" }}>
                {money(closing.net_profit || 0)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Owner Inflows</Text>
              <Text style={styles.summaryCardValue}>{money(closing.owner_deposits || 0)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Owner Withdrawals</Text>
              <Text style={styles.summaryCardValue}>{money(closing.owner_withdrawals || 0)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Drawer Balance Check</Text>
              <Text style={{ ...styles.summaryCardValue, color: Math.abs(Number(closing.balance_check || 0)) < 0.01 ? "#059669" : "#dc2626" }}>
                {money(closing.balance_check || 0)}
              </Text>
            </View>
          </View>
        </View>

        {closing.remarks ? (
          <View style={{ marginTop: 6, padding: 4, backgroundColor: "#f8fafc", border: "0.5", borderColor: "#e2e8f0", borderRadius: 3 }}>
            <Text style={{ fontSize: 7.5, color: "#64748b", fontWeight: "bold" }}>Shift Closing Remarks / Variance Notes:</Text>
            <Text style={{ fontSize: 8, color: "#334155", marginTop: 1 }}>{closing.remarks}</Text>
          </View>
        ) : null}

        {/* Section 4: Dual Signatures */}
        <View style={styles.sigSection}>
          <View style={styles.sigBox}>
            <View style={styles.sigLine} />
            <Text style={styles.sigTitle}>Cashier / Operator Signature</Text>
            <Text style={styles.sigSub}>Handed Over By . Physical Cash &amp; Drawer Certified</Text>
          </View>
          <View style={styles.sigBox}>
            <View style={styles.sigLine} />
            <Text style={styles.sigTitle}>Store Manager / Auditor Signature</Text>
            <Text style={styles.sigSub}>Verified &amp; Received . Day Close Reconciled</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Generated via Smart Business Suite ERP</Text>
          <Text>Official Certified Record . {new Date().toLocaleDateString("en-IN")}</Text>
          <Text>Page 1 of 1</Text>
        </View>
      </Page>
    </Document>
  );
}
