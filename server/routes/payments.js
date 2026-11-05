const express = require('express');
const router = express.Router();
const { db, nowSql } = require('../db');
const { authenticateToken, requireDuesAccess } = require('../auth');
const { renderTemplate, sendNotification, generateWaMeUrl, getSetting } = require('../services/messaging');
const { syncPayment } = require('../services/googleSheets');
const { roundMoney, allocatePayment } = require('../services/billingMath');

async function getNextReceiptNo() {
  const lastPayment = await db.get('SELECT id FROM payments ORDER BY id DESC LIMIT 1');
  const nextId = (lastPayment ? lastPayment.id : 0) + 1;
  return `REC-${String(nextId).padStart(4, '0')}`;
}

// POST /payments - Record payment against customer's pending dues
router.post('/', authenticateToken, requireDuesAccess, async (req, res) => {
  const { customer_id, amount, payment_mode, notes } = req.body;

  if (!customer_id || !amount || !payment_mode) {
    return res.status(400).json({ error: 'Customer ID, amount, and payment mode are required' });
  }

  const payAmount = roundMoney(amount);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    return res.status(400).json({ error: 'Payment amount must be greater than zero' });
  }

  const validModes = ['Cash', 'UPI', 'Card'];
  if (!validModes.includes(payment_mode)) {
    return res.status(400).json({ error: 'Payment mode must be Cash, UPI, or Card' });
  }

  const customer = await db.get('SELECT * FROM customers WHERE id = ?', Number(customer_id));
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const pendingRow = await db.get(`
    SELECT COALESCE(SUM(GREATEST(balance_due, 0)), 0) AS pending
    FROM bills
    WHERE customer_id = ? AND status != 'cancelled'
  `, customer_id);
  const pendingBefore = roundMoney(pendingRow ? pendingRow.pending : 0);

  if (payAmount > pendingBefore) {
    return res.status(400).json({
      error: `Payment of ₹${payAmount.toLocaleString('en-IN')} exceeds the pending balance of ₹${pendingBefore.toLocaleString('en-IN')}.`
    });
  }

  const receiptNo = await getNextReceiptNo();

  let paymentId;
  try {
    paymentId = await db.transaction(async (tx) => {
      const unpaidBills = await tx.all(`
        SELECT id, bill_no, grand_total, amount_paid, balance_due
        FROM bills
        WHERE customer_id = ? AND status != 'cancelled' AND balance_due > 0
        ORDER BY id ASC
      `, customer_id);

      const plan = allocatePayment(unpaidBills, payAmount);
      if (plan.unallocated > 0) {
        const err = new Error('Pending balance changed while recording the payment. Please retry.');
        err.status = 409;
        throw err;
      }

      const primaryBillId = plan.allocations.length > 0 ? plan.allocations[0].billId : null;

      for (const allocation of plan.allocations) {
        const update = await tx.run(`
          UPDATE bills
          SET amount_paid = amount_paid + ?,
              balance_due = ?,
              updated_at = ${nowSql}
          WHERE id = ? AND ABS(balance_due - ?) < 0.005
        `, allocation.allocation, allocation.newBalance, allocation.billId, allocation.previousBalance);

        if (update.changes !== 1) {
          const err = new Error('Bill balance changed while recording the payment. Please retry.');
          err.status = 409;
          throw err;
        }
      }

      const payRes = await tx.run(`
        INSERT INTO payments (
          receipt_no, customer_id, bill_id, amount, payment_mode, notes,
          received_by, received_by_name, whatsapp_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `,
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
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }

  const balanceRow = await db.get(`
    SELECT COALESCE(SUM(balance_due), 0) AS remaining_balance
    FROM bills
    WHERE customer_id = ? AND status != 'cancelled'
  `, customer_id);

  const remainingBalance = Math.max(0, balanceRow ? balanceRow.remaining_balance : 0);

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
    await db.run('UPDATE payments SET whatsapp_status = ? WHERE id = ?', msgStatus, paymentId);
  } catch (err) {
    console.error('Payment receipt message failed:', err);
    msgStatus = 'failed';
    await db.run("UPDATE payments SET whatsapp_status = 'failed' WHERE id = ?", paymentId);
  }

  const createdPayment = await db.get('SELECT * FROM payments WHERE id = ?', paymentId);

  try {
    await syncPayment(createdPayment, customer);
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
router.get('/customer/:id', authenticateToken, requireDuesAccess, async (req, res) => {
  const customerId = Number(req.params.id);
  const payments = await db.all(`
    SELECT * FROM payments WHERE customer_id = ? ORDER BY id DESC
  `, customerId);

  res.json({ payments });
});

module.exports = router;
