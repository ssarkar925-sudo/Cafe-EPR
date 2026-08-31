export type BadgeTone = "emerald" | "amber" | "indigo" | "purple" | "rose" | "slate" | "blue";

export type WorkingItem = {
  label: string;
  description?: string;
  href: string;
  shortcut?: string;
};

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
  description?: string;
  badge?: { text: string; tone: BadgeTone };
  keywords?: string[];
  children?: NavChild[];
  items?: WorkingItem[];
};

export type MainModule = NavItem;

export type NavHub = {
  id: string;
  title: string;
  label: string;
  description: string;
  icon: string;
  items: NavItem[];
  modules: MainModule[];
};

export type Hub = NavHub;

export const CANONICAL_HUBS: NavHub[] = [
  {
    id: "sales",
    title: "1. Sales Hub",
    label: "Sales Hub",
    description: "Counter sales, invoicing, customers & returns",
    icon: "◈",
    items: [
      {
        id: "pos",
        label: "POS Billing",
        description: "Full counter billing workstation with Invoice and Quick Sale modes",
        href: "/pos",
        icon: "pos",
        badge: { text: "F2 Fast", tone: "emerald" },
        keywords: ["pos", "point of sale", "quick sale", "billing", "counter", "checkout", "retail"],
        items: [
          { label: "Invoice Mode", href: "/pos", description: "Standard A4 & thermal POS counter billing" },
          { label: "Quick Sale Mode", href: "/pos?mode=quick", description: "F2 ultra-fast counter checkout" },
        ],
      },
      {
        id: "invoices",
        label: "Invoices & Sales",
        description: "Search, review and manage invoices and completed sales",
        href: "/invoices",
        icon: "invoices",
        keywords: ["invoices", "sales", "receipts", "orders", "credit sale", "history"],
        items: [
          { label: "All Invoices", href: "/invoices", description: "Complete sales and payment history" },
        ],
      },
      {
        id: "customers",
        label: "Customer Directory",
        description: "Customer directory, balances, khata ledger and credit controls",
        href: "/customers",
        icon: "customers",
        keywords: ["customers", "khata", "due", "crm", "balance", "credit limit", "accounts"],
        items: [
          { label: "Customer List & Khata", href: "/customers", description: "Manage customer ledgers and dues" },
        ],
      },
      {
        id: "returns",
        label: "Returns & Credit",
        description: "Refunds, returns and credit reversals",
        href: "/returns",
        icon: "returns",
        keywords: ["returns", "refunds", "credit note", "reversal", "exchange"],
        items: [
          { label: "Returns & Refunds", href: "/returns", description: "Process sales returns and credit vouchers" },
        ],
      },
    ],
    get modules() { return this.items; },
  },
  {
    id: "operations",
    title: "2. Operations Hub",
    label: "Operations Hub",
    description: "Catalog, inventory, purchases & suppliers",
    icon: "▦",
    items: [
      {
        id: "catalog",
        label: "Catalog Workspace",
        description: "Products, services, categories, brands and units",
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
        items: [
          { label: "Products", href: "/catalog/products", description: "Product inventory & stock prices" },
          { label: "Services", href: "/catalog/services", description: "Service rate card & quick items" },
          { label: "Categories", href: "/catalog/categories", description: "Hierarchical category tree" },
          { label: "Brands", href: "/catalog/brands", description: "Product manufacturer brands" },
          { label: "Units", href: "/catalog/units", description: "Units of measurement (Pcs, Box)" },
        ],
      },
      {
        id: "inventory",
        label: "Inventory & Stock",
        description: "Real-time stock valuation, stock movements and replenishment",
        href: "/inventory",
        icon: "inventory",
        keywords: ["inventory", "stock", "stock value", "reorder", "movements", "journal"],
        items: [
          { label: "Stock Overview", href: "/inventory", description: "Units on hand and replenishment alerts" },
          { label: "Stock Journal", href: "/inventory/movements", description: "Audit trail of inventory movements" },
        ],
      },
      {
        id: "purchases",
        label: "Purchases",
        description: "Procurement, vendor invoices and stock intake",
        href: "/purchases/entry",
        icon: "purchases",
        badge: { text: "WAC", tone: "blue" },
        keywords: ["purchases", "procurement", "stock in", "vendor invoices", "wac cost"],
        items: [
          { label: "Purchase Entry", href: "/purchases/entry", description: "Receive stock intake with WAC valuation" },
          { label: "Purchase History", href: "/purchases", description: "Review previous purchase vouchers" },
        ],
      },
      {
        id: "suppliers",
        label: "Suppliers",
        description: "Supplier directory, balances and procurement relationships",
        href: "/suppliers",
        icon: "suppliers",
        keywords: ["suppliers", "vendors", "payables", "distributors"],
        items: [
          { label: "Supplier Directory", href: "/suppliers", description: "Manage vendor accounts and balances" },
        ],
      },
    ],
    get modules() { return this.items; },
  },
  {
    id: "services",
    title: "3. Business Services Hub",
    label: "Business Services Hub",
    description: "Digital banking, BBPS utility bills & recharges",
    icon: "◎",
    items: [
      {
        id: "bill-payment",
        label: "Bill & Recharge",
        description: "All recharge and bill-payment workflows in one workspace",
        href: "/business/bill-payment",
        icon: "billPayment",
        badge: { text: "BBPS", tone: "indigo" },
        keywords: ["bill payment", "recharge", "mobile", "utility", "electricity", "google play", "dth", "bbps"],
        items: [
          { label: "Mobile Recharge", href: "/business/bill-payment?tab=recharge", description: "Prepaid & postpaid mobile top-ups" },
          { label: "Google Play Recharge", href: "/business/bill-payment?tab=google_play", description: "Play Store digital gift cards" },
          { label: "Utility Bills (BBPS)", href: "/business/bill-payment?tab=utility", description: "Electricity, Water, Gas & DTH" },
          { label: "Payment History", href: "/business/bill-payment?tab=history", description: "Audit trail of bill transactions" },
          { label: "Commission Rules", href: "/business/bill-payment?tab=commission", description: "Margin rules & overrides" },
        ],
      },
      {
        id: "aeps",
        label: "AEPS Cash Out",
        description: "Aadhaar biometric cash disbursements & portal float",
        href: "/business/aeps",
        icon: "aeps",
        keywords: ["aeps", "aadhaar", "biometric", "atm", "cash withdrawal", "cash out"],
        items: [
          { label: "AEPS Withdrawal", href: "/business/aeps", description: "Biometric cash out terminal" },
        ],
      },
      {
        id: "dmt",
        label: "Money Transfer (DMT)",
        description: "Domestic money remittance (IMPS / NEFT)",
        href: "/business/dmt",
        icon: "dmt",
        keywords: ["dmt", "money transfer", "remittance", "imps", "neft", "beneficiary"],
        items: [
          { label: "DMT Transfer", href: "/business/dmt", description: "Send remittances to any bank account" },
        ],
      },
      {
        id: "upi",
        label: "UPI Collections",
        description: "Dynamic QR scans & counter cash-out",
        href: "/business/upi",
        icon: "upi",
        keywords: ["upi", "qr", "soundbox", "merchant", "dynamic qr", "collections"],
        items: [
          { label: "UPI Counter", href: "/business/upi", description: "Counter QR collection and settlement" },
        ],
      },
    ],
    get modules() { return this.items; },
  },
  {
    id: "finance",
    title: "4. Finance Hub",
    label: "Finance Hub",
    description: "Ledgers, journal, trial balance, cashbook & P&L",
    icon: "₹",
    items: [
      {
        id: "finance-hub",
        label: "Finance Hub",
        description: "Financial command centre — 7-pool capital matrix & P&L",
        href: "/finance",
        icon: "pnl",
        badge: { text: "Dashboard", tone: "emerald" },
        keywords: ["finance", "treasury", "pool balance", "capital matrix", "summary"],
        items: [
          { label: "Finance Dashboard", href: "/finance", description: "7-Pool capital matrix and P&L summary" },
        ],
      },
      {
        id: "cashbook",
        label: "Daily Cash Book",
        description: "Continuous cash inflow and outflow audit",
        href: "/finance/cashbook",
        icon: "cashbook",
        keywords: ["cashbook", "cash drawer", "daily cash", "money in", "money out"],
        items: [
          { label: "Cash Book", href: "/finance/cashbook", description: "Daily physical cash ledger" },
        ],
      },
      {
        id: "journal",
        label: "Double-Entry Journal",
        description: "Authoritative double-entry ledger of all transactions",
        href: "/finance/journal",
        icon: "ledger",
        keywords: ["journal", "double entry", "debit", "credit", "cash entries", "postings"],
        items: [
          { label: "Master Journal", href: "/finance/journal", description: "Comprehensive debit/credit journal" },
        ],
      },
      {
        id: "trial-balance",
        label: "Trial Balance",
        description: "Auto-computed debits, credits & account balances",
        href: "/finance/trial-balance",
        icon: "transactions",
        keywords: ["trial balance", "balanced", "credits", "debits", "closing balances"],
        items: [
          { label: "Trial Balance Sheet", href: "/finance/trial-balance", description: "Debits, credits and balance verification" },
        ],
      },
      {
        id: "settlements",
        label: "Settlements & Float",
        description: "Bank-to-wallet, portal and liquid float transfers",
        href: "/finance/settlements",
        icon: "settlements",
        keywords: ["settlements", "transfers", "bank to wallet", "float transfer", "reconciliation"],
        items: [
          { label: "Settlement Operations", href: "/finance/settlements", description: "Internal pool fund transfers" },
        ],
      },
      {
        id: "expenses",
        label: "Expense Ledger",
        description: "Categorized store operating costs & vouchers",
        href: "/finance/expenses",
        icon: "expenses",
        keywords: ["expenses", "operational costs", "rent", "electricity", "vouchers"],
        items: [
          { label: "Expense Vouchers", href: "/finance/expenses", description: "Log and review store expenses" },
        ],
      },
      {
        id: "pnl",
        label: "Profit & Loss (P&L)",
        description: "Operating revenue, COGS, gross & net margins",
        href: "/finance/pnl",
        icon: "salesreport",
        keywords: ["pnl", "profit", "loss", "net profit", "gross margin", "revenue", "cogs"],
        items: [
          { label: "P&L Statement", href: "/finance/pnl", description: "Income statement and margin drill-downs" },
        ],
      },
      {
        id: "reconciliation",
        label: "Reconciliation",
        description: "Idempotent multi-account integrity check",
        href: "/finance/reconciliation",
        icon: "dayclose",
        keywords: ["reconciliation", "audit", "account check", "variance", "idempotent"],
        items: [
          { label: "Account Reconciliation", href: "/finance/reconciliation", description: "Verify account ledger balances" },
        ],
      },
      {
        id: "opening-balances",
        label: "Opening Balances",
        description: "Seed opening liquid cash, bank and service floats",
        href: "/finance/opening-balances",
        icon: "opening",
        keywords: ["opening balance", "starting cash", "seed balance", "account setup"],
        items: [
          { label: "Opening Position Studio", href: "/finance/opening-balances", description: "Configure account seeds" },
        ],
      },
      {
        id: "day-close",
        label: "Day Close & Rollover",
        description: "Daily cash count, profit lock and date rollover",
        href: "/finance/day-close",
        icon: "dayclose",
        keywords: ["day close", "eod", "daily lock", "shift close", "cash count"],
        items: [
          { label: "End-of-Day Close", href: "/finance/day-close", description: "Lock daily books and verify counts" },
        ],
      },
      {
        id: "accounts",
        label: "Payment Accounts",
        description: "Liquid cash, bank accounts, cards and portal float accounts",
        href: "/finance/accounts",
        icon: "banks",
        keywords: ["accounts", "bank accounts", "wallets", "payment instruments", "cards"],
        items: [
          { label: "Account Registry", href: "/finance/accounts", description: "Configure payment instruments" },
        ],
      },
    ],
    get modules() { return this.items; },
  },
  {
    id: "reports",
    title: "5. Reports Hub",
    label: "Reports Hub",
    description: "Business analytics, GST statutory returns & audit",
    icon: "◫",
    items: [
      {
        id: "reports-studio",
        label: "Reports Studio",
        description: "Sales, margins, activity and operational reports",
        href: "/reports",
        icon: "reports",
        keywords: ["reports", "sales report", "business analytics", "item performance"],
        items: [
          { label: "Reports Studio", href: "/reports", description: "Custom reports and analytical dashboards" },
        ],
      },
      {
        id: "gst",
        label: "GST Reports",
        description: "Statutory GSTR-1 & GSTR-3B outward tax summaries",
        href: "/reports/gst",
        icon: "gst",
        keywords: ["gst", "gstr-1", "gstr-3b", "tax reports", "hsn summary", "cgst", "sgst"],
        items: [
          { label: "GST Summary", href: "/reports/gst", description: "Monthly and quarterly GST filings" },
        ],
      },
      {
        id: "tax-prep",
        label: "Tax Preparation / ITR",
        description: "CA-ready Section 44AD / 40A(3) financial audit pack",
        href: "/reports/tax-preparation",
        icon: "tax",
        keywords: ["tax prep", "itr", "44ad", "balance sheet", "ca audit pack"],
        items: [
          { label: "ITR Pack", href: "/reports/tax-preparation", description: "Year-end tax audit report" },
        ],
      },
      {
        id: "audit-log",
        label: "Security Audit Log",
        description: "Immutable operational and security event history",
        href: "/audit",
        icon: "audit",
        keywords: ["audit log", "event history", "security events", "tamper-evident"],
        items: [
          { label: "Audit Trail", href: "/audit", description: "View security and system events" },
        ],
      },
    ],
    get modules() { return this.items; },
  },
  {
    id: "tools",
    title: "6. Tools Hub",
    label: "Tools Hub",
    description: "AI Advisor, diagnostic engines & automated audit",
    icon: "✦",
    items: [
      {
        id: "ai",
        label: "AI Control Center",
        description: "Smart diagnostic & business insights",
        href: "/ai",
        icon: "ai",
        badge: { text: "Smart", tone: "purple" },
        keywords: ["ai", "advisor", "intelligence", "diagnostics", "recommendations"],
        items: [
          { label: "AI Advisor", href: "/ai", description: "Interactive business recommendations" },
        ],
      },
      {
        id: "self-audit",
        label: "Financial Self-Audit",
        description: "Automated 14-point invariant integrity checks",
        href: "/ai/self-audit",
        icon: "audit",
        badge: { text: "14-pt", tone: "emerald" },
        keywords: ["self-audit", "invariants", "balance integrity", "automated audit", "checks"],
        items: [
          { label: "Self-Audit Engine", href: "/ai/self-audit", description: "Run automated accounting checks" },
        ],
      },
    ],
    get modules() { return this.items; },
  },
  {
    id: "admin",
    title: "7. Admin Hub",
    label: "Admin Hub",
    description: "Staff RBAC, security settings & system configuration",
    icon: "⚙",
    items: [
      {
        id: "staff",
        label: "Staff Accounts",
        description: "Team accounts, roles and RBAC security permissions",
        href: "/staff",
        icon: "staff",
        keywords: ["staff", "employees", "team", "roles", "rbac", "permissions"],
        items: [
          { label: "Staff Directory", href: "/staff", description: "Manage operators and manager roles" },
        ],
      },
      {
        id: "security",
        label: "Security & 2FA",
        description: "Credentials, TOTP 2FA & terminal auto-lock",
        href: "/security",
        icon: "security",
        keywords: ["security", "2fa", "pin", "passwords", "terminal lock"],
        items: [
          { label: "Security Center", href: "/security", description: "2FA, PIN and terminal locks" },
        ],
      },
      {
        id: "settings",
        label: "System Settings",
        description: "Store profile, themes & automation preferences",
        href: "/settings",
        icon: "settings",
        keywords: ["settings", "shop profile", "tax settings", "themes", "preferences", "whatsapp"],
        items: [
          { label: "Store Configuration", href: "/settings", description: "General settings, themes and receipt formatting" },
        ],
      },
    ],
    get modules() { return this.items; },
  },
];

export const ALL_FLAT_NAV_ITEMS: NavItem[] = CANONICAL_HUBS.flatMap((hub) => hub.items);

export function getHub(id: string): NavHub | undefined {
  return CANONICAL_HUBS.find((h) => h.id === id || h.id.replace("-", "") === id.replace("-", ""));
}

export function getModule(hubId: string, moduleId: string): NavItem | undefined {
  return getHub(hubId)?.items.find((m) => m.id === moduleId);
}

export const HUBS = CANONICAL_HUBS;

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
