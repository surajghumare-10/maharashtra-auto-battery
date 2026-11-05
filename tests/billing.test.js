const test = require('node:test');
const assert = require('node:assert/strict');

const {
  roundMoney,
  computeBillTotals,
  sumPending,
  allocatePayment
} = require('../server/services/billingMath');

test('roundMoney rounds to two decimals', () => {
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(4150.555), 4150.56);
  assert.equal(roundMoney(-1.005), -1.01);
});

test('computes multi-item totals with exchange and manual discounts', () => {
  const totals = computeBillTotals({
    items: [
      { subtotal: 4150, exchange_discount: 600 },
      { subtotal: 3750, exchange_discount: 350 }
    ],
    manualDiscount: 50,
    amountPaid: 6900,
    paymentMode: 'Cash'
  });

  assert.deepEqual(totals, {
    subtotal: 7900,
    exchangeDiscount: 950,
    manualDiscount: 50,
    grandTotal: 6900,
    paidAmount: 6900,
    balanceDue: 0
  });
});

test('cash bill defaults to fully paid when amount is omitted', () => {
  const totals = computeBillTotals({
    items: [{ subtotal: 4500, exchange_discount: 0 }],
    paymentMode: 'Cash'
  });

  assert.equal(totals.grandTotal, 4500);
  assert.equal(totals.paidAmount, 4500);
  assert.equal(totals.balanceDue, 0);
});

test('credit bill defaults to unpaid when amount is omitted', () => {
  const totals = computeBillTotals({
    items: [{ subtotal: 4500, exchange_discount: 0 }],
    paymentMode: 'Credit'
  });

  assert.equal(totals.paidAmount, 0);
  assert.equal(totals.balanceDue, 4500);
});

test('clamps overpayment and negative payment', () => {
  const overpaid = computeBillTotals({
    items: [{ subtotal: 4500, exchange_discount: 0 }],
    amountPaid: 5000,
    paymentMode: 'Cash'
  });
  assert.equal(overpaid.paidAmount, 4500);
  assert.equal(overpaid.balanceDue, 0);

  const negative = computeBillTotals({
    items: [{ subtotal: 4500, exchange_discount: 0 }],
    amountPaid: -100,
    paymentMode: 'Cash'
  });
  assert.equal(negative.paidAmount, 0);
  assert.equal(negative.balanceDue, 4500);
});

test('never allows a negative grand total', () => {
  const totals = computeBillTotals({
    items: [{ subtotal: 1000, exchange_discount: 1500 }],
    manualDiscount: 100,
    amountPaid: 0,
    paymentMode: 'Credit'
  });

  assert.equal(totals.exchangeDiscount, 1500);
  assert.equal(totals.manualDiscount, 100);
  assert.equal(totals.grandTotal, 0);
  assert.equal(totals.balanceDue, 0);
});

test('rounds line totals and totals to paise', () => {
  const totals = computeBillTotals({
    items: [
      { subtotal: 0.1 + 0.2, exchange_discount: 0 },
      { subtotal: 10.335, exchange_discount: 0.005 }
    ],
    manualDiscount: 0.005,
    amountPaid: 5.555,
    paymentMode: 'Cash'
  });

  assert.equal(totals.subtotal, 10.64);
  assert.equal(totals.exchangeDiscount, 0.01);
  assert.equal(totals.manualDiscount, 0.01);
  assert.equal(totals.grandTotal, 10.62);
  assert.equal(totals.paidAmount, 5.56);
  assert.equal(totals.balanceDue, 5.06);
});

test('sumPending ignores cancelled bills and negative balances', () => {
  const total = sumPending([
    { status: 'completed', balance_due: 1000 },
    { status: 'completed', balance_due: 250.5 },
    { status: 'cancelled', balance_due: 900 },
    { status: 'completed', balance_due: -50 }
  ]);

  assert.equal(total, 1250.5);
});

test('allocates payment oldest bill first', () => {
  const plan = allocatePayment([
    { id: 1, bill_no: 'MAB-0001', balance_due: 1000 },
    { id: 2, bill_no: 'MAB-0002', balance_due: 500 }
  ], 1200);

  assert.deepEqual(plan.allocations, [
    {
      billId: 1,
      billNo: 'MAB-0001',
      allocation: 1000,
      previousBalance: 1000,
      newBalance: 0
    },
    {
      billId: 2,
      billNo: 'MAB-0002',
      allocation: 200,
      previousBalance: 500,
      newBalance: 300
    }
  ]);
  assert.equal(plan.applied, 1200);
  assert.equal(plan.unallocated, 0);
});

test('partial payment leaves the remaining balance due', () => {
  const plan = allocatePayment([
    { id: 1, bill_no: 'MAB-0001', balance_due: 1000 }
  ], 400);

  assert.equal(plan.allocations[0].allocation, 400);
  assert.equal(plan.allocations[0].newBalance, 600);
  assert.equal(plan.unallocated, 0);
});

test('overpayment is detected as unallocated', () => {
  const plan = allocatePayment([
    { id: 1, bill_no: 'MAB-0001', balance_due: 1000 }
  ], 1200);

  assert.equal(plan.allocations[0].allocation, 1000);
  assert.equal(plan.unallocated, 200);
  assert.equal(plan.applied, 1000);
});

test('allocation skips cancelled and zero-balance bills', () => {
  const plan = allocatePayment([
    { id: 1, bill_no: 'MAB-0001', status: 'cancelled', balance_due: 1000 },
    { id: 2, bill_no: 'MAB-0002', status: 'completed', balance_due: 0 },
    { id: 3, bill_no: 'MAB-0003', status: 'completed', balance_due: 750 }
  ], 750);

  assert.equal(plan.allocations.length, 1);
  assert.equal(plan.allocations[0].billId, 3);
  assert.equal(plan.allocations[0].newBalance, 0);
  assert.equal(plan.unallocated, 0);
});

test('allocation rounds paise without leaving negative balances', () => {
  const plan = allocatePayment([
    { id: 1, bill_no: 'MAB-0001', balance_due: 100.1 },
    { id: 2, bill_no: 'MAB-0002', balance_due: 100.2 }
  ], 200.3);

  assert.equal(plan.allocations[0].allocation, 100.1);
  assert.equal(plan.allocations[1].allocation, 100.2);
  assert.equal(plan.allocations[1].newBalance, 0);
  assert.equal(plan.unallocated, 0);
});
