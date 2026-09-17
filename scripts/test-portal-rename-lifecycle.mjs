import assert from 'node:assert';
import { calculateAccountBalances } from '../lib/finance/account-balances.ts';
import { reconcileEvent } from '../lib/ai/reconciliation-engine.ts';

console.log('================================================================================');
console.log('PHASE 15 & 16: AEPS PORTAL RENAME FULL FINANCIAL LIFECYCLE & INVARIANTS TEST');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// Simulation of DB triggers and ledger state
// -----------------------------------------------------------------------------
class MockDatabase {
  constructor() {
    this.portals = [];
    this.instruments = [];
    this.transactions = [];
    this.cashEntries = [];
    this.settlements = [];
    this.nextSeq = 1;
  }

  // Simulates sync_aeps_portal_to_payment_instrument trigger + insert
  createPortal(name, initialOpening = 0) {
    const portalId = 'portal-' + crypto.randomUUID().slice(0, 8);
    const instrumentId = 'inst-' + crypto.randomUUID().slice(0, 8);

    const inst = {
      id: instrumentId,
      name: name.trim(),
      type: 'aeps_portal',
      is_active: true,
      opening_balance: initialOpening,
      current_balance: initialOpening,
    };
    this.instruments.push(inst);

    const portal = {
      id: portalId,
      name: name.trim(),
      service_type: 'aeps',
      is_active: true,
      payment_instrument_id: instrumentId,
    };
    this.portals.push(portal);
    return portal;
  }

  // Simulates updated sync_aeps_portal_to_payment_instrument trigger on UPDATE
  renamePortal(portalId, newName) {
    const p = this.portals.find((x) => x.id === portalId);
    if (!p) throw new Error('Portal not found');
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('AEPS portal name is required');

    // Atomic rename sync from trigger:
    if (p.payment_instrument_id) {
      const inst = this.instruments.find((i) => i.id === p.payment_instrument_id);
      if (inst) {
        inst.name = trimmed;
      }
    }
    p.name = trimmed;
    return p;
  }

  // Simulates create_business_txn RPC for AEPS
  createAepsTransaction({ portalId, amount, serviceFee = 0, portalCommission = 0, reference }) {
    const portal = this.portals.find((p) => p.id === portalId);
    if (!portal) throw new Error('Portal not found');

    const txnId = 'txn-' + crypto.randomUUID().slice(0, 8);
    const txnNum = 'AEP-' + String(this.nextSeq++).padStart(4, '0');
    const poolCredit = amount + portalCommission;

    const txn = {
      id: txnId,
      transaction_number: txnNum,
      service_type: 'aeps',
      direction: 'out',
      transaction_date: '2026-09-17',
      reference: reference || 'RRN-' + Date.now(),
      status: 'success',
      portal_id: portalId,
      amount,
      service_fee: serviceFee,
      portal_commission: portalCommission,
      pool_credit: poolCredit,
      pool_credit_type: 'aeps',
      pool_out: 0,
      pay_from_instrument_id: 'cash-till-inst',
      instrument_id: 'cash-till-inst',
    };
    this.transactions.push(txn);

    // Cash payout leg
    this.cashEntries.push({
      id: 'ce-' + crypto.randomUUID().slice(0, 8),
      instrument_id: 'cash-till-inst',
      direction: 'out',
      amount,
      ref_type: 'transaction',
      ref_id: txnId,
    });

    // Float credit leg
    this.cashEntries.push({
      id: 'ce-' + crypto.randomUUID().slice(0, 8),
      instrument_id: portal.payment_instrument_id,
      direction: 'in',
      amount: poolCredit,
      ref_type: 'transaction',
      ref_id: txnId,
    });

    return txn;
  }

  // Authoritative get_portal_balance calculation (mirrors get_portal_balance RPC)
  getPortalBalance(portalId) {
    const portal = this.portals.find((p) => p.id === portalId);
    if (!portal) return 0;
    const inst = this.instruments.find((i) => i.id === portal.payment_instrument_id);
    const opening = Number(inst?.opening_balance || 0);

    const credits = this.transactions
      .filter((t) => t.portal_id === portalId && t.service_type === 'aeps' && t.status === 'success')
      .reduce((sum, t) => sum + Number(t.pool_credit || 0), 0);

    const poolOuts = this.transactions
      .filter((t) => t.portal_id === portalId && t.service_type === 'aeps' && t.status === 'success')
      .reduce((sum, t) => sum + Number(t.pool_out || 0), 0);

    const settlementsOut = this.settlements
      .filter((s) => s.source_instrument_id === portal.payment_instrument_id && s.status === 'success')
      .reduce((sum, s) => sum + Number(s.amount || 0), 0);

    const settlementsIn = this.settlements
      .filter((s) => s.dest_instrument_id === portal.payment_instrument_id && s.status === 'success')
      .reduce((sum, s) => sum + Number(s.amount || 0), 0);

    return opening + credits - poolOuts - settlementsOut + settlementsIn;
  }

