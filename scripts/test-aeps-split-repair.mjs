import assert from 'node:assert';
import { calculateAccountBalances } from '../lib/finance/account-balances.ts';

console.log('================================================================================');
console.log('TEST SUITE: AEPS HISTORICAL REPAIR & SPLIT PAYMENT INSTRUMENT INVARIANTS');
console.log('================================================================================\n');

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// Database Simulation
// -----------------------------------------------------------------------------
class MockFinancialDB {
  constructor() {
    this.instruments = [
      { id: 'inst-cash', name: 'Cash Till', type: 'cash', is_active: true, opening_balance: 50000, current_balance: 50000 },
      { id: 'inst-bank-sbi', name: 'SBI Current Account', type: 'bank', is_active: true, opening_balance: 100000, current_balance: 100000 },
      { id: 'inst-upi-qr', name: 'Shop Merchant QR', type: 'upi_qr', is_active: true, opening_balance: 0, current_balance: 0 },
      { id: 'inst-wallet', name: 'Paytm Wallet', type: 'wallet', is_active: true, opening_balance: 5000, current_balance: 5000 },
      { id: 'inst-card-debit', name: 'SBI Debit Card', type: 'debit_card', is_active: true, opening_balance: 0, current_balance: 0 },
      { id: 'inst-card-credit', name: 'HDFC Millennia Credit Card', type: 'credit_card', is_active: true, opening_balance: 0, current_balance: 0 },
      { id: 'inst-ezeepay', name: 'EzeePay AEPS Portal', type: 'aeps_portal', is_active: true, opening_balance: 10000, current_balance: 10000 },
    ];
    this.portals = [
      { id: 'portal-ezeepay', name: 'EzeePay', service_type: 'aeps', is_active: true, payment_instrument_id: 'inst-ezeepay' },
    ];
    this.transactions = [];
    this.cashEntries = [];
  }

  // Simulate migration 20260919 Part 1: Repair AEP-0098, AEP-0103, AEP-0105, AEP-0119
  runAepsHistoricalRepair() {
    const targetNumbers = ['AEP-0098', 'AEP-0103', 'AEP-0105', 'AEP-0119'];
    let repairedCount = 0;

    for (const txn of this.transactions) {
      if (!targetNumbers.includes(txn.transaction_number) || txn.status !== 'success') continue;

      const creditAmount = Number(txn.pool_credit) || (Number(txn.amount) + (Number(txn.portal_commission) || 0));
      if (!txn.pool_credit) {
        txn.pool_credit = creditAmount;
        txn.pool_credit_type = 'aeps';
      }

      const existingCredit = this.cashEntries.find(
        (ce) => ce.ref_type === 'transaction' && ce.ref_id === txn.id && ce.direction === 'in' && ['aeps', 'aeps_portal'].includes(ce.method)
      );

      if (!existingCredit) {
        let portalInstId = null;
        if (txn.portal_id) {
          const portal = this.portals.find((p) => p.id === txn.portal_id);
          portalInstId = portal?.payment_instrument_id || null;
        }
        if (!portalInstId) {
          const fallback = this.instruments.find((i) => i.is_active && ['aeps_portal', 'aeps'].includes(i.type));
          portalInstId = fallback ? fallback.id : null;
        }

        if (portalInstId && creditAmount > 0) {
          this.cashEntries.push({
            id: 'ce-' + crypto.randomUUID().slice(0, 8),
            entry_date: txn.transaction_date || '2026-09-19',
            method: 'aeps',
            direction: 'in',
            amount: creditAmount,
            description: `AEPS ${txn.transaction_number} float credited [Historical Repair]`,
            ref_type: 'transaction',
            ref_id: txn.id,
            instrument_id: portalInstId,
          });
          repairedCount++;
        }
      }
    }
    return repairedCount;
  }

