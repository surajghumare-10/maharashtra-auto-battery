const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireDuesAccess } = require('../auth');
const { renderTemplate, sendNotification, generateWaMeUrl, getSetting } = require('../services/messaging');
const { syncPayment } = require('../services/googleSheets');

function getNextReceiptNo() {
  const lastPayment = db.prepare('SELECT id FROM payments ORDER BY id DESC LIMIT 1').get();
  const nextId = (lastPayment ? lastPayment.id : 0) + 1;
  return `REC-${String(nextId).padStart(4, '0')}`;
}

// POST /payments - Record payment against customer's pending dues
router.post('/', authenticateToken, requireDuesAccess, async (req, res) => {
  const { customer_id, amount, payment_mode, notes } = req.body;

  if (!customer_id || !amount || !payment_mode) {
    return res.status(400).json({ error: 'Customer ID, amount, and payment mode are required' });
  }

  const payAmount = parseFloat(amount);
  if (isNaN(payAmount) || payAmount <= 0) {
    return res.status(400).json({ error: 'Payment amount must be greater than zero' });
  }

  const validModes = ['Cash', 'UPI', 'Card'];
  if (!validModes.includes(payment_mode)) {
    return res.status(400).json({ error: 'Payment mode must be Cash, UPI, or Card' });
  }

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  // bills.balance_due is the single source of truth (payment allocation already
  // increments bills.amount_paid). Never add the payments table on top of it.
  const pendingRow = db.prepare(`
    SELECT COALESCE(SUM(balance_due), 0) AS pending
    FROM bills
    WHERE customer_id = ? AND status != 'cancelled'
  `).get(customer_id);
  const pendingBefore = pendingRow ? pendingRow.pending : 0;

  if (payAmount > pendingBefore) {
    return res.status(400).json({
      error: `Payment of ₹${payAmount.toLocaleString('en-IN')} exceeds the pending balance of ₹${pendingBefore.toLocaleString('en-IN')}.`
    });
  }

  const receiptNo = getNextReceiptNo();

  // Allocation transaction: apply to oldest unpaid bills first!
  const recordTransaction = db.transaction(() => {
    let unallocatedAmount = payAmount;

    // Fetch unpaid bills ordered by oldest first
    const unpaidBills = db.prepare(`
      SELECT id, bill_no, grand_total, amount_paid, balance_due
      FROM bills
      WHERE customer_id = ? AND status != 'cancelled' AND balance_due > 0
      ORDER BY id ASC
    `).all(customer_id);

    let primaryBillId = unpaidBills.length > 0 ? unpaidBills[0].id : null;

    for (const b of unpaidBills) {
      if (unallocatedAmount <= 0) break;
      const dueOnBill = b.balance_due;
      const allocation = Math.min(unallocatedAmount, dueOnBill);

      db.prepare(`
        UPDATE bills
        SET amount_paid = amount_paid + ?,
            balance_due = balance_due - ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(allocation, allocation, b.id);

      unallocatedAmount -= allocation;
    }

    // Insert payment record
    const payRes = db.prepare(`
      INSERT INTO payments (
        receipt_no, customer_id, bill_id, amount, payment_mode, notes,
        received_by, received_by_name, whatsapp_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      receiptNo,
      customer_id,
      primaryBillId,
      payAmount,
      payment_mode,
      notes ? notes.trim() : null,
      req.user.id,
      req.user.name
    );

    return payRes.lastInsertRowid;
  });

  const paymentId = recordTransaction();

  // Compute fresh balance from bills only
  const balanceRow = db.prepare(`
    SELECT COALESCE(SUM(balance_due), 0) AS remaining_balance
    FROM bills
    WHERE customer_id = ? AND status != 'cancelled'
  `).get(customer_id);

  const remainingBalance = Math.max(0, balanceRow ? balanceRow.remaining_balance : 0);

  // Send WhatsApp/SMS receipt
  const template = getSetting('msg_template_payment');
  const nowStr = new Date().toISOString().split('T')[0];
  const msgText = renderTemplate(template, {
    receipt_no: receiptNo,
    date: nowStr,
    customer_name: customer.name,
    amount: payAmount.toLocaleString('en-IN'),
    payment_mode,
    remaining_balance: remainingBalance.toLocaleString('en-IN')
  });

  const waMeUrl = generateWaMeUrl(customer.mobile, msgText);
  let msgStatus = 'pending';

  try {
    const notifyRes = await sendNotification(customer.mobile, msgText);
    msgStatus = notifyRes.status;
    db.prepare('UPDATE payments SET whatsapp_status = ? WHERE id = ?').run(msgStatus, paymentId);
  } catch (err) {
    console.error('Payment receipt message failed:', err);
    msgStatus = 'failed';
    db.prepare("UPDATE payments SET whatsapp_status = 'failed' WHERE id = ?").run(paymentId);
  }

  const createdPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);

  try {
    syncPayment(createdPayment, customer);
  } catch (e) {
    // non-blocking
  }

  res.status(201).json({
    payment: createdPayment,
    remainingBalance,
    messaging: {
      status: msgStatus,
      waMeUrl
    }
  });
});

// GET /payments/customer/:id - All payments for a customer
router.get('/customer/:id', authenticateToken, requireDuesAccess, (req, res) => {
  const customerId = Number(req.params.id);
  const payments = db.prepare(`
    SELECT * FROM payments WHERE customer_id = ? ORDER BY id DESC
  `).all(customerId);

  res.json({ payments });
});

module.exports = router;
