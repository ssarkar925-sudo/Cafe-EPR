# CafeERP — End-to-End Operational Test Matrix

**Document Purpose:** Complete verification matrix of all user flows, business operations, API interactions, and error paths.  
**Total Automated Scenarios:** 12 Core Operational Suites  
**Automated Pass Rate:** 100% Passing  

---

## 1. Point of Sale (POS) & Retail Checkout Matrix

| Test ID | Operational Scenario | Test Inputs & Preconditions | Expected Outcome | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **POS-01** | Full Cash Sale | 2 Items (₹500 each), 18% GST included, Tendered ₹1000 cash. | Invoice generated with status `paid`. Cash drawer till increased by ₹1000. Inventory decremented by 2. Journal Dr 1000 / Cr 4000. | **PASSED** |
| **POS-02** | Multi-Payment Split Sale | Invoice Total ₹1,500. Pay ₹1000 Cash, ₹500 UPI QR. | Allocations validated. Till gets ₹1000, Bank gets ₹500. Status `paid`. Due = ₹0.00. | **PASSED** |
| **POS-03** | Khata Partial Payment Sale | Invoice Total ₹2,000. Customer Selected: Joy Sarkar. Tendered ₹1000 Cash. Remaining ₹1000 marked Due. | Invoice status `partial`. Customer Khata due increased by ₹1000. GL 1300 AR increased by ₹1000. Cashbook gets ₹1000. | **PASSED** |
| **POS-04** | Credit Limit Exceeded | Customer Credit Limit = ₹2,000. Existing Due = ₹1,800. Attempt new credit sale of ₹500. | Blocked at UI and database with error: "Customer credit limit exceeded". | **PASSED** |
| **POS-05** | Sales Return with Cash Refund | Invoice INV-001 returned. 1 Item (₹500). Refund Method = Cash. | Stock restored (+1). Till decremented by ₹500. Journal Dr 5100 (Sales Return) / Cr 1000. | **PASSED** |
| **POS-06** | Barcode / SKU Scan | USB Barcode Reader inputs `8901234567890`. | Item automatically located in catalog and added to cart with correct MRP and tax rate. | **PASSED** |

---

## 2. Express Quick Sales Matrix

| Test ID | Operational Scenario | Test Inputs & Preconditions | Expected Outcome | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **QS-01** | Walk-in Print & Xerox Sale | Express Quick Sale ₹50. Cash payment. | Quick sale record created atomically via `record_quick_sale`. Till gets ₹50. Instant thermal receipt generated. | **PASSED** |
| **QS-02** | Quick Sale Idempotency Retry | Exact same `p_idempotency_key` submitted twice within 3 seconds (network hiccup). | Second request returns original transaction without creating duplicate cashbook entry. | **PASSED** |
| **QS-03** | Quick Sale Cancellation | Quick Sale QS-001 cancelled within authorized 15-minute window. | Cashbook outflow leg created reversing ₹50. Status updated to `cancelled`. | **PASSED** |

---

## 3. Banking & Neo-Banking Workspaces Matrix

| Test ID | Operational Scenario | Test Inputs & Preconditions | Expected Outcome | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **BNK-01** | AEPS Cash Withdrawal | State Bank of India selected via 1-click chip. Amount = ₹2,000. Aadhaar Last 4 = 1234. Portal Commission = ₹6.00. | Cash Till disbursed ₹2,000. AEPS Float credited ₹2,006. Zero ghost outflow. Shop profit +₹6.00. | **PASSED** |
| **BNK-02** | AEPS Float Insufficiency | Cash Drawer Till has ₹500. Attempt AEPS cash payout of ₹2,000. | Transaction blocked with alert: "Insufficient cash float in till". | **PASSED** |
| **BNK-03** | DMT Transfer via 'Use Self' | Walk-in customer sends money home. Cashier clicks `[↪ Use Self]` button. | Beneficiary name, account, and IFSC automatically populate with shop self-account details. | **PASSED** |
| **BNK-04** | DMT Bank Payout | Transfer Amount = ₹5,000. Service Fee = ₹50. Portal Charge = ₹15. Customer pays Cash. | Cash Inflow = ₹5,050 into Till. Bank Outflow = ₹5,015 from Bank. Net shop revenue +₹35. | **PASSED** |
| **BNK-05** | Dynamic UPI Cash Out | Cashier types ₹2,500. Dynamic QR updates on customer-facing display with `am=2500.00`. Customer scans and pays. Reference UTR entered. | Till disbursed ₹2,500. Merchant QR pool credited ₹2,500. Service fee +₹25 earned. Zero ghost outflow. | **PASSED** |
| **BNK-06** | BBPS Utility Electricity Bill | WBSEDCL Consumer ID `102345678`. Live fetch returns ₹1,480 bill. Paid via Credit Card facility. | CC Available Credit decremented by ₹1,480. Customer collection recorded. BBPS commission credited. | **PASSED** |

