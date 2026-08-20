# Cafe & Shop ERP — Complete User Manual

Welcome to the **Smart Business Suite** — a single application for running a cafe, shop, or small business. It combines a Point of Sale (POS), customer management, catalog, invoicing, returns, AEPS/DMT/UPI money transfers, and full finance (cash book, ledger, day close, settlements, profit & loss) in one place.

This manual explains every screen, every button, and the rules that keep your money records safe. Worked examples use a sample business **"Raja Sweets & Cafe"**.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard](#2-dashboard)
3. [Point of Sale (Billing)](#3-point-of-sale-billing)
4. [Quick Sale](#4-quick-sale)
5. [Invoices](#5-invoices)
6. [Returns](#6-returns)
7. [Customers (CRM)](#7-customers-crm)
8. [Catalog](#8-catalog)
9. [Business: AEPS, DMT, UPI](#9-business-aeps-dmt-upi)
10. [Finance](#10-finance)
11. [Staff Management](#11-staff-management)
12. [Audit Log](#12-audit-log)
13. [Settings](#13-settings)
14. [Security](#14-security)
15. [Receipts & Printing](#15-receipts--printing)
16. [Backup & Data](#16-backup--data)
17. [Roles & Permissions](#17-roles--permissions)
18. [Business Rules You Must Know](#18-business-rules-you-must-know)
19. [Troubleshooting & FAQ](#19-troubleshooting--faq)

---

## 1. Getting Started

### 1.1 Sign in

1. Open the app URL. You land on the **login** page.
2. Enter your **email** and **password** and click **Sign in**.
3. If the shop has enabled two-factor authentication (2FA), enter the 6-digit code from your authenticator app.
4. You are taken to the **Dashboard**.

> **Password reset:** On the login page click **"Forgot password?"**, enter your email, and click Send. Open the reset link in the email, type a new password (at least 6 characters), and confirm. You can then sign in.

> **Login protection:** After **5 failed attempts**, login is blocked for **30 seconds** for that email to slow down guessing.

### 1.2 The main screen (navigation)

The dark sidebar on the left is your menu. Use the **search box at the top of the sidebar** to jump to any page by typing (e.g. "cash", "aeps", "staff"). Click the section headers to expand/collapse groups:

- **Main** — Dashboard, Point of Sale, Returns*, Invoices
- **Customer Management** — Customers
- **Business** — AEPS, DMT, UPI
- **Finance** — Profit & Loss, Cash Book, Opening Balances, Day Close, Settlements, Ledger, Expenses, Reports
- **Administrative** (admin only) — Staff, Audit Log, Settings

\* Returns and Business/Finance menus are hidden for staff — see [Roles](#17-roles--permissions).

At the bottom of the sidebar: your **profile avatar** (click the little **+** badge to upload a photo), your **name/email/role**, and the **Sign out** button.

### 1.3 Useful global tools

| Tool | How to use |
|---|---|
| **Global search** | Press `Ctrl+K` (Windows) / `Cmd+K` (Mac) or click the search icon. Type to find **customers**, **products**, **services**, and **invoices**. Use ↑/↓ + Enter to open. |
| **Notification bell** (top of screen) | Shows a count badge. Admin/manager see **Recent Activity**, **Low Stock**, and **Due Invoices**. Staff see only **Due Invoices**. Click items to jump to the relevant screen. |
| **Theme** | Settings → Other Settings → choose Light / Dark / System. |
| **Auto sign-out** | If you are idle for **15 minutes**, you are signed out automatically. A warning appears at 14 minutes. |

---

## 2. Dashboard

The dashboard is a live control room. All numbers come from your real records (no fake totals), and cards refresh automatically as data changes.

### 2.1 Today's Pulse (hero cards)

- **Sales Today** — value of non-cancelled invoices today (with % vs yesterday).
- **Quick Sales Today** — today's quick-sale value (shows order count and margin).
- **Business Income Today** — AEPS/DMT/UPI income today (service fee + portal commission on successful transactions).
- **Expenses Today** — expense value dated today.
- **Cash Flow Today** — cash in minus cash out today.
- **Net Today** — Sales + Business income + Quick Sale margin − Expenses.

Below these: **Month-to-date** cards for Sales, Business Income, Expenses, and Net Profit.

### 2.2 Money Position

Shows where your money sits right now: **Cash in Hand**, **Cash in Bank**, **Cash in Wallet**, **DMT Float**, **AEPS Float**, **UPI QR**, and total **Receivables** (money customers still owe you).

### 2.3 Charts & panels

- **Revenue bar chart** — daily sales for the last 7 / 14 / 30 days (toggle the range). Today is highlighted.
- **Payments donut** — how today's sales were paid (cash vs UPI vs card, etc.).
- **P&L summary** — Net Revenue, Cost of Goods, Gross Profit, Commission, Expenses, Net Profit, and margin.
- **Recent Invoices** — latest bills with status.
- **Top Debtors** — customers who owe the most.
- **Top Products** — best sellers in the last 7 days.
- **Inventory Alerts** — products at or below their reorder level ("Out" or "N left").
- **Expenses by Category** — this month's top expense heads.
- **Quick stats** — total customers, products, services, receivables.

> **Example:** Raja Sweets opens the app. The Money Position shows ₹4,500 in hand, ₹18,200 in bank, ₹2,100 in the UPI QR pool, and ₹3,400 receivables. Inventory Alerts shows "Saffron 1 left · reorder at 2", so the owner knows to reorder.

---

## 3. Point of Sale (Billing)

The POS bills a customer for products and/or services on an **invoice**. It is fast, keyboard-friendly, and supports split payments and previous-due collection.

### 3.1 The screen

- **Left:** category list. **Centre:** the item grid with **Products** and **Services** tabs (search with `Ctrl+K`; switch between grid/list view; sort by name, price, or stock).
- **Right:** the current bill — items, discount, customer, payment, and checkout.

**Keyboard shortcuts (Quick Sale mode):** `F1` recent sales · `F2` search · `F3` customer · `F4` hold · `F8` payment · `F9` pay & print · `Esc` cancel.

### 3.2 Building a bill

1. Click items to add them to the bill. Product quantities are limited by **stock** (you cannot sell more than available). You can change the **rate** per line.
2. Add a **custom item** if needed (name, rate, cost). Optionally **save it as a product/service** for the future.
3. Apply a **discount** (₹ amount, up to the subtotal).
4. Choose the **customer** (default is **Walk-in**). See [Customer panel](#33-customer-panel).
5. Select **payment method(s)**. You can split a bill into up to **3 payments** (e.g. ₹200 cash + ₹150 UPI). Use the **Exact amount** button or the **Scan** button (reads a UPI QR/Intent amount automatically).
6. Click **Pay & Print** (or just **Pay**) to complete.

> **Example:** A customer buys 2 samosas (₹25 each), 1 cold drink (₹40), and 1 service "Home delivery" (₹30). Subtotal ₹120, discount ₹5, total ₹115. Paid ₹100 cash + ₹15 UPI. The system creates invoice **INV-1041**, deducts 2 samosas from stock, records the ₹115 payment, and prints the receipt.

### 3.3 Customer panel

- **Add new customer** — name + phone. If the phone is already used, the app warns you and offers to use the existing customer. New customers get a code automatically (e.g. `CUST-1042`).
- **Collect previous due** — if the customer owes money, tick the box to collect part/all of it along with this bill (pick the payment method/account). This is recorded separately (it reduces their balance, not the bill).
- **Use advance** — if the customer has an advance (balance is negative), you can apply it against this bill.

### 3.4 Payments

Quick buttons: **Cash / UPI / Card / Bank / Wallet / Debit / Credit**. Each payment row lets you pick a **named account** (from Settings → Payment Accounts) or a generic destination.

- If cash is used and the customer overpays, the **change** is calculated (cash paid clamps to the due amount; the rest is change).
- If the payment is **less than the total**, the invoice is saved as **Partial/Unpaid** and the balance is owed.

### 3.5 Hold / Recall

- **Hold** saves the current bill (cart, discount, customer, payments) on this device to finish later.
- **Recall** reopens a held bill; you can also delete it.

### 3.6 Money Out

Use **Money Out** to record a quick cash expense (e.g. "bought milk") while billing — it creates an expense in the **"Money Out"** category against the chosen account.

---

## 4. Quick Sale

Quick Sale is a super-fast counter for **services** (and favourite products). It starts on the **Services** tab and shows **Favourites** as big buttons — set which services appear there in Settings → Quick Sale Favorites.

1. Tap items to add them.
2. Enter the payment (quick method buttons + account; one cash row shows **Cash Tendered / Change**).
3. Optionally add the **customer** inline (duplicate-phone check included) or a custom item.
4. Click **Record**. The receipt link appears; you can print it (opens `/receipt/quick/…`).

The top strip shows today's **orders, collected, profit (admin/manager), and per-method chips**.

**After recording you can:**
- **Cancel** the sale (reverses cash entries, restores stock) — `F1` → Recent Sales → Cancel.
- **Edit** the sale (loads the items into the cart, cancels the original, re-records).
- **Recent Sales** (`F1`) — search by customer/mobile/sale number; actions: Receipt / Cancel / Edit.

---

## 5. Invoices

### 5.1 Invoice list (Invoices tab)

Shows your invoices and quick sales.

- **KPI cards:** Total Sales, Collected (with collection rate), Outstanding (unpaid + partial), Returned (with refunded).
- **Filters:** search (number/customer/phone), status pills **All / Paid / Partial / Unpaid / Cancelled** (with counts), sort, cards/list view, **Export CSV**.
- Each invoice row shows the **status badge**, total/paid/due, a collection progress bar, and buttons: copy number, **Print 80mm**, **View**, and **Collect**.

### 5.2 Viewing & collecting an invoice

Open an invoice to see: number/date/status, customer, **Items** (quantities show returned amount), Subtotal / Discount / Total / Paid / Due, the **Payments** list, and the **Record Payment** form.

- **Record Payment** — choose method (cash/UPI/card) and amount (must be ≤ due). Each payment updates the invoice and the customer's balance/ledger automatically.
- **Collect** on the list row is a quick version of the same thing.
- **Return Items** opens the returns flow (see next section).
- **Print** — 80mm receipt, and A4/PDF.

> **Example:** Invoice **INV-1020** is ₹1,000, customer paid ₹600, so it's **Partial**. From the View modal, the cashier records a ₹400 payment. Now paid = ₹1,000, due = ₹0, status flips to **Paid**, and the customer's balance drops by ₹400.

### 5.3 Cancelled invoices

When an invoice is fully returned it becomes **Cancelled** (it is never deleted — history is preserved).

---

## 6. Returns

Returns let you accept goods back from a customer. They **restock** products and refund money. Only admin/manager can process returns.

### 6.1 Process a return

1. Go to **Returns** → click **New Return** (or use **Return Items** inside an invoice).
2. Pick the invoice, then the items and quantities to return (cannot exceed what was sold and not already returned).
3. Enter the **refund amount** (₹) and **refund method** (cash/UPI/card). The refund cannot exceed what was actually paid on the invoice.
4. Confirm. The system creates return number **RTN-xxxx**, restocks the items, posts a cash-out entry for the refund, adjusts the customer's balance/ledger, and recomputes the invoice.

**Invoice statuses after a return:**
- **Full return** → invoice becomes **Cancelled**.
- **Partial return** → invoice stays, but `returned`/`refunded` amounts are shown, and the **due** is recalculated.

### 6.2 Returns list

- **KPI cards:** Total Returns, Refunded, Credit/Adjusted, This Month (trend vs last month).
- **Filters:** type (All / Refunded / Credit), refund method, date range, search; **Export CSV**.

> **Example:** A customer returns 1 of the 2 samosas from INV-1041. Qty 2 × ₹25. The returned value is ₹25, refund ₹25 in cash. Stock +1 samosa. The invoice shows "Returned ₹25 / Refunded ₹25".

---

## 7. Customers (CRM)

### 7.1 Customer list

- **KPI cards:** Total / Active / Receivables / Advances.
- **Filters:** status (all/active/inactive), balance bucket (all/owing/advance/settled), search (name/phone/code/email), sort.
- Each row shows the avatar, code, name, phone, email, **balance** (Due = rose, Advance = emerald, Settled = slate), and status. Actions: **Profile / Edit / Deactivate**.

**There is no hard delete for customers.** To stop using one, **Deactivate** them. (Deleting a customer with history would corrupt financial records.)

### 7.2 Customer profile (drawer)

Click a customer to open their profile with stats (**Lifetime Purchases, Total Paid, Balance Due, Advance**) and tabs:

- **Invoices** — their bills.
- **Business** — their AEPS/DMT/UPI transactions.
- **Ledger** — every debit/credit entry with the running balance.

**Actions:** Record advance, Return advance, New Sale (opens POS with this customer pre-selected), Photo, Edit, Deactivate/Activate.

### 7.3 Advances

- **Record advance** — customer gives you money in advance: amount + account/method. Their balance decreases (goes into advance), a cash-in entry is posted ("Advance received from …"), and a ledger credit is created.
- **Return advance** — you give the money back: increases balance, posts cash-out, ledger debit. The app blocks returning more than the available advance.

> **Example:** Customer "Amit" has balance ₹0. He pays ₹1,000 in advance (UPI). His balance becomes **−₹1,000** (Advance). Next purchase of ₹400 uses advance, so he pays ₹0 and balance becomes **−₹600**.

### 7.4 Photos

Upload a customer photo (Storage bucket `customer-photos`). It shows on the list and profile.

---

## 8. Catalog

Catalog holds your **products**, **services**, **categories**, and reference lists (**brands**, **units**). Admin/manager only.

### 8.1 Products

Fields: **Name***, **Code** (auto-suggested like `PRD-0001`), **Category**, **Unit** (default `pc`), **Description**, **Sale Price***, **Cost Price**, **Opening stock**, **Reorder level**.

- **KPI cards:** Total / Active / Low Stock / Stock Value (qty × cost).
- **Filters:** search, category, status.
- Each row: cost, sale price, **margin**, stock, status.
- **Deactivate** instead of delete when the product has sales history — stock is tracked in the unit you set (supports 0.001 precision, e.g. grams).

> **Example:** Add product "Kesar Pista Kulfi", sale price ₹40, cost ₹28, opening stock 12, reorder level 4. When stock drops to ≤4, the dashboard Inventory Alerts shows it.

### 8.2 Services

Fields: **Name***, **Category**, **Description**, **Sale Price***, **Cost Price** (margin shown live). Services have **no stock**. Mark one as a **Quick Sale favorite** here or in Settings → Quick Sale Favorites.

### 8.3 Categories

Simple groups (e.g. "Sweets", "Beverages", "Snacks"). Shows an **item count** (products + services in the category). Edit or Deactivate; a category with items shows counts so you know it is in use.

### 8.4 Brands & Units

Reference lists of brands (e.g. "Amul") and units (e.g. "kg", "g", "pc", "bottle"). Each card shows how many items use it. **If in use → Deactivate; if unused → can be deleted.**

---

## 9. Business: AEPS, DMT, UPI

This module handles **cash-out services** the shop offers: AEPS (cash withdrawal), DMT (money transfer), and UPI (UPI cash-out). Admin/manager only.

### 9.1 Common concepts

- **Service fee** — what you charge the customer for the service.
- **Portal commission** — what the service provider charges you.
- **Status:** `success` / `pending` / `failed`. Only `success` transactions post money movements; pending/failed do not.
- Each transaction gets a number: **AEP-0001**, **DMT-0001**, **UPI-0001**.
- Every action (create/edit/reverse/delete) is **audited** and posts correct cash/bank/pool legs automatically. Edit reverses old cash legs and re-posts new ones.

### 9.2 AEPS (ATM-style cash withdrawal)

1. **Record AEPS** → select the **customer's bank** (e.g. SBI), the **AEPS portal** (e.g. PayNearby), and enter **Aadhaar last 4 digits** (full Aadhaar is never stored).
2. Enter **amount**, **service fee**, **portal commission**, **status**, and how the fee is collected:
   - **Deduct from cash** (customer pays net amount) — most common.
   - **Fee via UPI** (fee paid separately via UPI).
   - **Separate cash** (fee handed over as extra cash).
3. Confirm. For a success, cash goes out by the amount, the **AEPS pool** is credited, and the fee is income.

> **Example:** Customer withdraws ₹2,000 from SBI via PayNearby, fee ₹20, portal commission ₹5, fee deducted from cash. The customer hands over ₹1,980 in cash. Cash book: −₹1,980. AEPS float: +₹2,000. Income: +₹20 (fee), commission expense ₹5.

### 9.3 DMT (money transfer)

1. Enter the **sender** and **beneficiary** (name, mobile, bank, IFSC, account).
2. Choose **transfer method**: `bank_account` or `upi`.
3. Enter the **RRN / reference** (required), amount, service fee, portal commission.
4. **Paid from** — `bank` (money leaves your bank account) or `portal` (money leaves the DMT float/pool).
5. **Customer pays** — cash, bank, or UPI.

### 9.4 UPI (cash-out)

1. Select the **merchant QR** to use, and how the **customer pays** (cash or QR/UPI).
2. Enter amount, fee, commission. Cash goes out; if the customer pays via QR, the **UPI QR pool** is credited (amount + fee).

### 9.5 Viewing, editing, reversing, deleting

Each tab (AEPS/DMT/UPI) shows a filterable list with totals (**Volume, Customer Fees, Shop Income**) and per-row actions:

- **Edit** — change details (dates/amounts/fees). Old cash legs are reversed (dated today, "Corrected …") and new legs are posted. Only `success` transactions can be edited.
- **Reverse** — cancel a wrong successful transaction (audited). Ask for a reason.
- **Delete** — only allowed for transactions with no financial history. The UI says "Admin only"; the server allows admin or manager.

### 9.6 Business Setup masters (Settings → Business Setup)

- **Banks** (name, code) — used by AEPS.
- **Portals** (name, code, remarks) — AEPS/DMT settlement portals.
- **Merchant QRs** (display name, UPI ID) — used by UPI cash-out.

Each shows **"Used in N transaction(s)"**. **In use → deactivate; unused → delete.**

---

## 10. Finance

All finance screens are admin/manager only.

### 10.1 Cash Book

The day-to-day record of every cash (and bank/UPI) movement. Entries show **date, method (cash/UPI/card/bank/wallet/…), direction (in/out), amount, description**, and reference.

- Filter by date range, method, direction, and search.
- **Add manual entry** — for money movements that did not come from a sale (e.g. "shop deposit from home"). Choose method, direction, amount, description, and the account.

> **Note:** Sales, payments, returns, expenses, advances, and business transactions all post cash-book entries automatically. You only add manual entries for genuinely unrecorded movements.

### 10.2 Opening Balances

Set what the shop **started with** for cash and each bank/account instrument.

- Choose the instrument, enter the amount, and save. **Negative opening balances are not allowed.**
- Setting a balance is **audited** (`opening_balance_set`).

### 10.3 Day Close

At the end of the day, **close the day** to tally the cash drawer and lock the day's numbers.

**Open a close:** click **Open** to start. The screen live-recomputes expected movements against the recorded opening.

**Close the day:**
1. Count the actual **cash in the drawer** and enter it under **Cash Counted**.
2. Review the expected vs counted (the **Balance Check** shows the difference).
3. Confirm. The system writes **closing_balances** for each pool, computes the day's **movements/final** balances, records owner deposits/withdrawals, and **seeds the next day's opening balances automatically**.

**Cancel an open close:** if you accidentally opened a close (or opened the wrong date), click the **× / Cancel close** button in the open-panel header and give a reason. The close is marked **cancelled** (never deleted) and the date is freed up again.

**Reversing a closed day:** you can reverse a closed day, which **deletes that close's auto next-day seeds** so they are recreated when you close again.

> **Example:** Opening cash ₹5,000. Sales in cash today ₹12,000, cash expenses ₹1,500, refund ₹200. Expected cash ≈ ₹15,300. The cashier counts ₹15,300 → Balance Check ₹0 → Close. Next day's opening cash = ₹15,300 (auto).

### 10.4 Settlements

Moves money **between pools** (e.g. UPI QR balance → wallet → bank, or AEPS float → bank). This is how you "cash out" digital money.

Available settlement types (each gets a number, e.g. ATB-0001):
- **AEPS → Bank** (`aeps_to_bank`)
- **Bank → DMT** (`bank_to_dmt`)
- **Wallet → DMT** (`wallet_to_dmt`)
- **UPI QR → Wallet** (`upi_qr_to_wallet`)
- **Wallet → Bank** (`wallet_to_bank`)
- **Bank Withdrawal** (`bank_withdrawal`) — bank to cash
- **Add Cash to Bank** (`add_cash_to_bank`) — cash to bank
- **Cash Adjustment** (`cash_adjustment`) — add/remove cash in hand

A settlement moves money from one pool to another; only physical cash movements (withdrawal/deposit/adjustment) post a matching cash-book entry. Settlements are **one-way** — reverse with a counter settlement if needed.

> **Example:** The UPI QR pool has ₹8,000. The owner wants it in the bank. Settlement **UQW-0001 (UPI QR → Wallet) ₹8,000**, then **WTD-0001 (Wallet → DMT)? No** — **Wallet → Bank ₹8,000** (WTB-0001). The bank pool increases; UPI QR pool drops to ₹0.

### 10.5 Ledger

A **transaction-level ledger** of the shop's money (all business transactions and financial events), filterable by date range, type (AEPS/DMT/UPI/expense/etc.), direction, and search.

### 10.6 Expenses

Record shop expenses: **date, amount, category, method/account, notes**.

- Categories include defaults like **Rent, Salary, Electricity, Supplies, Money Out**, plus custom ones.
- Expense list filters by date range, category, method, search; **Export CSV**.

> **Example:** Pay electricity ₹2,400 by cash. Expense category "Electricity", method cash. Cash book: −₹2,400. P&L shows Electricity under expenses.

### 10.7 Profit & Loss

A period report (pick **from** and **to** dates):

- **Sales** (billed revenue) and **Returns**
- **Cost of Goods Sold** (COGS)
- **Gross Profit**
- **Business income** (fees + commissions from AEPS/DMT/UPI)
- **Expenses**
- **Net Profit** and margin

### 10.8 Reports

Sales and business summaries — sales by period, by category, by product/service, business transaction volumes, etc. Filters + export.

---

## 11. Staff Management

Admin only. Manage the people who use the app.

- **KPI cards:** Team Members, Active, Admins, Managers, Staff.
- **Filters:** search, role filter, status filter, compact view.
- **Add staff:** full name, email, role (admin/manager/staff), password (min 6 chars). The account is created immediately (email confirmed).
- **Edit:** change name, role, **Account active** toggle, and optionally **Reset password** (leave blank to keep). **Email cannot be changed.**
- **Deactivate/activate** — flip the switch (a deactivated user is shown an "Account deactivated" screen and cannot use the app).

**Safeguards:** you cannot change your **own** role or deactivate **yourself**.

---

## 12. Audit Log

Admin only. A complete, tamper-proof trail of important actions: sales, payments, returns, business transactions, staff changes, settings, login/logout, uploads, exports.

- **Filters:** search text, **Action** (create/update/delete/cancel/reverse/payment/login/…), **Entity** (invoice, customer, transaction, staff…), and **Date**.
- **KPI cards:** total entries, today, creates, reversals/cancels.
- **Export CSV** of the filtered view.

> **Note:** The audit log is **append-only**. Entries cannot be edited or deleted. If someone modifies a financial record, the audit trail shows who and when.

---

## 13. Settings

Admin only. **12 tabs**, each saved independently.

### 13.1 General (Shop Profile)

- **Logo** — upload/change/remove (PNG/JPG, square best).
- **Shop name***, **Phone**, **Currency** (₹ default; also $, €, £, ৳, ر.س), **Address**.
- Click **Save changes** (top-right) to save.

### 13.2 Receipt & Printer

- **Receipt footer** — a tail line printed on every 80mm receipt (e.g. "Thank you! Visit again").

### 13.3 Tax & GST

- **GSTIN** (15 chars, printed on receipts when filled) and **Default tax rate (%)**. The rate is informational — there is **no automatic tax engine**; tax is applied via invoice discount/line entries.

### 13.4 Payment Accounts

Named accounts used at the till. Types: **Cash, Bank, UPI, Wallet, Debit Card, Credit Card**.

- **Add Account** — name, type, **opening balance** (₹) for new accounts.
- Type-specific details: bank (bank name, account number, IFSC), UPI (UPI ID, linked), cards (**last 4 digits only** — full card numbers are never stored), notes.
- Each account shows its **current balance** (opening + all cash-book movements tagged to it).
- **Delete vs Disable:** if the account is used by payments/cash entries, you are offered **Disable** instead ("preserve financial history"). Unused accounts can be deleted.

### 13.5 Payment Methods

Which methods the till offers (cash, card, bank, UPI, wallet, debit, credit) and their order.

- **Enable method** — pick from the list.
- **Rename** the label, **reorder** with arrows, **toggle** on/off.
- **No hard delete** — disabling hides it from the till while keeping past sales intact.

### 13.6 Quick Sale Favorites

Pick which **services** appear as big "Popular" buttons on Quick Sale. Use the star toggle and the arrows to order them.

### 13.7 Catalog

Embedded products / services / categories management (same as the Catalog section of this manual).

### 13.8 Business Setup

Banks, portals, and merchant QRs used by AEPS/DMT/UPI (see §9.6).

### 13.9 Backup & Data

Download CSV backups: **Customers**, **Invoices**, **Customer Ledger**. (Full backups live in your Supabase project.)

### 13.10 Notifications

Currently a placeholder — there is no email/SMS integration. Alerts show in the **bell icon** instead.

### 13.11 Security

See [Security](#14-security).

### 13.12 Other Settings

**Theme** — Light / Dark / System.

---

## 14. Security

Access via Settings → Security (admin).

### 14.1 Change password

Enter your **current password**, a **new password** (≥8 chars with upper/lower/number/symbol — strength meter shown), confirm, and it must differ from the current one.

### 14.2 Two-factor authentication (2FA)

- **Enable:** click Enroll, scan the **QR code** (or type the secret) into an authenticator app (Google Authenticator, etc.), enter the **6-digit code** to verify.
- After enabling, login requires your password **and** the code.
- **Disable:** verify and turn off.

> **Note:** If 2FA is not available, the app tells you (it depends on the Supabase project's MFA settings).

### 14.3 Recent sign-in attempts

A table of recent logins: **Time, Email, Status (Success/Failed), IP** — useful to spot someone trying to break in.

---

## 15. Receipts & Printing

The app prints three kinds of receipts.

| Receipt | Where | Content |
|---|---|---|
| **80mm thermal (invoice)** | Invoice → Print 80mm | Shop name/address/phone/GSTIN, invoice no & date, customer, items (qty × rate), subtotal/discount/total/paid/due, payment lines, footer |
| **A4 + PDF** | Invoice → A4 | Full A4 layout; **Download PDF** (`<invoice>.pdf`) or **Print A4** |
| **80mm quick sale** | Quick Sale receipt | Quick sale number, items, TOTAL, payments, **Cash Tendered / Change**, `CANCELLED` stamp if cancelled, footer |

Print using the browser's print dialog (choose your thermal printer, e.g. "80mm" paper). **A4/PDF** is generated with a dedicated layout for invoices and AEPS/DMT/UPI business receipts.

---

## 16. Backup & Data

- **Settings → Backup & Data → Download CSV** for **Customers**, **Invoices**, or **Customer Ledger**.
- CSV files open in Excel/Google Sheets (UTF-8 with BOM).
- The full database lives in your Supabase project — ask your technical person for a full backup/restore.

---

## 17. Roles & Permissions

| Capability | Staff | Manager | Admin |
|---|---|---|---|
| Dashboard, POS, Quick Sale, Invoices | ✅ | ✅ | ✅ |
| Customers (view/add/edit/advance) | ✅ | ✅ | ✅ |
| Returns | ❌ | ✅ | ✅ |
| Catalog (products/services/categories) | ❌ | ✅ | ✅ |
| Business (AEPS/DMT/UPI) + masters | ❌ | ✅ | ✅ |
| Finance (cash book, ledger, expenses, day close, settlements, P&L, reports) | ❌ | ✅ | ✅ |
| View profit figures | ❌ | ✅ | ✅ |
| Staff management | ❌ | ❌ | ✅ |
| Audit log | ❌ | ❌ | ✅ |
| Settings | ❌ | ❌ | ✅ |
| Notification bell: Activity + Low Stock | ❌ | ✅ | ✅ |
| Notification bell: Due Invoices | ✅ | ✅ | ✅ |

**Server-side enforcement:** pages redirect and the database blocks writes that a role is not allowed to do — hiding the menu is not the only protection.

---

## 18. Business Rules You Must Know

1. **No hard deletes on money records.** Invoices, payments, ledger entries, cash entries, settlements, and returns are never deleted. Wrong entries are **cancelled / reversed / corrected** with an audit trail.
2. **No negative stock.** You cannot sell more than available without authorisation.
3. **Numbering is automatic and unique:** `INV-` invoices, `QS-` quick sales, `RTN-` returns, `CUST-/CUS-` customers, `PRD-` products, `AEP-/DMT-/UPI-` business, `ATB/BTD/WTD/UQW/WTB/BWD/CTB/CAD-` settlements.
4. **One operation, many updates.** A single sale/payment/return updates the invoice, payments, cash book, customer balance, ledger, stock, and audit log together — no double entry.
5. **Money is decimal.** All amounts are stored precisely (₹, 2 decimals). Never use rounded floats.
6. **Aadhaar privacy.** Only the last 4 digits are stored; full Aadhaar/biometrics are never stored.
7. **Deactivate, don't delete.** Any record with transaction history (customer, product, service, category, account, method, bank, portal, QR) should be **deactivated/disabled**, never hard-deleted.
8. **Day close is audited.** Closed days are locked; reversal is possible but audited, and it removes the auto next-day seeds until you close again.
9. **Staff read-only on finance** — staff see operational screens; money screens are served read-only through secure functions.

---

## 19. Troubleshooting & FAQ

**Q: I forgot my password.**
Click "Forgot password?" on the login page and follow the email link.

**Q: I'm locked out of login.**
5 failed attempts → 30 seconds wait. Try again after the countdown.

**Q: Why can't I delete a customer/product/payment account?**
Because it has transaction history. Use **Deactivate/Disable** instead — this preserves your financial records.

**Q: The AEPS edit shows `column "p_service_type" does not exist`.**
The database is running an outdated function. Ask your technical person to run **`supabase/fix-update-business-txn.sql`** (or the full **`supabase/hardening.sql`**) in the Supabase SQL editor. Then verify with:
```sql
select proname from pg_proc
where proname = 'update_business_txn'
and prosrc ilike '%p_service_type%';   -- must return 0 rows
```

**Q: Can I change a payment method name after sales exist?**
Yes — rename in Settings → Payment Methods. Past sales keep their method.

**Q: Where do "expected" cash numbers in Day Close come from?**
From your recorded opening balance plus every cash in/out movement of the day. Count the drawer and enter the actual; the Balance Check shows any difference.

**Q: How do I get digital money (UPI QR / AEPS float) into my bank?**
Use **Settlements** (e.g. UPI QR → Wallet → Bank, or AEPS → Bank).

**Q: How do I print a receipt again?**
Invoices → find the invoice → Print 80mm or A4/PDF. Business receipts are in each AEPS/DMT/UPI tab.

**Q: Does the app send SMS/email notifications?**
Not yet. Alerts appear in the bell icon (low stock, due invoices) and the dashboard.

---

*This manual describes the shop ERP as built. For technical/installation details, contact your technical administrator.*