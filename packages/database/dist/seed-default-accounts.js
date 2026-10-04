/**
 * packages/database/src/seed-default-accounts.ts
 * Standard initial Chart of Accounts & Treasury Pools for Sarkar Communication.
 */
export const DEFAULT_ACCOUNTS_SEED = [
    // 1. Physical Cash
    { code: "1010", name: "Shop Physical Cash Drawer", type: "CASH" },
    // 2. Bank Accounts
    {
        code: "1020-SBI",
        name: "SBI Current Account",
        type: "BANK",
        metadata: { bankName: "State Bank of India", maskedNumber: "****8921" },
    },
    {
        code: "1021-HDFC",
        name: "HDFC Business Account",
        type: "BANK",
        metadata: { bankName: "HDFC Bank", maskedNumber: "****4012" },
    },
    // 3. Merchant UPI QR Holdings (Unsettled Funds)
    {
        code: "1031-PHONEPE",
        name: "PhonePe Merchant QR Holding",
        type: "UPI_HOLDING",
        metadata: { provider: "PhonePe", qrIdentifier: "PHONEPE_PRIMARY" },
    },
    {
        code: "1032-PAYTM",
        name: "Paytm All-in-One QR Holding",
        type: "UPI_HOLDING",
        metadata: { provider: "Paytm", qrIdentifier: "PAYTM_ALL_IN_ONE" },
    },
    {
        code: "1033-GPAY",
        name: "Google Pay Merchant Holding",
        type: "UPI_HOLDING",
        metadata: { provider: "Google Pay", qrIdentifier: "GPAY_BUSINESS" },
    },
    // 4. Portal Wallets & Floats
    {
        code: "1041-PAYNEARBY",
        name: "PayNearby Portal Float",
        type: "WALLET",
        metadata: { portal: "PayNearby" },
    },
    {
        code: "1042-SPICEMONEY",
        name: "Spice Money Float",
        type: "WALLET",
        metadata: { portal: "Spice Money" },
    },
    {
        code: "1043-CSC",
        name: "CSC Digipay Wallet",
        type: "WALLET",
        metadata: { portal: "CSC" },
    },
    {
        code: "1044-JIOPOS",
        name: "JioPOS Plus Balance",
        type: "WALLET",
        metadata: { portal: "JioPOS" },
    },
    // 5. Credit Cards (Liabilities)
    {
        code: "2010-HDFC-CARD",
        name: "HDFC Millennia Credit Card",
        type: "CREDIT_CARD",
        metadata: {
            cardNetwork: "VISA",
            creditLimitPaisa: 20000000n, // ₹2,00,000
            billingDay: 15,
            dueDay: 5,
        },
    },
    {
        code: "2011-SBI-CARD",
        name: "SBI SimplyCLICK Credit Card",
        type: "CREDIT_CARD",
        metadata: {
            cardNetwork: "VISA",
            creditLimitPaisa: 10000000n, // ₹1,00,000
            billingDay: 18,
            dueDay: 8,
        },
    },
    // 6. Khata Receivable
    { code: "1300", name: "Customer Khata Receivable", type: "KHATA" },
    // 7. Revenues & Commissions
    { code: "4000", name: "Xerox, Print & Retail Sales Revenue", type: "INCOME" },
    { code: "4100", name: "Digital Services Commission Revenue", type: "INCOME" },
    { code: "4210", name: "Cash Overage Variance Gain", type: "INCOME" },
    // 8. Cost & Expenses
    { code: "5000", name: "Direct Consumables (Paper, Toner, Ink)", type: "EXPENSE" },
    { code: "5010", name: "Portal IMPS Payout Charges", type: "EXPENSE" },
    { code: "5210", name: "Cash Shortage Variance Expense", type: "EXPENSE" },
    { code: "6000", name: "Shop Rent, Power & Internet", type: "EXPENSE" },
    { code: "6100", name: "Owner Drawings", type: "EXPENSE" },
];
