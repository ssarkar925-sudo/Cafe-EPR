export type BadgeTone = "emerald" | "amber" | "indigo" | "purple" | "rose" | "slate" | "blue";

export type NavChild = {
  id: string;
  label: string;
  href: string;
  icon?: string;
  badge?: { text: string; tone: BadgeTone };
  keywords?: string[];
};

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
  badge?: { text: string; tone: BadgeTone };
  keywords?: string[];
  children?: NavChild[];
};

export type NavHub = {
  id: string;
  title: string;
  description: string;
  items: NavItem[];
};

export const CANONICAL_HUBS: NavHub[] = [
  {
    id: "sales",
    title: "1. Sales Hub",
    description: "Counter sales, invoicing, customers & returns",
    items: [
      {
        id: "pos",
        label: "POS Billing",
        href: "/pos",
        icon: "pos",
        badge: { text: "F2 Fast", tone: "emerald" },
        keywords: ["pos", "point of sale", "quick sale", "billing", "counter", "checkout", "retail"],
      },
      {
        id: "invoices",
        label: "Invoices & Sales",
        href: "/invoices",
        icon: "invoices",
        keywords: ["invoices", "sales", "receipts", "orders", "credit sale", "history"],
      },
      {
        id: "customers",
        label: "Customer Directory",
        href: "/customers",
        icon: "customers",
        keywords: ["customers", "khata", "due", "crm", "balance", "credit limit", "accounts"],
      },
      {
        id: "returns",
        label: "Returns & Credit",
        href: "/returns",
        icon: "returns",
        keywords: ["returns", "refunds", "credit note", "reversal", "exchange"],
      },
    ],
  },
  {
    id: "operations",
    title: "2. Operations Hub",
    description: "Catalog, inventory, purchases & suppliers",
    items: [
      {
        id: "catalog",
        label: "Catalog Workspace",
        href: "/catalog/products",
        icon: "products",
        keywords: ["catalog", "products", "services", "categories", "brands", "units"],
        children: [
          { id: "products", label: "Products", href: "/catalog/products" },
          { id: "services", label: "Services", href: "/catalog/services" },
          { id: "categories", label: "Categories", href: "/catalog/categories" },
          { id: "brands", label: "Brands", href: "/catalog/brands" },
          { id: "units", label: "Units", href: "/catalog/units" },
        ],
      },
      {
        id: "inventory",
        label: "Inventory & Stock",
        href: "/inventory",
        icon: "inventory",
        keywords: ["inventory", "stock", "stock value", "reorder", "movements", "journal"],
      },
      {
        id: "purchases",
        label: "Purchases",
        href: "/purchases/entry",
        icon: "purchases",
        badge: { text: "WAC", tone: "blue" },
        keywords: ["purchases", "procurement", "stock in", "vendor invoices", "wac cost"],
      },
      {
        id: "suppliers",
        label: "Suppliers",
        href: "/suppliers",
        icon: "suppliers",
        keywords: ["suppliers", "vendors", "payables", "distributors"],
      },
    ],
  },
  {
    id: "services",
    title: "3. Business Services Hub",
    description: "Digital banking, BBPS utility bills & recharges",
    items: [
      {
        id: "bill-payment",
        label: "Bill & Recharge",
        href: "/business/bill-payment",
        icon: "billPayment",
        badge: { text: "BBPS", tone: "indigo" },
        keywords: ["bill payment", "recharge", "mobile", "utility", "electricity", "google play", "dth", "bbps"],
      },
      {
        id: "aeps",
        label: "AEPS Cash Out",
        href: "/business/aeps",
        icon: "aeps",
        keywords: ["aeps", "aadhaar", "biometric", "atm", "cash withdrawal", "cash out"],
      },
      {
        id: "dmt",
        label: "Money Transfer (DMT)",
        href: "/business/dmt",
        icon: "dmt",
        keywords: ["dmt", "money transfer", "remittance", "imps", "neft", "beneficiary"],
      },
      {
        id: "upi",
        label: "UPI Collections",
        href: "/business/upi",
        icon: "upi",
        keywords: ["upi", "qr", "soundbox", "merchant", "dynamic qr", "collections"],
      },
    ],
  },
  {
    id: "finance",
    title: "4. Finance Hub",
    description: "Ledgers, journal, trial balance, cashbook & P&L",
    items: [
      {
        id: "finance-hub",
        label: "Finance Hub",
        href: "/finance",
        icon: "pnl",
        badge: { text: "Dashboard", tone: "emerald" },
        keywords: ["finance", "treasury", "pool balance", "capital matrix", "summary"],
      },
      {
        id: "cashbook",
        label: "Daily Cash Book",
        href: "/finance/cashbook",
        icon: "cashbook",
        keywords: ["cashbook", "cash drawer", "daily cash", "money in", "money out"],
      },
      {
        id: "journal",
        label: "Double-Entry Journal",
        href: "/finance/journal",
        icon: "ledger",
        keywords: ["journal", "double entry", "debit", "credit", "cash entries", "postings"],
      },
      {
        id: "trial-balance",
        label: "Trial Balance",
        href: "/finance/trial-balance",
        icon: "transactions",
        keywords: ["trial balance", "balanced", "credits", "debits", "closing balances"],
      },
      {
        id: "settlements",
        label: "Settlements & Float",
        href: "/finance/settlements",
        icon: "settlements",
        keywords: ["settlements", "transfers", "bank to wallet", "float transfer", "reconciliation"],
      },
      {
        id: "expenses",
        label: "Expense Ledger",
        href: "/finance/expenses",
        icon: "expenses",
        keywords: ["expenses", "operational costs", "rent", "electricity", "vouchers"],
      },
      {
        id: "pnl",
        label: "Profit & Loss (P&L)",
        href: "/finance/pnl",
        icon: "salesreport",
        keywords: ["pnl", "profit", "loss", "net profit", "gross margin", "revenue", "cogs"],
      },
      {
        id: "reconciliation",
        label: "Reconciliation",
        href: "/finance/reconciliation",
        icon: "dayclose",
        keywords: ["reconciliation", "audit", "account check", "variance", "idempotent"],
      },
      {
        id: "opening-balances",
        label: "Opening Balances",
        href: "/finance/opening-balances",
        icon: "opening",
        keywords: ["opening balance", "starting cash", "seed balance", "account setup"],
      },
      {
        id: "day-close",
        label: "Day Close & Rollover",
        href: "/finance/day-close",
        icon: "dayclose",
        keywords: ["day close", "eod", "daily lock", "shift close", "cash count"],
      },
      {
        id: "accounts",
        label: "Payment Accounts",
        href: "/finance/accounts",
        icon: "banks",
        keywords: ["accounts", "bank accounts", "wallets", "payment instruments", "cards"],
      },
    ],
  },
  {
    id: "reports",
    title: "5. Reports Hub",
    description: "Business analytics, GST statutory returns & audit",
    items: [
      {
        id: "reports-studio",
        label: "Reports Studio",
        href: "/reports",
        icon: "reports",
        keywords: ["reports", "sales report", "business analytics", "item performance"],
      },
      {
        id: "gst",
        label: "GST Reports",
        href: "/reports/gst",
        icon: "gst",
        keywords: ["gst", "gstr-1", "gstr-3b", "tax reports", "hsn summary", "cgst", "sgst"],
      },
      {
        id: "tax-prep",
        label: "Tax Preparation / ITR",
        href: "/reports/tax-preparation",
        icon: "tax",
        keywords: ["tax prep", "itr", "44ad", "balance sheet", "ca audit pack"],
      },
      {
        id: "audit-log",
        label: "Security Audit Log",
        href: "/audit",
        icon: "audit",
        keywords: ["audit log", "event history", "security events", "tamper-evident"],
      },
    ],
  },
  {
    id: "tools",
    title: "6. Tools Hub",
    description: "AI Advisor, diagnostic engines & automated audit",
    items: [
      {
        id: "ai",
        label: "AI Control Center",
        href: "/ai",
        icon: "ai",
        badge: { text: "Smart", tone: "purple" },
        keywords: ["ai", "advisor", "intelligence", "diagnostics", "recommendations"],
      },
      {
        id: "self-audit",
        label: "Financial Self-Audit",
        href: "/ai/self-audit",
        icon: "audit",
        badge: { text: "14-pt", tone: "emerald" },
        keywords: ["self-audit", "invariants", "balance integrity", "automated audit", "checks"],
      },
    ],
  },
  {
    id: "admin",
    title: "7. Admin Hub",
    description: "Staff RBAC, security settings & system configuration",
    items: [
      {
        id: "staff",
        label: "Staff Accounts",
        href: "/staff",
        icon: "staff",
        keywords: ["staff", "employees", "team", "roles", "rbac", "permissions"],
      },
      {
        id: "security",
        label: "Security & 2FA",
        href: "/security",
        icon: "security",
        keywords: ["security", "2fa", "pin", "passwords", "terminal lock"],
      },
      {
        id: "settings",
        label: "System Settings",
        href: "/settings",
        icon: "settings",
        keywords: ["settings", "shop profile", "tax settings", "themes", "preferences", "whatsapp"],
      },
    ],
  },
];

