const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../auth');

// GET /batteries (accessible by all authenticated staff: Owner, Manager, Worker)
router.get('/', authenticateToken, async (req, res) => {
  const { type, search } = req.query;

  let query = 'SELECT * FROM batteries WHERE is_active = 1';
  const params = [];

  if (type && type !== 'all') {
    query += ' AND type = ?';
    params.push(type);
  }

  if (search && search.trim()) {
    query += ' AND (brand ILIKE ? OR model_name ILIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term);
  }

  query += ' ORDER BY brand ASC, model_name ASC';

  const rows = await db.all(query, ...params);

  const result = rows.map(r => {
    if (req.user.role === 'worker') {
      const { cost_price, ...rest } = r;
      return rest;
    }
    return r;
  });

  res.json({ batteries: result });
});

// GET /batteries/:id
router.get('/:id', authenticateToken, async (req, res) => {
  const battery = await db.get('SELECT * FROM batteries WHERE id = ?', Number(req.params.id));
  if (!battery) {
    return res.status(404).json({ error: 'Battery model not found' });
  }
  if (req.user.role === 'worker') {
    delete battery.cost_price;
  }
  res.json({ battery });
});

// POST /batteries (Owner / Manager can add models)
router.post('/', authenticateToken, requireRole(['owner', 'manager']), async (req, res) => {
  const {
    brand,
    model_name,
    type,
    capacity_ah,
    warranty_months,
    selling_price,
    cost_price = 0,
    exchange_discount = 0,
    current_stock = 0,
    low_stock_alert = 2
  } = req.body;

  if (!brand || !model_name || !type || !selling_price) {
    return res.status(400).json({ error: 'Brand, model name, type, and selling price are required' });
  }

  const validTypes = ['Car', 'Bike', 'Inverter', 'Tractor', 'Truck', 'E-rickshaw'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid battery type. Allowed: ${validTypes.join(', ')}` });
  }

  const batteryId = await db.transaction(async (tx) => {
    const result = await tx.run(`
      INSERT INTO batteries (
        brand, model_name, type, capacity_ah, warranty_months,
        selling_price, cost_price, exchange_discount, current_stock, low_stock_alert
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      brand.trim(),
      model_name.trim(),
      type,
      Number(capacity_ah) || 0,
      Number(warranty_months) || 12,
      Number(selling_price) || 0,
      Number(cost_price) || 0,
      Number(exchange_discount) || 0,
      Number(current_stock) || 0,
      Number(low_stock_alert) || 2
    );

    if (Number(current_stock) > 0) {
      await tx.run(`
        INSERT INTO stock_movements (battery_id, type, quantity, cost_price, supplier_name, reason, user_id, user_name)
        VALUES (?, 'in', ?, ?, 'Initial Setup', 'Model Creation', ?, ?)
      `,
        result.lastInsertRowid,
        Number(current_stock),
        Number(cost_price) || 0,
        req.user.id,
        req.user.name
      );
    }

    return result.lastInsertRowid;
  });

  const created = await db.get('SELECT * FROM batteries WHERE id = ?', batteryId);
  res.status(201).json({ battery: created });
});

// PUT /batteries/:id (Owner / Manager can edit models & prices)
router.put('/:id', authenticateToken, requireRole(['owner', 'manager']), async (req, res) => {
  const id = Number(req.params.id);
  const target = await db.get('SELECT * FROM batteries WHERE id = ?', id);
  if (!target) {
    return res.status(404).json({ error: 'Battery model not found' });
  }

  const {
    brand = target.brand,
    model_name = target.model_name,
    type = target.type,
    capacity_ah = target.capacity_ah,
    warranty_months = target.warranty_months,
    selling_price = target.selling_price,
    cost_price = target.cost_price,
    exchange_discount = target.exchange_discount,
    low_stock_alert = target.low_stock_alert
  } = req.body;

  await db.run(`
    UPDATE batteries
    SET brand = ?, model_name = ?, type = ?, capacity_ah = ?, warranty_months = ?,
        selling_price = ?, cost_price = ?, exchange_discount = ?, low_stock_alert = ?
    WHERE id = ?
  `,
    brand.trim(),
    model_name.trim(),
    type,
    Number(capacity_ah),
    Number(warranty_months),
    Number(selling_price),
    Number(cost_price),
    Number(exchange_discount),
    Number(low_stock_alert),
    id
  );

  const updated = await db.get('SELECT * FROM batteries WHERE id = ?', id);
  res.json({ battery: updated });
});

// DELETE /batteries/:id (Owner only)
router.delete('/:id', authenticateToken, requireRole(['owner']), async (req, res) => {
  const id = Number(req.params.id);
  const target = await db.get('SELECT * FROM batteries WHERE id = ?', id);
  if (!target) {
    return res.status(404).json({ error: 'Battery model not found' });
  }

  await db.run('UPDATE batteries SET is_active = 0 WHERE id = ?', id);
  res.json({ message: 'Battery model deactivated successfully' });
});

module.exports = router;
