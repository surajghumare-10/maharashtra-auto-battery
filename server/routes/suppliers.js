const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole, requireDuesAccess } = require('../auth');

// GET /suppliers - Dealer khata list with outstanding payables
router.get('/', authenticateToken, requireDuesAccess, (req, res) => {
  const { search, pendingOnly } = req.query;

  let query = `
    SELECT
      s.id, s.name, s.contact_person, s.mobile, s.city, s.notes, s.is_active, s.created_at,
      COALESCE((SELECT SUM(total_cost) FROM stock_movements sm WHERE sm.supplier_id = s.id AND sm.type = 'in'), 0) AS total_purchased,
      COALESCE((SELECT SUM(amount) FROM supplier_payments sp WHERE sp.supplier_id = s.id), 0) AS total_paid,
      COALESCE((SELECT MAX(created_at) FROM stock_movements sm WHERE sm.supplier_id = s.id AND sm.type = 'in'), NULL) AS last_purchase_date,
      COALESCE((SELECT MAX(created_at) FROM supplier_payments sp WHERE sp.supplier_id = s.id), NULL) AS last_payment_date
    FROM suppliers s
    WHERE COALESCE(s.is_active, 1) = 1
  `;
  const params = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ' AND (s.name LIKE ? OR s.mobile LIKE ? OR s.city LIKE ? OR s.contact_person LIKE ?)';
    params.push(term, term, term, term);
  }

  query += ' ORDER BY s.name ASC';

  const dealers = db.prepare(query).all(...params).map(d => ({
    ...d,
    balance_due: Math.max(0, (d.total_purchased || 0) - (d.total_paid || 0))
  }));

  const filtered = (pendingOnly === 'true' || pendingOnly === true)
    ? dealers.filter(d => d.balance_due > 0)
    : dealers;

  const totalPayable = dealers.reduce((sum, d) => sum + d.balance_due, 0);
  const totalPurchased = dealers.reduce((sum, d) => sum + (d.total_purchased || 0), 0);
  const totalPaid = dealers.reduce((sum, d) => sum + (d.total_paid || 0), 0);

  res.json({
    suppliers: filtered,
    summary: {
      totalPayable,
      totalPurchased,
      totalPaid,
      dealersWithDues: dealers.filter(d => d.balance_due > 0).length
    }
  });
});

// GET /suppliers/options - Lightweight dealer list for stock-entry dropdowns
router.get('/options', authenticateToken, (req, res) => {
  const suppliers = db.prepare(`
    SELECT id, name, city, mobile FROM suppliers
    WHERE COALESCE(is_active, 1) = 1
    ORDER BY name ASC
  `).all();
  res.json({ suppliers });
});

// POST /suppliers - Add a dealer / supplier
router.post('/', authenticateToken, requireRole(['owner', 'manager']), (req, res) => {
  const { name, contact_person, mobile, city, notes } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Dealer / supplier name is required' });
  }

  const existing = db.prepare('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (existing) {
    return res.status(400).json({ error: 'A dealer with this name already exists' });
  }

  const result = db.prepare(`
    INSERT INTO suppliers (name, contact_person, mobile, city, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    contact_person ? contact_person.trim() : null,
    mobile ? String(mobile).replace(/\D/g, '').slice(-10) : null,
    city ? city.trim() : null,
    notes ? notes.trim() : null
  );

  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ supplier });
});

// PUT /suppliers/:id - Edit dealer details
router.put('/:id', authenticateToken, requireRole(['owner', 'manager']), (req, res) => {
  const supplierId = Number(req.params.id);
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);

  if (!supplier) {
    return res.status(404).json({ error: 'Dealer / supplier not found' });
  }

  const { name = supplier.name, contact_person, mobile, city, notes } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Dealer / supplier name is required' });
  }

  db.prepare(`
    UPDATE suppliers
    SET name = ?, contact_person = ?, mobile = ?, city = ?, notes = ?
    WHERE id = ?
  `).run(
    name.trim(),
    contact_person !== undefined ? (contact_person ? contact_person.trim() : null) : supplier.contact_person,
    mobile !== undefined ? (mobile ? String(mobile).replace(/\D/g, '').slice(-10) : null) : supplier.mobile,
    city !== undefined ? (city ? city.trim() : null) : supplier.city,
    notes !== undefined ? (notes ? notes.trim() : null) : supplier.notes,
    supplierId
  );

  const updated = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
  res.json({ supplier: updated });
});

// GET /suppliers/:id - Dealer ledger (purchases + payments)
router.get('/:id', authenticateToken, requireDuesAccess, (req, res) => {
  const supplierId = Number(req.params.id);
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);

  if (!supplier) {
    return res.status(404).json({ error: 'Dealer / supplier not found' });
  }

  const purchases = db.prepare(`
    SELECT sm.*, b.brand, b.model_name, b.type AS battery_type, b.capacity_ah
    FROM stock_movements sm
    LEFT JOIN batteries b ON b.id = sm.battery_id
    WHERE sm.supplier_id = ? AND sm.type = 'in'
    ORDER BY sm.id DESC
  `).all(supplierId);

  const payments = db.prepare(`
    SELECT * FROM supplier_payments
    WHERE supplier_id = ?
    ORDER BY id DESC
  `).all(supplierId);

  const totalPurchased = purchases.reduce((sum, p) => sum + (p.total_cost || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  res.json({
    supplier,
    purchases,
    payments,
    summary: {
      total_purchased: totalPurchased,
      total_paid: totalPaid,
      balance_due: Math.max(0, totalPurchased - totalPaid)
    }
  });
});

// POST /suppliers/:id/payments - Pay a dealer (full or part payment)
router.post('/:id/payments', authenticateToken, requireDuesAccess, (req, res) => {
  const supplierId = Number(req.params.id);
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);

  if (!supplier) {
    return res.status(404).json({ error: 'Dealer / supplier not found' });
  }

  const { amount, payment_mode = 'Cash', reference_no, notes } = req.body;
  const payAmount = parseFloat(amount);

  if (isNaN(payAmount) || payAmount <= 0) {
    return res.status(400).json({ error: 'Payment amount must be greater than zero' });
  }

  const modes = ['Cash', 'UPI', 'Bank Transfer', 'Cheque'];
  if (!modes.includes(payment_mode)) {
    return res.status(400).json({ error: 'Payment mode must be Cash, UPI, Bank Transfer, or Cheque' });
  }

  const totalPurchased = db.prepare(`
    SELECT COALESCE(SUM(total_cost), 0) AS total FROM stock_movements
    WHERE supplier_id = ? AND type = 'in'
  `).get(supplierId).total;
  const totalPaid = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM supplier_payments WHERE supplier_id = ?
  `).get(supplierId).total;
  const payable = Math.max(0, totalPurchased - totalPaid);

  if (payAmount > payable) {
    return res.status(400).json({
      error: `Payment of ₹${payAmount.toLocaleString('en-IN')} exceeds the outstanding payable of ₹${payable.toLocaleString('en-IN')}.`
    });
  }

  const result = db.prepare(`
    INSERT INTO supplier_payments (supplier_id, amount, payment_mode, reference_no, notes, paid_by, paid_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    supplierId,
    payAmount,
    payment_mode,
    reference_no ? reference_no.trim() : null,
    notes ? notes.trim() : null,
    req.user.id,
    req.user.name
  );

  const payment = db.prepare('SELECT * FROM supplier_payments WHERE id = ?').get(result.lastInsertRowid);

  res.status(201).json({
    payment,
    remainingPayable: Math.max(0, payable - payAmount)
  });
});

module.exports = router;