export const ALL_FLAT_NAV_ITEMS: NavItem[] = CANONICAL_HUBS.flatMap((hub) => hub.items);

export const PAGE_TITLES: Record<string, { title: string; desc: string }> = {
  "/dashboard": { title: "Executive Dashboard", desc: "Real-time store metrics & counter telemetry" },
  "/pos": { title: "Point of Sale (POS)", desc: "High-speed retail & services billing counter" },
  "/invoices": { title: "Invoices & Sales", desc: "Comprehensive sales ledger & customer receipts" },
  "/customers": { title: "Customer Directory", desc: "CRM, dues tracking & credit limits" },
  "/returns": { title: "Returns & Credit", desc: "Item returns, refunds & reversal vouchers" },
  "/catalog": { title: "Catalog Workspace", desc: "Products, services & categorization" },
  "/catalog/products": { title: "Products Catalog", desc: "Inventory catalog with stock tracking" },
  "/catalog/services": { title: "Services Catalog", desc: "Cybercafe & digital service rate card" },
  "/catalog/categories": { title: "Categories Tree", desc: "Hierarchy grouping for POS fast-keys" },
  "/catalog/brands": { title: "Brands", desc: "Product brand masters" },
  "/catalog/units": { title: "Units of Measure", desc: "Pcs, sheets, packets, kg" },
  "/inventory": { title: "Inventory & Stock", desc: "Real-time stock valuation & replenishment" },
  "/inventory/movements": { title: "Stock Journal", desc: "Audit log of all stock movements" },
  "/purchases": { title: "Purchases", desc: "Vendor invoices & stock intake" },
  "/purchases/entry": { title: "Purchase Entry", desc: "Record supplier stock procurement (WAC)" },
  "/suppliers": { title: "Suppliers", desc: "Vendor directory & accounts payable" },
  "/business": { title: "Business Services Hub", desc: "AEPS, DMT, UPI & digital services" },
  "/business/bill-payment": { title: "Bill & Recharge Hub", desc: "BBPS utility bill payments & mobile/DTH top-ups" },
  "/business/aeps": { title: "AEPS Cash Out", desc: "Aadhaar cash disbursements & portal float" },
  "/business/dmt": { title: "Money Transfer (DMT)", desc: "IMPS / NEFT domestic remittances" },
  "/business/upi": { title: "UPI Collections", desc: "Dynamic QR scans & counter cash-out" },
  "/business/banks": { title: "Bank Accounts", desc: "Commercial banks & treasury float" },
  "/business/portals": { title: "Service Portals", desc: "PayNearby, SpiceMoney, CSC portals" },
  "/business/merchant-qrs": { title: "Merchant QRs", desc: "Active POS counter QR profiles" },
  "/finance": { title: "Finance Hub", desc: "Financial command centre — 7-pool capital matrix & P&L" },
  "/finance/cashbook": { title: "Daily Cash Book", desc: "Continuous cash inflow/outflow audit" },
  "/finance/journal": { title: "Double-Entry Journal", desc: "Authoritative double-entry ledger" },
  "/finance/trial-balance": { title: "Trial Balance", desc: "Auto-computed debits, credits & account balances" },
  "/finance/settlements": { title: "Settlements & Float", desc: "Bank-to-wallet & float transfers" },
  "/finance/expenses": { title: "Expense Ledger", desc: "Categorized store operating costs" },
  "/finance/pnl": { title: "Profit & Loss (P&L)", desc: "Operating income, COGS & net profit" },
  "/finance/reconciliation": { title: "Reconciliation", desc: "Idempotent multi-account integrity check" },
  "/finance/opening-balances": { title: "Opening Balances", desc: "Seed opening liquid cash & floats" },
  "/finance/day-close": { title: "End-of-Day Close", desc: "Cash reconciliation & daily book lock" },
  "/finance/ledger": { title: "Account Ledgers", desc: "Double-entry party ledgers" },
  "/finance/accounts": { title: "Payment Accounts", desc: "Liquid cash, bank accounts, cards & float" },
  "/reports": { title: "Reports Studio", desc: "Sales, margins & activity reports" },
  "/reports/gst": { title: "GST Reports", desc: "GSTR-1, GSTR-3B tax summaries" },
  "/reports/tax-preparation": { title: "Tax Prep / ITR", desc: "CA-ready audited financial pack" },
  "/audit": { title: "Security Audit Log", desc: "Immutable operational event history" },
  "/ai": { title: "AI Control Center", desc: "Smart diagnostic & business insights" },
  "/ai/self-audit": { title: "Financial Self-Audit", desc: "Automated 14-point invariant checks" },
  "/staff": { title: "Staff Accounts", desc: "Team roles & security permissions" },
  "/security": { title: "Security & 2FA", desc: "Credentials, TOTP 2FA & terminal auto-lock" },
  "/settings": { title: "System Settings", desc: "Store profile, themes & automation" },
};
