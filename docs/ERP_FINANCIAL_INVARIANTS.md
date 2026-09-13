# CafeERP — ERP Financial Invariants & Accounting Specification

**Document Version:** 2.0 (Post-Hardening Production Standard)  
**Verification Status:** 1,587 / 1,587 Automated Financial Tests Passing  
**Governing Standard:** Indian GAAP / Double-Entry Ledger System  

---

## 1. Core Chart of Accounts (COA) Standard

CafeERP implements a strict 4-digit hierarchical Chart of Accounts spanning all retail, banking, inventory, and expense operations:

| Code Range | Category | Normal Balance | Primary Accounts |
| :--- | :--- | :--- | :--- |
| **1000 – 1999** | **Assets** | **Debit** | `1000` Cash Drawer (Till), `1010` Commercial Bank Accounts, `1020` UPI / QR Receivables, `1030` Digital Wallets, `1040` AEPS Float Pool, `1050` DMT Settlement Float, `1060` Credit Card Receivables, `1200` Merchandise Inventory, `1300` Accounts Receivable (Khata), `1400` Business Clearing Account |
| **2000 – 2999** | **Liabilities**| **Credit** | `2000` Accounts Payable (Suppliers), `2100` GST Output Tax Payable (CGST/SGST/IGST), `2300` Customer Advances (Prepaid Deposits) |
| **3000 – 3999** | **Equity** | **Credit** | `3000` Owner Capital Seed, `3100` Retained Earnings |
| **4000 – 4999** | **Revenue** | **Credit** | `4000` Product Retail Sales Revenue, `4010` Service Operations Revenue, `4020` Customer Service Fees, `4030` Portal / BBPS Commission Income |
| **5000 – 5999** | **Cost & COGS**| **Debit** | `5000` Cost of Goods Sold (COGS), `5100` Sales Returns (Contra-Income), `5200` Inventory Shrinkage & Adjustment, `5210` Cash Shortage and Overage |
| **6000 – 6999** | **Expenses** | **Debit** | `6000` Operating & General Expenses (Rent, Power, Internet, Salaries) |

---

## 2. Fundamental Accounting Invariants

### Invariant 1: Universal Double-Entry Balance
For every financial transaction $T$ resulting in journal lines $L$:
$$\sum_{l \in L} \text{Debit}(l) = \sum_{l \in L} \text{Credit}(l)$$
No transaction can be committed where $|\sum \text{Debit} - \sum \text{Credit}| \ge 0.01$. Implemented in trigger `trg_enforce_journal_balance` and verified across all 1,587 tests.

### Invariant 2: Business Clearing Account Balance Invariant
The Business Clearing Account (`1400`) acts as a transient transit bridge between customer intake and provider funding legs. At the conclusion of every atomic transaction:
$$\text{EndingBalance}(\text{Account } 1400) = 0.00$$
Zero money may pool or disappear into clearing black-holes.

### Invariant 3: Zero Ghost Outflow Invariant
In banking services (AEPS, DMT, Utility Bills, Recharge), money leaving the business (till cash handed out, bank transfer dispatched, BBPS wallet debited) must have an explicit, atomic counterpart recorded in `cash_entries`.
- **AEPS Cash Withdrawal:** Exactly 2 legs:
  1. Cash Drawer Till outflow: `direction = 'out'`, `account = 1000`
  2. AEPS Float arrival: `direction = 'in'`, `account = 1040` (Principal + Portal Commission)
- **DMT Money Transfer:** Exactly 2 legs:
  1. Customer cash inflow: `direction = 'in'`, `account = 1000` (Transfer Amount + Service Fee)
  2. Bank/Portal payout: `direction = 'out'`, `account = 1010` or `1050` (Transfer Amount + Portal Cost)

### Invariant 4: Tri-Model Reconciliation Invariant
Liquid balances must strictly match across all three independent representation layers:
$$\text{Pool Balance}(A) \equiv \text{GL Account Balance}(A) \equiv \text{Cashbook Running Balance}(A)$$
Where $A \in \{\text{Cash Drawer}, \text{Bank Accounts}, \text{Merchant QRs}, \text{Float Pools}\}$.
Tested deterministically in `test-cross-module-reconciliation.mjs` (Module 3).

### Invariant 5: Accounts Receivable (Khata) Parity
$$\text{GL Balance}(\text{Account } 1300) = \sum_{c \in \text{Customers}} \text{OutstandingDue}(c)$$
Every customer Khata credit increases GL 1300; every repayment recorded via `/api/pos/customer-due-payment` decrements GL 1300 and increments the designated payment instrument (Cash Till or Bank).

### Invariant 6: Accounts Payable (Suppliers) Parity
$$\text{GL Balance}(\text{Account } 2000) = \sum_{s \in \text{Suppliers}} \text{UnpaidBills}(s)$$
Supplier GRN entry increments GL 2000; supplier payments or purchase returns decrement GL 2000.

### Invariant 7: Perpetual Inventory Valuation & WAC Invariant
$$\text{WAC}_{\text{new}} = \frac{(Q_{\text{old}} \times C_{\text{old}}) + (Q_{\text{in}} \times C_{\text{in}})}{Q_{\text{old}} + Q_{\text{in}}}$$
- Sales reduce inventory physical quantity $Q$ at current WAC without altering the unit cost.
- Physical inventory stock $Q \ge 0$ is enforced by a database `CHECK` constraint. Negative inventory writes are strictly rejected.

### Invariant 8: Cash Drawer Day Close Variance Invariant
At shift closing, physical drawer count $C_{\text{actual}}$ is compared against calculated till balance $C_{\text{system}}$:
$$\Delta = C_{\text{actual}} - C_{\text{system}}$$
- If $\Delta = 0$: Clean close.
- If $\Delta < 0$ (Shortage): Debit Account `5210` (Cash Shortage), Credit Account `1000` (Cash Drawer).
- If $\Delta > 0$ (Overage): Debit Account `1000` (Cash Drawer), Credit Account `5210` (Cash Overage).
Cashiers cannot manually overwrite cashbook balances to hide drawer variances.

### Invariant 9: Credit Card Three-Concept Portfolio Invariant
For every commercial credit card facility $C$:
$$\text{Credit Limit}(C) = \text{Used Credit}(C) + \text{Available Credit}(C)$$
- Card payments for utility bills increase $\text{Used Credit}$ and decrease $\text{Available Credit}$.
- Repayments from bank account reduce $\text{Used Credit}$ and restore $\text{Available Credit}$.
- $\text{Credit Limit}$ remains invariant across operational spending.

### Invariant 10: Multi-Payment Allocation Invariant
For any invoice or bill payment settled via split payment methods:
$$\text{InvoiceTotal} = \sum_{p \in \text{Allocations}} \text{Amount}(p)$$
Over-allocation or under-allocation is rejected at the RPC boundary with an explicit transaction abort.
