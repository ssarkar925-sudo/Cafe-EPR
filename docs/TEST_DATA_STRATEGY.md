# CafeERP — Test Data Strategy & Synthetic Fixture Specification

**Document Purpose:** Non-destructive test data generation, staging fixtures, and synthetic tenant modeling for automated QA and continuous testing.  
**Governing Principle:** Zero destruction of live operational data; 100% deterministic synthetic fixtures.  

---

## 1. Test Isolation & Safety Principles

1. **Non-Destructive Operations:** Tests never execute hard `DELETE` or `TRUNCATE` operations on live production schemas. All testing harnesses use:
   - Dedicated synthetic tenant identifiers (`test_tenant_*`), or
   - In-memory mock databases, or
   - Read-only queries against existing master data with rollback wrappers.
2. **Deterministic Seeds:** Fixture generators generate identical entity structures, UUIDs, and mathematical amounts to guarantee reproducible test runs across Node.js and CI environments.
3. **Financial Invariance Enforcement:** Synthetic test datasets must satisfy all double-entry and tri-model reconciliation invariants before being accepted into any test suite.

---

## 2. Standard Master Fixtures

### 2.1 Payment Instruments Fixture (`payment_instruments`)

```json
[
  {
    "id": "11111111-1111-1111-1111-111111111111",
    "name": "Cash Drawer (Till)",
    "type": "cash",
    "is_active": true,
    "opening_balance": 5000.00
  },
  {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "State Bank of India — Current A/C",
    "type": "bank",
    "is_active": true,
    "opening_balance": 50000.00
  },
  {
    "id": "33333333-3333-3333-3333-333333333333",
    "name": "Shop Counter Merchant UPI QR",
    "type": "upi_qr",
    "is_active": true,
    "opening_balance": 0.00
  },
  {
    "id": "44444444-4444-4444-4444-444444444444",
    "name": "ICICI Platinum Business Credit Card",
    "type": "credit_card",
    "credit_limit": 25000.00,
    "is_active": true,
    "opening_balance": 0.00
  },
  {
    "id": "55555555-5555-5555-5555-555555555555",
    "name": "AEPS Settlement Float Pool",
    "type": "portal_float",
    "is_active": true,
    "opening_balance": 10000.00
  }
]
```

### 2.2 Product Catalog Fixtures (`products`)

```json
[
  {
    "id": "a0000001-0000-0000-0000-000000000001",
    "name": "Sandisk 32GB Ultra USB 3.0 Pen Drive",
    "sku": "PEN-SAN-32G",
    "barcode": "8901234567890",
    "purchase_price": 280.00,
    "sale_price": 420.00,
    "stock_qty": 25,
    "min_stock_alert": 5,
    "hsn_code": "85235100",
    "gst_rate": 18.0
  },
  {
    "id": "a0000001-0000-0000-0000-000000000002",
    "name": "JK Copier A4 Paper Rim (500 Sheets)",
    "sku": "PAP-A4-500",
    "barcode": "8901234567891",
    "purchase_price": 290.00,
    "sale_price": 360.00,
    "stock_qty": 50,
    "min_stock_alert": 10,
    "hsn_code": "48025610",
    "gst_rate": 12.0
  }
]
```

### 2.3 Customers & Credit Limits (`customers`)

```json
[
  {
    "id": "c0000001-0000-0000-0000-000000000001",
    "name": "Joy Sarkar",
    "phone": "9830123456",
    "credit_limit": 5000.00,
    "outstanding_due": 1200.00,
    "status": "active"
  },
  {
    "id": "c0000001-0000-0000-0000-000000000002",
    "name": "Pritam Ghosh",
    "phone": "9830987654",
    "credit_limit": 2000.00,
    "outstanding_due": 0.00,
    "status": "active"
  }
]
```

---

## 3. Synthetic Seed Execution & Teardown Protocol

1. **Seeding:** The synthetic generator is executed in test mode:
   ```bash
   npm run test:invariants
   npm run test:qa
   npm run test:reconciliation
   ```
2. **Assertion Verification:** Invariant engines evaluate total ledger sums against expected constants without mutating the underlying database.
3. **Clean Teardown:** Where test rows are inserted into staging databases, each test wraps execution in a transaction block with an automatic `ROLLBACK` at the end of the test assertion step.