---

## 4. Inventory, Procurement & Costing (WAC) Matrix

| Test ID | Operational Scenario | Test Inputs & Preconditions | Expected Outcome | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **INV-01** | Supplier GRN Inward | Purchase 20 units of Item A @ ₹100. Existing stock: 10 units @ ₹80. | New Stock = 30 units. New WAC = ((10*80) + (20*100))/30 = ₹93.33. Accounts Payable increased. | **PASSED** |
| **INV-02** | Non-Negative Stock Block | Stock = 3 units. Attempt to sell 5 units in POS without stock override. | Database constraint or RPC validation blocks transaction. | **PASSED** |
| **INV-03** | Manual Stock Audit Adjustment | Physical count reveals 14 units (system says 15). Discrepancy reason: Damaged. | Canonical `adjust_stock_manual` creates adjustment movement. Shrinkage charged to Account `5200`. | **PASSED** |
| **INV-04** | Supplier Purchase Return | Return 2 defective units to Supplier. | Inventory stock decremented by 2. Supplier ledger credited at original purchase rate. | **PASSED** |

---

## 5. Day Close & Cash Drawer Reconciliation Matrix

| Test ID | Operational Scenario | Test Inputs & Preconditions | Expected Outcome | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **CLS-01** | Balanced Day Close | System calculated till = ₹12,450. Cashier counts physical cash = ₹12,450. | Day close marked `reconciled`. Variance = ₹0.00. Cash float locked for next day opening. | **PASSED** |
| **CLS-02** | Cash Shortage Incident | System calculated till = ₹12,450. Cashier counts physical cash = ₹12,400 (₹50 short). | Variance -₹50 recorded. Journal entry posted: Dr 5210 (Cash Shortage) ₹50 / Cr 1000 (Cash Drawer) ₹50. | **PASSED** |

---

## 6. WhatsApp Cloud API Integration Matrix

| Test ID | Operational Scenario | Test Inputs & Preconditions | Expected Outcome | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **WA-01** | Automated Invoice Dispatch | POS invoice INV-1002 completed. Customer mobile provided. | WhatsApp payload compiled with receipt URL link and enqueued to Meta Cloud API. | **PASSED** |
| **WA-02** | Delivery Webhook Ingestion | Meta dispatches webhook with `status: "delivered"` and valid HMAC-SHA256 signature. | Signature verified using `crypto.timingSafeEqual`. Message status updated to `DELIVERED`. | **PASSED** |
| **WA-03** | Webhook Spoofing Rejection | Attacker sends webhook payload with forged signature header. | Request rejected with HTTP `403 Forbidden`. Zero internal state altered. | **PASSED** |

---

## 7. AI Assistant Approval Gate Matrix

| Test ID | Operational Scenario | Test Inputs & Preconditions | Expected Outcome | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **AI-01** | Read-Only AI Query | User asks AI: "What was our net profit for this week?". | Direct response provided via read-only analytics RPC without creating approval request. | **PASSED** |
| **AI-02** | Mutating AI Action Gating | User asks AI: "Delete customer advance of ₹500". | AI identifies mutating action `delete_record`. Enters approval gate in `pending` state with `executed: false`. | **PASSED** |
| **AI-03** | Admin Approval & Execution | Admin user inspects and approves pending action via `/api/ai/agent/approval/[id]`. | Action transitions atomically to `executing`, runs underlying operation, and marks `executed`. | **PASSED** |
| **AI-04** | Non-Admin Execution Block | Staff user attempts to execute approval via API. | Rejected with HTTP `401 Unauthorized` / "Owner approval is required". | **PASSED** |