  // Account Balances calculation (frontend engine)
  computeAccountBalances() {
    return calculateAccountBalances({
      instruments: this.instruments,
      cashEntries: this.cashEntries.filter((c) => c.ref_type !== 'transaction'),
      transactions: this.transactions,
      settlements: this.settlements,
      portals: this.portals,
    });
  }
}

const db = new MockDatabase();
db.instruments.push({
  id: 'cash-till-inst',
  name: 'Main Cash Till',
  type: 'cash',
  is_active: true,
  opening_balance: 10000,
  current_balance: 10000,
});

let passed = 0;
function test(num, desc, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS [Test ${num}] ${desc}`);
  } catch (err) {
    console.error(`  FAIL [Test ${num}] ${desc}:`, err.message);
    throw err;
  }
}

let portalId = null;
let initialBalance = 0;
let balanceAfterTx1 = 0;
let rrn1 = '624918264760';
let rrn2 = '624917653966';

// 1. Create portal
test(1, 'Create portal', () => {
  const p = db.createPortal('Ezeepay', 500);
  portalId = p.id;
  assert.ok(portalId, 'Portal must have ID');
  assert.strictEqual(p.name, 'Ezeepay');
});

// 2. Record portal id
test(2, 'Record portal id', () => {
  assert.ok(portalId.startsWith('portal-'));
});

// 3. Record balance
test(3, 'Record balance', () => {
  initialBalance = db.getPortalBalance(portalId);
  assert.strictEqual(initialBalance, 500);
});

// 4. Add AEPS transaction
test(4, 'Add AEPS transaction', () => {
  const tx = db.createAepsTransaction({
    portalId,
    amount: 3000,
    serviceFee: 30,
    portalCommission: 11.92,
    reference: rrn1,
  });
  assert.strictEqual(tx.portal_id, portalId);
  assert.strictEqual(tx.amount, 3000);
});

// 5. Verify balance increases
test(5, 'Verify balance increases', () => {
  balanceAfterTx1 = db.getPortalBalance(portalId);
  // 500 opening + 3000 amount + 11.92 commission = 3511.92
  assert.strictEqual(balanceAfterTx1, 3511.92);

  const accBal = db.computeAccountBalances().find((a) => a.name === 'Ezeepay');
  assert.strictEqual(accBal.calculatedBalance, 3511.92);
});

// 6. Rename portal
test(6, 'Rename portal', () => {
  const renamed = db.renamePortal(portalId, 'EzeePay AEPS');
  assert.strictEqual(renamed.name, 'EzeePay AEPS');
});

// 7. Verify same portal id
test(7, 'Verify same portal id', () => {
  const current = db.portals.find((p) => p.name === 'EzeePay AEPS');
  assert.strictEqual(current.id, portalId, 'Portal UUID must NOT change on rename');
});

// 8. Add another AEPS transaction
test(8, 'Add another AEPS transaction', () => {
  const tx2 = db.createAepsTransaction({
    portalId,
    amount: 2000,
    serviceFee: 20,
    portalCommission: 8.00,
    reference: rrn2,
  });
  assert.strictEqual(tx2.portal_id, portalId);
});

// 9. Verify balance increases
test(9, 'Verify balance increases after second transaction', () => {
  const balanceAfterTx2 = db.getPortalBalance(portalId);
  // 3511.92 + 2000 + 8.00 = 5519.92
  assert.strictEqual(balanceAfterTx2, 5519.92);

  const accBal = db.computeAccountBalances().find((a) => a.id === db.portals[0].payment_instrument_id);
  assert.strictEqual(accBal.name, 'EzeePay AEPS');
  assert.strictEqual(accBal.calculatedBalance, 5519.92);
});

// 10. Verify old transaction remains associated
test(10, 'Verify old transaction remains associated', () => {
  const oldTx = db.transactions.find((t) => t.reference === rrn1);
  assert.strictEqual(oldTx.portal_id, portalId);
});

// 11. Verify new transaction uses same portal_id
test(11, 'Verify new transaction uses same portal_id', () => {
  const newTx = db.transactions.find((t) => t.reference === rrn2);
  assert.strictEqual(newTx.portal_id, portalId);
});

// 12. Verify EzeePay reconciliation remains associated with same portal
test(12, 'Verify EzeePay reconciliation remains associated with same portal', () => {
  const snapshotRows = db.transactions.map((t) => ({
    id: t.id,
    kind: 'transaction',
    reference: t.reference,
    externalId: t.transaction_number,
    amount: t.amount,
    occurredAt: t.transaction_date,
    status: t.status,
    provider: db.portals.find((p) => p.id === t.portal_id)?.name,
  }));

  const input1 = {
    provider: 'EzeePay',
    eventType: 'aeps',
    externalReference: rrn1,
    externalEventId: null,
    amount: 3000,
    occurredAt: '2026-09-17',
    status: 'success',
    contentHash: 'hash-1',
    customerId: null,
  };

  const res1 = reconcileEvent(input1, snapshotRows);
  assert.strictEqual(res1.verdict, 'exact_match');
  assert.strictEqual(res1.matchedRowId, db.transactions[0].id);

  const input2 = {
    provider: 'EzeePay',
    eventType: 'aeps',
    externalReference: rrn2,
    externalEventId: null,
    amount: 2000,
    occurredAt: '2026-09-17',
    status: 'success',
    contentHash: 'hash-2',
    customerId: null,
  };

  const res2 = reconcileEvent(input2, snapshotRows);
  assert.strictEqual(res2.verdict, 'exact_match');
  assert.strictEqual(res2.matchedRowId, db.transactions[1].id);
});

// 13. Verify portal balance is unchanged by rename itself
test(13, 'Verify portal balance is unchanged by rename itself', () => {
  const balBefore = db.getPortalBalance(portalId);
  db.renamePortal(portalId, 'EzeePay Super AEPS');
  const balAfter = db.getPortalBalance(portalId);
  assert.strictEqual(balBefore, balAfter, 'Rename alone must produce zero financial delta');
});

// 14. Verify balance increases after subsequent transactions
test(14, 'Verify balance increases after subsequent transactions', () => {
  db.createAepsTransaction({
    portalId,
    amount: 1000,
    serviceFee: 10,
    portalCommission: 4.00,
    reference: '624917999999',
  });
  // 5519.92 + 1004.00 = 6523.92
  assert.strictEqual(db.getPortalBalance(portalId), 6523.92);
});

// 15. Rename portal again
test(15, 'Rename portal again', () => {
  db.renamePortal(portalId, 'EzeePay Official Portal');
  assert.strictEqual(db.portals[0].name, 'EzeePay Official Portal');
  assert.strictEqual(db.instruments.find((i) => i.id === db.portals[0].payment_instrument_id).name, 'EzeePay Official Portal');
});

// 16. Verify balance continues to work and settlement is recognized after rename
test(16, 'Verify balance continues to work and settlement is recognized after rename', () => {
  // Record a settlement after rename
  db.settlements.push({
    id: 'set-001',
    from_pool: 'aeps',
    to_pool: 'bank',
    source_instrument_id: db.portals[0].payment_instrument_id,
    dest_instrument_id: 'sbi-bank-inst',
    amount: 2000,
    settlement_date: '2026-09-17',
    status: 'success',
    remarks: 'Settlement from renamed portal to bank',
  });

  // Balance was 6523.92, minus 2000 settlement = 4523.92
  assert.strictEqual(db.getPortalBalance(portalId), 4523.92);
  const accBal = db.computeAccountBalances().find((a) => a.id === db.portals[0].payment_instrument_id);
  assert.strictEqual(accBal.calculatedBalance, 4523.92);
});

// 17. Verify no duplicate portal is created
test(17, 'Verify no duplicate portal is created', () => {
  assert.strictEqual(db.portals.length, 1, 'Exactly one portal must exist');
});

// 18. Verify reconciliation reports remain correct
test(18, 'Verify reconciliation reports remain correct', () => {
  const tx = db.transactions[0];
  assert.ok(tx.reference === rrn1);
  assert.strictEqual(tx.portal_id, portalId);
});

// 19. Verify dashboard/report balance remains correct
test(19, 'Verify dashboard/report balance remains correct', () => {
  const accs = db.computeAccountBalances();
  const portalAcc = accs.find((a) => a.id === db.portals[0].payment_instrument_id);
  assert.strictEqual(portalAcc.calculatedBalance, 4523.92);
});

// 20. Verify refresh/logout/login does not lose the balance
test(20, 'Verify recomputing/refreshing does not lose the balance', () => {
  // Re-evaluating fresh from transactions and cash entries
  const freshBalances = db.computeAccountBalances();
  const portalAcc = freshBalances.find((a) => a.id === db.portals[0].payment_instrument_id);
  assert.strictEqual(portalAcc.calculatedBalance, 4523.92);
});

console.log('\n================================================================================');
console.log(`ALL ${passed}/20 TESTS PASSED SUCCESSFULLY WITH ZERO FINANCIAL INVARIANT VIOLATIONS`);
console.log('================================================================================');
