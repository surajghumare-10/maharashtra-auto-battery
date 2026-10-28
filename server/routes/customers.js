const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken } = require('../auth');

// GET /customers
router.get('/', authenticateToken, (req, res) => {
  const { search } = req.query;

  let query = `
    SELECT 
      c.id, c.name, c.mobile, c.address, c.village, c.last_vehicle_number, c.created_at,
      COALESCE(SUM(b.grand_total), 0) AS total_purchases,
      COALESCE(SUM(b.amount_paid), 0) AS total_paid,
      COALESCE(SUM(b.balance_due), 0) AS pending_balance,
      MAX(b.created_at) AS last_purchase_date,
      (SELECT MAX(created_at) FROM payments WHERE customer_id = c.id) AS last_payment_date
    FROM customers c
    LEFT JOIN bills b ON b.customer_id = c.id AND b.status != 'cancelled'
  `;

  const params = [];
  if (search && search.trim()) {
    query += ' WHERE c.name LIKE ? OR c.mobile LIKE ? OR c.village LIKE ? OR c.last_vehicle_number LIKE ?';
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  query += ' GROUP BY c.id ORDER BY c.updated_at DESC';

  const customers = db.prepare(query).all(...params);
  res.json({ customers });
});

// GET /customers/lookup/:mobile - Auto lookup for New Bill screen
router.get('/lookup/:mobile', authenticateToken, (req, res) => {
  const mobile = String(req.params.mobile).replace(/\D/g, '').slice(-10);
  if (!mobile || mobile.length < 10) {
    return res.status(400).json({ error: 'Valid 10-digit mobile number required' });
  }

  const customer = db.prepare(`
    SELECT 
      c.id, c.name, c.mobile, c.address, c.village, c.last_vehicle_number,
      COALESCE(SUM(b.grand_total), 0) AS total_purchases,
      COALESCE(SUM(b.amount_paid), 0) AS total_paid,
      COALESCE(SUM(b.balance_due), 0) AS pending_balance
    FROM customers c
    LEFT JOIN bills b ON b.customer_id = c.id AND b.status != 'cancelled'
    WHERE c.mobile = ?
    GROUP BY c.id
  `).get(mobile);

  if (!customer) {
    return res.json({ found: false });
  }

  // Get recent 3 bills for quick reference at counter
  const recentBills = db.prepare(`
    SELECT id, bill_no, battery_brand, battery_model, grand_total, balance_due, created_at, serial_number
    FROM bills
    WHERE customer_id = ? AND status != 'cancelled'
    ORDER BY id DESC LIMIT 3
  `).all(customer.id);

  const itemsStmt = db.prepare('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id ASC');
  const recentBillsWithItems = recentBills.map(b => ({ ...b, items: itemsStmt.all(b.id) }));

  res.json({ found: true, customer: { ...customer, recentBills: recentBillsWithItems } });
});

// GET /customers/:id - Customer profile with full bill & payment history
router.get('/:id', authenticateToken, (req, res) => {
  const customerId = Number(req.params.id);

  const customer = db.prepare(`
    SELECT 
      c.id, c.name, c.mobile, c.address, c.village, c.last_vehicle_number, c.created_at,
      COALESCE(SUM(b.grand_total), 0) AS total_purchases,
      COALESCE(SUM(b.amount_paid), 0) AS total_paid,
      COALESCE(SUM(b.balance_due), 0) AS pending_balance
    FROM customers c
    LEFT JOIN bills b ON b.customer_id = c.id AND b.status != 'cancelled'
    WHERE c.id = ?
    GROUP BY c.id
  `).get(customerId);

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  // All bills for customer
  const bills = db.prepare(`
    SELECT *
    FROM bills
    WHERE customer_id = ?
    ORDER BY id DESC
  `).all(customerId);

  const itemsStmt = db.prepare('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id ASC');
  const billsWithItems = bills.map(b => ({ ...b, items: itemsStmt.all(b.id) }));

  // All payments for customer
  const payments = db.prepare(`
    SELECT *
    FROM payments
    WHERE customer_id = ?
    ORDER BY id DESC
  `).all(customerId);

  res.json({
    customer,
    bills: billsWithItems,
    payments
  });
});

module.exports = router;
