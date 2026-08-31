export type WorkingItem = {
  label: string;
  description: string;
  href: string;
  shortcut?: string;
};

export type MainModule = {
  id: string;
  label: string;
  description: string;
  items: WorkingItem[];
};

export type Hub = {
  id: string;
  label: string;
  description: string;
  icon: string;
  modules: MainModule[];
};

export const HUBS: Hub[] = [
  {
    id: "sales",
    label: "Sales Hub",
    description: "Billing, sales, customers and returns",
    icon: "◈",
    modules: [
      { id: "sales", label: "Sales", description: "Counter billing and completed sales", items: [
        { label: "POS", description: "Full counter billing workstation", href: "/pos", shortcut: "F2" },
        { label: "Quick Sale", description: "Fast product and service billing", href: "/pos?mode=quick" },
        { label: "Invoices & Sales", description: "Search, review and manage invoices", href: "/invoices" },
        { label: "Receipt / PDF", description: "Receipts and printable sales documents", href: "/invoices" },
      ]},
      { id: "customers", label: "Customers", description: "Customer relationships and credit", items: [
        { label: "Customer Directory", description: "Customer profiles and history", href: "/customers" },
        { label: "Customer Dues", description: "Outstanding balances and collections", href: "/customers" },
        { label: "Credit Limits", description: "Customer credit controls", href: "/customers" },
      ]},
      { id: "returns", label: "Returns", description: "Refunds, returns and credit", items: [
        { label: "Returns & Credit", description: "Process returns and reversal vouchers", href: "/returns" },
      ]},
    ],
  },
  {
    id: "operations",
    label: "Operations Hub",
    description: "Catalog, stock, purchasing and suppliers",
    icon: "▦",
    modules: [
      { id: "catalog", label: "Catalog", description: "Products, services and master data", items: [
        { label: "Products", description: "Manage product catalog", href: "/catalog/products" },
        { label: "Services", description: "Manage service rate cards", href: "/catalog/services" },
        { label: "Categories", description: "Organize catalog hierarchy", href: "/catalog/categories" },
        { label: "Brands", description: "Manage product brands", href: "/catalog/brands" },
        { label: "Units", description: "Manage units of measure", href: "/catalog/units" },
      ]},
      { id: "inventory", label: "Inventory", description: "Stock control and movement history", items: [
        { label: "Inventory & Stock", description: "Stock levels, valuation and reorder control", href: "/inventory" },
        { label: "Stock Movements", description: "Audit every stock movement", href: "/inventory/movements" },
      ]},
      { id: "purchases", label: "Purchases", description: "Procurement and supplier intake", items: [
        { label: "Purchases", description: "Review supplier purchases", href: "/purchases" },
        { label: "Purchase Entry", description: "Record new stock procurement", href: "/purchases/entry" },
      ]},
      { id: "suppliers", label: "Suppliers", description: "Vendors and accounts payable", items: [
        { label: "Suppliers", description: "Supplier directory and profiles", href: "/suppliers" },
        { label: "Accounts Payable", description: "Supplier balances and obligations", href: "/suppliers" },
      ]},
    ],
  },
  {
    id: "business-services",
    label: "Business Services Hub",
    description: "Digital, financial, recharge and payment services",
    icon: "◎",
    modules: [
      { id: "financial-services", label: "Financial Services", description: "Assisted financial transactions", items: [
        { label: "AEPS", description: "Aadhaar-enabled cash services", href: "/business/aeps" },
        { label: "DMT", description: "Domestic money transfer", href: "/business/dmt" },
        { label: "UPI", description: "UPI collection workflows", href: "/business/upi" },
      ]},
      { id: "bill-recharge", label: "Bill & Recharge", description: "Recharge and bill payment services", items: [
        { label: "Bill Payment", description: "Utility and assisted bill payments", href: "/business/bill-payment" },
        { label: "Mobile Recharge", description: "Prepaid, postpaid and DTH", href: "/business/recharge" },
        { label: "Recharge Plans", description: "Plan and operator management", href: "/business/recharge/plans" },
        { label: "Utility Bills", description: "Utility bill service workflows", href: "/business/bills" },
        { label: "Google Play", description: "Google Play top-up services", href: "/business/google-play" },
      ]},
      { id: "service-network", label: "Service Network", description: "Portals, banks and merchant QR", items: [
        { label: "Service Portals", description: "Connected service providers and portals", href: "/business/portals" },
        { label: "Banks", description: "Bank accounts and treasury float", href: "/business/banks" },
        { label: "Merchant QRs", description: "Merchant QR profiles", href: "/business/merchant-qrs" },
      ]},
      { id: "communication", label: "Communication", description: "Customer communication workflows", items: [
        { label: "WhatsApp", description: "WhatsApp operational messaging", href: "/business/whatsapp" },
      ]},
    ],
  },
  {
    id: "finance",
    label: "Finance Hub",
    description: "Accounts, cash, settlements, profit and closing",
    icon: "₹",
    modules: [
      { id: "accounts", label: "Accounts", description: "Core accounting records", items: [
        { label: "Accounts", description: "Chart and financial accounts", href: "/finance" },
        { label: "Ledger", description: "Double-entry account ledgers", href: "/finance/ledger" },
        { label: "Journal", description: "Journal entries and adjustments", href: "/finance/journal" },
        { label: "Trial Balance", description: "Debit and credit control", href: "/finance/trial-balance" },
      ]},
      { id: "cash-bank", label: "Cash & Bank", description: "Liquidity and movement control", items: [
        { label: "Cashbook", description: "Daily cash inflow and outflow", href: "/finance/cashbook" },
        { label: "Payment Instruments", description: "Cash, bank and digital instruments", href: "/finance/accounts" },
        { label: "Reconciliation", description: "Match and clear financial movements", href: "/finance/reconciliation" },
        { label: "Settlements", description: "Bank, wallet and float settlements", href: "/finance/settlements" },
      ]},
      { id: "profit-loss", label: "Profit & Loss", description: "Business profitability", items: [
        { label: "P&L", description: "Income, COGS and net profit", href: "/finance/pnl" },
      ]},
      { id: "expenses", label: "Expenses", description: "Operating costs", items: [
        { label: "Expense Ledger", description: "Categorized operating expenses", href: "/finance/expenses" },
      ]},
      { id: "closing", label: "Closing", description: "Period opening and end-of-day control", items: [
        { label: "Opening Balances", description: "Seed opening cash and floats", href: "/finance/opening-balances" },
        { label: "Day Close", description: "Reconcile and lock the daily book", href: "/finance/day-close" },
      ]},
    ],
  },
  {
    id: "reports",
    label: "Reports Hub",
    description: "Business intelligence, tax and audit reporting",
    icon: "◫",
    modules: [
      { id: "business-reports", label: "Business Reports", description: "Performance and operational analytics", items: [
        { label: "Reports Studio", description: "Sales, margins and activity reports", href: "/reports" },
      ]},
      { id: "tax", label: "Tax", description: "GST and tax preparation", items: [
        { label: "GST Reports", description: "GSTR-1 and GSTR-3B summaries", href: "/reports/gst" },
        { label: "Tax Preparation / ITR", description: "CA-ready financial preparation", href: "/reports/tax-preparation" },
      ]},
      { id: "audit", label: "Audit", description: "Security and operational history", items: [
        { label: "Security Audit Log", description: "Immutable operational event history", href: "/audit" },
      ]},
    ],
  },
  {
    id: "tools",
    label: "Tools Hub",
    description: "AI intelligence, document tools and notifications",
    icon: "✦",
    modules: [
      { id: "ai", label: "AI", description: "Business intelligence and automation", items: [
        { label: "AI Control Center", description: "AI business command center", href: "/ai" },
        { label: "AI Advisor", description: "Business insights and recommendations", href: "/ai/advisor" },
        { label: "AI Accountant", description: "Accounting assistance", href: "/ai/accountant" },
        { label: "AI Self-Audit", description: "Automated financial integrity checks", href: "/ai/self-audit" },
        { label: "Audit AI", description: "AI-assisted audit diagnostics", href: "/ai/audit" },
        { label: "Customer Intelligence", description: "Customer behavior insights", href: "/ai/customer-intelligence" },
        { label: "Diagnostics", description: "System and business diagnostics", href: "/ai/diagnostics" },
        { label: "Financial Integrity", description: "Financial consistency controls", href: "/ai/financial-integrity" },
        { label: "Inventory Auditor", description: "AI-assisted stock audit", href: "/ai/inventory-auditor" },
        { label: "Periodic Closing", description: "Closing workflow assistance", href: "/ai/periodic-closing" },
        { label: "AI Reconciliation", description: "AI-assisted reconciliation", href: "/ai/reconciliation" },
        { label: "AI Vault", description: "Secure AI workspace", href: "/ai/vault" },
      ]},
      { id: "documents", label: "Document Services", description: "Scan, extract, fill and produce documents", items: [
        { label: "Document Scan", description: "Capture and prepare documents", href: "/documents/scan" },
        { label: "OCR", description: "Extract text and structured data", href: "/documents/ocr" },
        { label: "Scan-Fill", description: "Turn scanned documents into workflows", href: "/documents/scan-fill" },
        { label: "PDF Tools", description: "Create and process PDF documents", href: "/documents/pdf" },
      ]},
      { id: "notifications", label: "Notifications", description: "Operational alerts and messages", items: [
        { label: "Notifications", description: "View and manage application notifications", href: "/notifications" },
      ]},
    ],
  },
  {
    id: "admin",
    label: "Admin Hub",
    description: "People, security, system settings and integrations",
    icon: "⚙",
    modules: [
      { id: "staff", label: "Staff", description: "Team accounts and permissions", items: [
        { label: "Staff Accounts", description: "Manage staff users", href: "/staff" },
        { label: "Roles & Permissions", description: "Control access by role", href: "/staff" },
      ]},
      { id: "security", label: "Security", description: "Account and terminal protection", items: [
        { label: "Security & 2FA", description: "Credentials, TOTP and terminal lock", href: "/security" },
      ]},
      { id: "system", label: "System", description: "Store-wide configuration", items: [
        { label: "System Settings", description: "Core application configuration", href: "/settings" },
        { label: "Store Profile", description: "Shop identity and branding", href: "/settings" },
        { label: "Themes", description: "Application appearance", href: "/settings" },
        { label: "Automation", description: "System automation settings", href: "/settings" },
      ]},
      { id: "integrations", label: "Integrations", description: "Connected communication and service systems", items: [
        { label: "WhatsApp Gateway", description: "WhatsApp integration controls", href: "/business/whatsapp" },
        { label: "External Portals", description: "Connected external service systems", href: "/business/portals" },
      ]},
      { id: "access", label: "Security & Access", description: "Authentication and user access", items: [
        { label: "Login / Session / Profile", description: "Authentication and account access", href: "/login" },
      ]},
    ],
  },
];

export function getHub(id: string) {
  return HUBS.find((hub) => hub.id === id);
}

export function getModule(hubId: string, moduleId: string) {
  return getHub(hubId)?.modules.find((module) => module.id === moduleId);
}
