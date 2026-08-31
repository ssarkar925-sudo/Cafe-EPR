import type { HubModule } from "@/components/navigation/hub-workspace";

export const HUBS: Record<string, { label: string; modules: HubModule[] }> = {
  sales: { label: "Sales Hub", modules: [
    { id: "sales", label: "Sales", description: "Counter billing, quick sale and invoice operations.", href: "/sales", items: [{label:"POS",href:"/pos"},{label:"Quick Sale",href:"/pos"},{label:"Invoices",href:"/invoices"}] },
    { id: "customers", label: "Customers", description: "Customer records, dues, credit and transaction history.", href: "/customers", items: [{label:"Directory",href:"/customers"},{label:"Dues",href:"/customers"}] },
    { id: "returns", label: "Returns", description: "Returns, refunds and credit reversal workflows.", href: "/returns", items: [{label:"Returns & Credit",href:"/returns"}] },
  ]},
  operations: { label: "Operations Hub", modules: [
    { id: "catalog", label: "Catalog", description: "Products, services and master-data management.", href: "/catalog", items: [{label:"Products",href:"/catalog/products"},{label:"Services",href:"/catalog/services"},{label:"Categories",href:"/catalog/categories"},{label:"Brands",href:"/catalog/brands"},{label:"Units",href:"/catalog/units"}] },
    { id: "inventory", label: "Inventory", description: "Stock levels, movements, valuation and reorder control.", href: "/inventory", items: [{label:"Stock",href:"/inventory"},{label:"Movements",href:"/inventory/movements"}] },
    { id: "purchases", label: "Purchases", description: "Supplier procurement and purchase-entry workflows.", href: "/purchases", items: [{label:"Purchases",href:"/purchases"},{label:"Purchase Entry",href:"/purchases/entry"}] },
    { id: "suppliers", label: "Suppliers", description: "Vendor directory and accounts payable operations.", href: "/suppliers", items: [{label:"Suppliers",href:"/suppliers"}] },
  ]},
  business: { label: "Business Services Hub", modules: [
    { id: "financial", label: "Financial Services", description: "AEPS, DMT and UPI service operations.", href: "/business", items: [{label:"AEPS",href:"/business/aeps"},{label:"DMT",href:"/business/dmt"},{label:"UPI",href:"/business/upi"}] },
    { id: "recharge", label: "Bill & Recharge", description: "Recharge, bill payment and digital-value services.", href: "/business/bill-payment", items: [{label:"Bill Payment",href:"/business/bill-payment"},{label:"Mobile Recharge",href:"/business/bill-payment/mobile-recharge"},{label:"Utility Bills",href:"/business/bill-payment/utility"},{label:"Google Play",href:"/business/bill-payment/google-play"}] },
    { id: "network", label: "Service Network", description: "Banks, service portals and merchant QR management.", href: "/business/banks", items: [{label:"Banks",href:"/business/banks"},{label:"Service Portals",href:"/business/portals"},{label:"Merchant QRs",href:"/business/merchant-qrs"}] },
    { id: "communication", label: "Communication", description: "Business messaging and WhatsApp operations.", href: "/business/whatsapp", items: [{label:"WhatsApp",href:"/business/whatsapp"}] },
  ]},
  finance: { label: "Finance Hub", modules: [
    { id: "accounts", label: "Accounts", description: "Ledgers, journals, trial balance and account controls.", href: "/finance/accounts", items: [{label:"Accounts",href:"/finance/accounts"},{label:"Ledger",href:"/finance/ledger"},{label:"Journal",href:"/finance/journal"},{label:"Trial Balance",href:"/finance/trial-balance"}] },
    { id: "cash", label: "Cash & Bank", description: "Cashbook, instruments, reconciliation and settlements.", href: "/finance/cashbook", items: [{label:"Cashbook",href:"/finance/cashbook"},{label:"Reconciliation",href:"/finance/reconciliation"},{label:"Settlements",href:"/finance/settlements"}] },
    { id: "pnl", label: "Profit & Loss", description: "Operating income, costs and profitability analysis.", href: "/finance/pnl", items: [{label:"P&L",href:"/finance/pnl"}] },
    { id: "expenses", label: "Expenses", description: "Categorized operating expense management.", href: "/finance/expenses", items: [{label:"Expense Ledger",href:"/finance/expenses"}] },
    { id: "closing", label: "Closing", description: "Opening balances and controlled end-of-day close.", href: "/finance/opening-balances", items: [{label:"Opening Balances",href:"/finance/opening-balances"},{label:"Day Close",href:"/finance/day-close"}] },
  ]},
  reports: { label: "Reports Hub", modules: [
    { id: "reports", label: "Business Reports", description: "Sales, margins, activity and management reporting.", href: "/reports", items: [{label:"Reports Studio",href:"/reports"}] },
    { id: "tax", label: "Tax", description: "GST summaries and CA-ready tax preparation.", href: "/reports/gst", items: [{label:"GST Reports",href:"/reports/gst"},{label:"Tax Prep / ITR",href:"/reports/tax-preparation"}] },
    { id: "audit", label: "Audit", description: "Operational and security event history.", href: "/audit", items: [{label:"Security Audit Log",href:"/audit"}] },
  ]},
  tools: { label: "Tools Hub", modules: [
    { id: "ai", label: "AI", description: "AI-assisted diagnostics, insights and self-audit tools.", href: "/ai", items: [{label:"AI Control Center",href:"/ai"},{label:"Financial Self-Audit",href:"/ai/self-audit"}] },
    { id: "documents", label: "Document Services", description: "Scanning, OCR, scan-fill and PDF workflows.", href: "/documents", items: [{label:"Scan",href:"/documents"},{label:"OCR",href:"/documents"},{label:"PDF",href:"/documents"}] },
    { id: "notifications", label: "Notifications", description: "Operational alerts and notification center.", href: "/notifications", items: [{label:"Notifications",href:"/notifications"}] },
  ]},
  admin: { label: "Admin Hub", modules: [
    { id: "staff", label: "Staff", description: "Staff accounts, roles and permissions.", href: "/staff", items: [{label:"Staff Accounts",href:"/staff"}] },
    { id: "security", label: "Security", description: "Authentication, 2FA and terminal security controls.", href: "/security", items: [{label:"Security & 2FA",href:"/security"}] },
    { id: "system", label: "System", description: "Store profile, themes and system automation.", href: "/settings", items: [{label:"Settings",href:"/settings"}] },
    { id: "integrations", label: "Integrations", description: "Connected service gateways and external portals.", href: "/business/whatsapp", items: [{label:"WhatsApp Gateway",href:"/business/whatsapp"},{label:"External Portals",href:"/business/portals"}] },
  ]},
};
