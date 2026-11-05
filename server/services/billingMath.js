function toAmount(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const amount = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(amount) ? amount : fallback;
}

function roundMoney(value) {
  const amount = toAmount(value, 0);
  const sign = amount < 0 ? -1 : 1;
  return (Math.round((Math.abs(amount) + Number.EPSILON) * 100) / 100) * sign;
}

function nonNegative(value, fallback = 0) {
  const amount = roundMoney(toAmount(value, fallback));
  return amount > 0 ? amount : 0;
}

function computeBillTotals({ items = [], manualDiscount = 0, amountPaid, paymentMode } = {}) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + roundMoney(item.subtotal), 0));
  const exchangeDiscount = roundMoney(
    items.reduce((sum, item) => sum + nonNegative(item.exchange_discount), 0)
  );
  const normalizedManualDiscount = nonNegative(manualDiscount);
  const grandTotal = roundMoney(Math.max(0, subtotal - exchangeDiscount - normalizedManualDiscount));

  const hasAmountPaid = amountPaid !== undefined && amountPaid !== null && amountPaid !== '';
  let paidAmount = hasAmountPaid
    ? nonNegative(amountPaid)
    : (paymentMode === 'Credit' ? 0 : grandTotal);

  paidAmount = roundMoney(Math.min(paidAmount, grandTotal));
  const balanceDue = roundMoney(grandTotal - paidAmount);

  return {
    subtotal,
    exchangeDiscount,
    manualDiscount: normalizedManualDiscount,
    grandTotal,
    paidAmount,
    balanceDue
  };
}

function sumPending(bills = []) {
  return roundMoney(
    bills
      .filter((bill) => bill.status !== 'cancelled')
      .reduce((sum, bill) => sum + nonNegative(bill.balance_due), 0)
  );
}

function allocatePayment(bills = [], amount = 0) {
  const available = nonNegative(amount);
  let remaining = available;
  const allocations = [];

  for (const bill of bills) {
    if (remaining <= 0) break;
    if (bill.status === 'cancelled') continue;

    const previousBalance = nonNegative(bill.balance_due);
    if (previousBalance <= 0) continue;

    const allocation = roundMoney(Math.min(remaining, previousBalance));
    if (allocation <= 0) continue;

    remaining = roundMoney(remaining - allocation);
    allocations.push({
      billId: bill.id,
      billNo: bill.bill_no,
      allocation,
      previousBalance,
      newBalance: roundMoney(previousBalance - allocation)
    });
  }

  return {
    allocations,
    unallocated: remaining,
    applied: roundMoney(available - remaining)
  };
}

module.exports = {
  toAmount,
  roundMoney,
  nonNegative,
  computeBillTotals,
  sumPending,
  allocatePayment
};