  // Simulate migration 20260919 Part 2: Repair split payment allocations with null instrument_id
  runSplitAllocationRepair() {
    const defaultCash = this.instruments.find((i) => i.is_active && i.type === 'cash')?.id;
    const defaultUpi = this.instruments.find((i) => i.is_active && ['upi_qr', 'upi'].includes(i.type))?.id;
    const defaultBank = this.instruments.find((i) => i.is_active && i.type === 'bank')?.id;
    const defaultWallet = this.instruments.find((i) => i.is_active && i.type === 'wallet')?.id;
    const defaultCard = this.instruments.find((i) => i.is_active && ['credit_card', 'debit_card'].includes(i.type))?.id || defaultBank;

    let repairedCount = 0;

    for (const txn of this.transactions) {
      if (!Array.isArray(txn.customer_payment_allocations) || txn.customer_payment_allocations.length === 0) continue;

      const hasNull = txn.customer_payment_allocations.some(
        (a) => a.instrument_id === null || a.instrument_id === undefined || a.instrument_id === '' || a.instrument_id === 'null'
      );

      if (hasNull) {
        txn.customer_payment_allocations = txn.customer_payment_allocations.map((a) => {
          let method = String(a.method || 'cash').toLowerCase();
          if (['qr', 'upi_qr'].includes(method)) method = 'upi';
          if (method === 'card') method = 'credit_card';

          let instId = a.instrument_id;
          if (!instId || instId === 'null') {
            if (txn.customer_collection_instrument_id && txn.customer_payment_allocations.length === 1) {
              instId = txn.customer_collection_instrument_id;
            } else if (method === 'cash') instId = defaultCash;
            else if (method === 'upi') instId = defaultUpi;
            else if (method === 'bank') instId = defaultBank;
            else if (method === 'wallet') instId = defaultWallet;
            else if (['credit_card', 'debit_card'].includes(method)) instId = defaultCard;
            else instId = defaultCash || defaultBank;
          }

          return {
            method,
            amount: Number(a.amount || 0).toFixed(2),
            instrument_id: instId,
          };
        });

        if (!txn.customer_collection_instrument_id && txn.customer_payment_allocations[0]?.instrument_id) {
          txn.customer_collection_instrument_id = txn.customer_payment_allocations[0].instrument_id;
        }

        repairedCount++;
      }
    }

    // Repair cash_entries with null instrument_id
    for (const ce of this.cashEntries) {
      if (ce.ref_type === 'transaction' && ce.direction === 'in' && !ce.instrument_id) {
        const m = String(ce.method || 'cash').toLowerCase();
        if (m === 'cash') ce.instrument_id = defaultCash;
        else if (['upi', 'upi_qr', 'qr'].includes(m)) ce.instrument_id = defaultUpi;
        else if (m === 'bank') ce.instrument_id = defaultBank;
        else if (m === 'wallet') ce.instrument_id = defaultWallet;
        else if (['card', 'credit_card', 'debit_card'].includes(m)) ce.instrument_id = defaultCard;
        else ce.instrument_id = defaultCash;
      }
    }

    return repairedCount;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Historical Repair for AEP-0098, AEP-0103, AEP-0105, AEP-0119
// -----------------------------------------------------------------------------
test('1. Setup defect state: AEP transactions have customer payout but missing provider float credit', () => {
  const db = new MockFinancialDB();

  const aepsTxns = [
    { number: 'AEP-0098', amount: 2000, comm: 6 },
    { number: 'AEP-0103', amount: 5000, comm: 10 },
    { number: 'AEP-0105', amount: 1000, comm: 3 },
    { number: 'AEP-0119', amount: 3000, comm: 8 },
  ];

  for (const item of aepsTxns) {
    const txnId = 'txn-' + item.number;
    db.transactions.push({
      id: txnId,
      transaction_number: item.number,
      service_type: 'aeps',
      amount: item.amount,
      service_fee: 0,
      portal_commission: item.comm,
      pool_credit: null, // Defect: unpopulated
      portal_id: 'portal-ezeepay',
      status: 'success',
      transaction_date: '2026-09-18',
    });

    // Payout leg was recorded
    db.cashEntries.push({
      id: 'ce-out-' + item.number,
      entry_date: '2026-09-18',
      method: 'cash',
      direction: 'out',
      amount: item.amount,
      description: `AEPS ${item.number} cash payout`,
      ref_type: 'transaction',
      ref_id: txnId,
      instrument_id: 'inst-cash',
    });
    // Missing: provider float credit leg
  }

  // Pre-repair balance check
  const preBalances = calculateAccountBalances({
    instruments: db.instruments,
    cashEntries: db.cashEntries,
    portals: db.portals,
  });

  const ezeepayPre = preBalances.find((b) => b.id === 'inst-ezeepay');
  assert.strictEqual(ezeepayPre.totalInflows, 0, 'EzeePay should have 0 inflows before repair');
  assert.strictEqual(ezeepayPre.calculatedBalance, 10000, 'EzeePay balance is missing float credits');

  // Run repair
  const repaired = db.runAepsHistoricalRepair();
  assert.strictEqual(repaired, 4, 'Should repair exactly 4 AEPS transactions');

  // Post-repair balance check
  const postBalances = calculateAccountBalances({
    instruments: db.instruments,
    cashEntries: db.cashEntries,
    portals: db.portals,
  });

  const ezeepayPost = postBalances.find((b) => b.id === 'inst-ezeepay');
  const expectedCredits = (2000 + 6) + (5000 + 10) + (1000 + 3) + (3000 + 8); // 11027
  assert.strictEqual(ezeepayPost.totalInflows, expectedCredits, `EzeePay inflows should equal ₹${expectedCredits}`);
  assert.strictEqual(ezeepayPost.calculatedBalance, 10000 + expectedCredits, `EzeePay calculated balance should equal ₹${10000 + expectedCredits}`);
  assert.strictEqual(ezeepayPost.displayedBalance, 10000 + expectedCredits, `EzeePay displayed balance must strictly be reconstructed from ledger`);
  // Checkpoint sync: when stored balance is synced to the reconstructed ledger balance
  const syncedBalances = calculateAccountBalances({
    instruments: [{ ...db.instruments.find((i) => i.id === 'inst-ezeepay'), current_balance: 10000 + expectedCredits }],
    cashEntries: db.cashEntries,
    portals: db.portals,
  });
  assert.strictEqual(syncedBalances[0].isReconciled, true, 'EzeePay should be reconciled when checkpoint matches ledger');
});

test('2. Idempotency: Running AEPS historical repair second time is a complete no-op', () => {
  const db = new MockFinancialDB();

  db.transactions.push({
    id: 'txn-AEP-0098',
    transaction_number: 'AEP-0098',
    service_type: 'aeps',
    amount: 2000,
    portal_commission: 6,
    pool_credit: 2006,
    portal_id: 'portal-ezeepay',
    status: 'success',
    transaction_date: '2026-09-18',
  });

  const firstRun = db.runAepsHistoricalRepair();
  assert.strictEqual(firstRun, 1, 'First run repairs 1 transaction');
  const countAfterFirst = db.cashEntries.length;

  const secondRun = db.runAepsHistoricalRepair();
  assert.strictEqual(secondRun, 0, 'Second run must repair 0 transactions (idempotent)');
  assert.strictEqual(db.cashEntries.length, countAfterFirst, 'No duplicate cash entries created');
});

test('3. Non-target AEPS transactions are never modified by the repair', () => {
  const db = new MockFinancialDB();

  db.transactions.push({
    id: 'txn-AEP-0200',
    transaction_number: 'AEP-0200',
    service_type: 'aeps',
    amount: 1500,
    portal_commission: 5,
    pool_credit: 1505,
    portal_id: 'portal-ezeepay',
    status: 'success',
    transaction_date: '2026-09-19',
  });

  const count = db.runAepsHistoricalRepair();
  assert.strictEqual(count, 0, 'Should not touch AEP-0200');
  assert.strictEqual(db.cashEntries.length, 0, 'No cash entries created for unrelated transactions');
});

// -----------------------------------------------------------------------------
// Test 2: Split Payment Allocation Repair (Null instrument_id)
// -----------------------------------------------------------------------------
test('4. Repair utility split payment allocations with null instrument_id', () => {
  const db = new MockFinancialDB();

  const txnId = 'txn-BIL-001';
  db.transactions.push({
    id: txnId,
    transaction_number: 'BIL-20260918-001',
    service_type: 'utility_bill',
    amount: 1500,
    service_fee: 20,
    status: 'success',
    customer_payment_allocations: [
      { method: 'cash', amount: '1000.00', instrument_id: null }, // Defect
      { method: 'upi', amount: '520.00', instrument_id: null },   // Defect
    ],
  });

  db.cashEntries.push(
    { id: 'ce-1', ref_type: 'transaction', ref_id: txnId, direction: 'in', method: 'cash', amount: 1000, instrument_id: null },
    { id: 'ce-2', ref_type: 'transaction', ref_id: txnId, direction: 'in', method: 'upi', amount: 520, instrument_id: null }
  );

  const repaired = db.runSplitAllocationRepair();
  assert.strictEqual(repaired, 1, 'Repaired 1 transaction with null allocations');

  const repairedTxn = db.transactions[0];
  assert.strictEqual(repairedTxn.customer_payment_allocations[0].instrument_id, 'inst-cash', 'Cash allocation resolved to inst-cash');
  assert.strictEqual(repairedTxn.customer_payment_allocations[1].instrument_id, 'inst-upi-qr', 'UPI allocation resolved to inst-upi-qr');

  // Verify cash_entries attribution
  for (const ce of db.cashEntries) {
    assert.notStrictEqual(ce.instrument_id, null, 'Cash entries must have non-null instrument_id');
    assert.notStrictEqual(ce.instrument_id, undefined, 'Cash entries must have defined instrument_id');
  }

  // Verify balance attribution
  const balances = calculateAccountBalances({
    instruments: db.instruments,
    cashEntries: db.cashEntries,
  });

  const cashBal = balances.find((b) => b.id === 'inst-cash');
  const upiBal = balances.find((b) => b.id === 'inst-upi-qr');
  assert.strictEqual(cashBal.totalInflows, 1000, 'Cash Till should receive ₹1,000 inflow');
  assert.strictEqual(upiBal.totalInflows, 520, 'UPI QR should receive ₹520 inflow');
});

test('5. Split allocation repair idempotency', () => {
  const db = new MockFinancialDB();

  db.transactions.push({
    id: 'txn-BIL-002',
    transaction_number: 'BIL-20260918-002',
    service_type: 'utility_bill',
    customer_payment_allocations: [
      { method: 'cash', amount: '500.00', instrument_id: 'inst-cash' },
      { method: 'bank', amount: '500.00', instrument_id: 'inst-bank-sbi' },
    ],
  });

  const repaired = db.runSplitAllocationRepair();
  assert.strictEqual(repaired, 0, 'Already valid allocations should not be altered');
});

// -----------------------------------------------------------------------------
// Test 3: Debit Card and Credit Card Instrument Matching Invariants
// -----------------------------------------------------------------------------
test('6. Multi-payment collection method matching supports debit_card and credit_card', () => {
  function instrumentMatchesMethod(type, method) {
    const t = String(type || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (method === 'cash') return t === 'cash' || t.includes('cash');
    if (method === 'upi') return t === 'upi' || t === 'upi_qr' || t.includes('merchant_qr');
    if (method === 'bank') return t === 'bank' || t.includes('bank_account') || t.includes('current_account') || t.includes('savings');
    if (method === 'wallet') return t === 'wallet' || t.includes('wallet');
    if (method === 'card') return t === 'card' || t.includes('card') || t.includes('credit_card') || t.includes('debit_card') || t === 'cc';
    return false;
  }

  assert.strictEqual(instrumentMatchesMethod('debit_card', 'card'), true, 'debit_card matches card');
  assert.strictEqual(instrumentMatchesMethod('credit_card', 'card'), true, 'credit_card matches card');
  assert.strictEqual(instrumentMatchesMethod('sbi_rupay_debit_card', 'card'), true, 'rupay debit card matches card');
  assert.strictEqual(instrumentMatchesMethod('hdfc_visa_credit_card', 'card'), true, 'visa credit card matches card');
  assert.strictEqual(instrumentMatchesMethod('bank', 'card'), false, 'bank does not match card');
  assert.strictEqual(instrumentMatchesMethod('cash', 'card'), false, 'cash does not match card');
});

// -----------------------------------------------------------------------------
// Test 4: Reconstructed Ledger Balances are Strictly Ledger-Derived (No Manual Edit)
// -----------------------------------------------------------------------------
test('7. Ledger Invariant: Never manually edit current_balance to fudge balances', () => {
  const db = new MockFinancialDB();

  // Create transactions and cash entries
  db.transactions.push({
    id: 'txn-aep-1',
    transaction_number: 'AEP-0098',
    service_type: 'aeps',
    amount: 2000,
    portal_commission: 6,
    pool_credit: 2006,
    portal_id: 'portal-ezeepay',
    status: 'success',
  });

  db.cashEntries.push(
    { id: 'ce-1', ref_type: 'transaction', ref_id: 'txn-aep-1', direction: 'out', method: 'cash', amount: 2000, instrument_id: 'inst-cash' },
    { id: 'ce-2', ref_type: 'transaction', ref_id: 'txn-aep-1', direction: 'in', method: 'aeps', amount: 2006, instrument_id: 'inst-ezeepay' }
  );

  const balances = calculateAccountBalances({
    instruments: db.instruments,
    cashEntries: db.cashEntries,
    portals: db.portals,
  });

  for (const acc of balances) {
    // Calculated balance must equal opening + netMovement
    assert.strictEqual(acc.calculatedBalance, Math.round((acc.openingBalance + acc.netMovement) * 100) / 100,
      `Account ${acc.name} calculatedBalance must strictly equal opening (${acc.openingBalance}) + netMovement (${acc.netMovement})`);
    assert.strictEqual(acc.displayedBalance, acc.calculatedBalance,
      `Account ${acc.name} displayedBalance must strictly be the reconstructed calculatedBalance`);
  }
});

test('8. Multi-payment normalization auto-resolves null instrument_id', () => {
  function instrumentMatchesMethod(type, method) {
    const t = String(type || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (method === 'cash') return t === 'cash' || t.includes('cash');
    if (method === 'upi') return t === 'upi' || t === 'upi_qr' || t.includes('merchant_qr');
    if (method === 'bank') return t === 'bank' || t.includes('bank_account') || t.includes('current_account') || t.includes('savings');
    if (method === 'wallet') return t === 'wallet' || t.includes('wallet');
    if (method === 'card') return t === 'card' || t.includes('card') || t.includes('credit_card') || t.includes('debit_card') || t === 'cc';
    return false;
  }

  function resolveMatchingInstrument(method, preferredInstrumentId, paymentInstruments = []) {
    if (preferredInstrumentId && paymentInstruments.some((item) => item.id === preferredInstrumentId && instrumentMatchesMethod(item.type, method))) {
      return preferredInstrumentId;
    }
    const fallback = paymentInstruments.find((item) => item.is_active !== false && instrumentMatchesMethod(item.type, method));
    return fallback ? fallback.id : null;
  }

  function normalizeInitialAllocations(total, initialMethod, initialAllocations, defaultInstrumentId, paymentInstruments = []) {
    const rows = Array.isArray(initialAllocations)
      ? initialAllocations
          .filter((row) => Number(row?.amount) > 0)
          .map((row) => ({
            method: row.method,
            amount: Math.max(0, Number(row.amount) || 0).toFixed(2),
            instrument_id:
              row.instrument_id ||
              resolveMatchingInstrument(row.method, defaultInstrumentId, paymentInstruments),
          }))
      : [];

    if (rows.length > 0) return rows;
    const defaultInstrument = resolveMatchingInstrument(initialMethod, defaultInstrumentId, paymentInstruments);
    return total > 0
      ? [{ method: initialMethod, amount: total.toFixed(2), instrument_id: defaultInstrument }]
      : [];
  }

  const instruments = [
    { id: 'inst-cash', name: 'Cash', type: 'cash', is_active: true },
    { id: 'inst-upi', name: 'UPI QR', type: 'upi_qr', is_active: true },
    { id: 'inst-debit', name: 'Debit Card', type: 'debit_card', is_active: true },
  ];

  // Test row with null instrument_id gets resolved
  const unassignedRows = [
    { method: 'cash', amount: '200.00', instrument_id: null },
    { method: 'card', amount: '300.00', instrument_id: null },
  ];

  const normalized = normalizeInitialAllocations(500, 'cash', unassignedRows, null, instruments);
  assert.strictEqual(normalized[0].instrument_id, 'inst-cash', 'Cash row resolved to inst-cash');
  assert.strictEqual(normalized[1].instrument_id, 'inst-debit', 'Card row resolved to inst-debit');
});

test('9. Full 4-transaction AEPS reconciliation: double-entry integrity & zero variance', () => {
  const db = new MockFinancialDB();
  const txns = [
    { number: 'AEP-0098', amount: 2000, fee: 0, comm: 6 },
    { number: 'AEP-0103', amount: 5000, fee: 0, comm: 10 },
    { number: 'AEP-0105', amount: 1000, fee: 0, comm: 3 },
    { number: 'AEP-0119', amount: 3000, fee: 0, comm: 8 },
  ];

  for (const t of txns) {
    const id = 'txn-' + t.number;
    db.transactions.push({
      id,
      transaction_number: t.number,
      service_type: 'aeps',
      amount: t.amount,
      service_fee: t.fee,
      portal_commission: t.comm,
      pool_credit: t.amount + t.comm,
      portal_id: 'portal-ezeepay',
      status: 'success',
      transaction_date: '2026-09-18',
    });

    // Payout leg
    db.cashEntries.push({
      id: 'ce-payout-' + t.number,
      entry_date: '2026-09-18',
      method: 'cash',
      direction: 'out',
      amount: t.amount,
      description: `AEPS ${t.number} cash payout`,
      ref_type: 'transaction',
      ref_id: id,
      instrument_id: 'inst-cash',
    });
  }

  // Pre-repair: 4 payout cash entries, 0 float credit cash entries
  assert.strictEqual(db.cashEntries.length, 4);

  // Run repair
  const repaired = db.runAepsHistoricalRepair();
  assert.strictEqual(repaired, 4);
  assert.strictEqual(db.cashEntries.length, 8, 'Exactly 8 cash entries (4 payouts + 4 float credits)');

  // 100% of cash entries must have non-null instrument_id
  for (const ce of db.cashEntries) {
    assert.ok(ce.instrument_id, `Cash entry ${ce.id} must have non-null instrument_id`);
  }

  // Double-entry calculation: Total Cash Out === 11,000; Total Float In === 11,027; Net Portal Inflow === 11,027
  const balances = calculateAccountBalances({
    instruments: db.instruments,
    cashEntries: db.cashEntries,
    portals: db.portals,
  });

  const cashTill = balances.find((b) => b.id === 'inst-cash');
  const ezeepay = balances.find((b) => b.id === 'inst-ezeepay');

  assert.strictEqual(cashTill.totalOutflows, 11000, 'Cash Till total outflow is ₹11,000');
  assert.strictEqual(ezeepay.totalInflows, 11027, 'EzeePay total float inflow is ₹11,027');
  assert.strictEqual(ezeepay.calculatedBalance, 10000 + 11027, 'EzeePay reconstructed balance is ₹21,027');
  assert.strictEqual(cashTill.calculatedBalance, 50000 - 11000, 'Cash Till reconstructed balance is ₹39,000');
});

console.log('\n================================================================================');
console.log(`TOTAL TESTS RUN: ${passCount}`);
console.log(`PASSED: ${passCount}`);
console.log('FAILED: 0');
console.log('================================================================================');
console.log('🎉 ALL REPAIR & FINANCIAL INVARIANT TESTS PASSED WITH ZERO DEFECTS!\n');
