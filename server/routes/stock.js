const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole, requireInventoryAccess } = require('../auth');

// POST /stock/add - Add Stock / Stock In (Owner / Manager)
router.post('/add', authenticateToken, requireRole(['owner', 'manager']), (req, res) => {
  const { battery_id, quantity, cost_price, supplier_name, reference_id, date, notes } = req.body;

  if (!battery_id || !quantity) {
    return res.status(400).json({ error: 'Battery model and quantity are required' });
  }

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive integer' });
  }

  const battery = db.prepare('SELECT * FROM batteries WHERE id = ?').get(Number(battery_id));
  if (!battery) {
    return res.status(404).json({ error: 'Battery model not found' });
  }

  const unitCost = cost_price !== undefined ? parseFloat(cost_price) : battery.cost_price;

  const addTransaction = db.transaction(() => {
    // 1. Update battery current stock and optionally update default cost price
    db.prepare(`
      UPDATE batteries
      SET current_stock = current_stock + ?,
          cost_price = CASE WHEN ? > 0 THEN ? ELSE cost_price END
      WHERE id = ?
    `).run(qty, unitCost, unitCost, battery.id);

    // 2. Log stock movement
    const movementDate = date || new Date().toISOString().replace('T', ' ').substring(0, 19);
    const result = db.prepare(`
      INSERT INTO stock_movements (
        battery_id, type, quantity, cost_price, supplier_name, reference_id, reason, user_id, user_name, created_at
      ) VALUES (?, 'in', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      battery.id,
      qty,
      unitCost,
      supplier_name ? supplier_name.trim() : 'Supplier Inward',
      reference_id ? reference_id.trim() : null,
      notes ? notes.trim() : 'Stock Inward / Purchase',
      req.user.id,
      req.user.name,
      movementDate
    );

    return result.lastInsertRowid;
  });

  const movementId = addTransaction();
  const updatedBattery = db.prepare('SELECT * FROM batteries WHERE id = ?').get(battery.id);

  res.status(201).json({
    message: `Added ${qty} units to ${battery.brand} ${battery.model_name}`,
    battery: updatedBattery,
    movementId
  });
});

// POST /stock/adjust - Manual stock adjustment with MANDATORY reason (Owner / Manager)
router.post('/adjust', authenticateToken, requireRole(['owner', 'manager']), (req, res) => {
  const { battery_id, new_quantity, reason } = req.body;

  if (!battery_id || new_quantity === undefined) {
    return res.status(400).json({ error: 'Battery ID and new stock quantity are required' });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A mandatory reason is required for manual stock adjustment (e.g., Physical count correction, Transit damage, Warranty return to company)' });
  }

  const targetQty = parseInt(new_quantity, 10);
  if (isNaN(targetQty) || targetQty < 0) {
    return res.status(400).json({ error: 'New quantity must be zero or a positive number' });
  }

  const battery = db.prepare('SELECT * FROM batteries WHERE id = ?').get(Number(battery_id));
  if (!battery) {
    return res.status(404).json({ error: 'Battery model not found' });
  }

  const diff = targetQty - battery.current_stock;
  if (diff === 0) {
    return res.status(400).json({ error: 'New quantity is same as current stock. No change needed.' });
  }

  const adjustTransaction = db.transaction(() => {
    db.prepare('UPDATE batteries SET current_stock = ? WHERE id = ?').run(targetQty, battery.id);

    db.prepare(`
      INSERT INTO stock_movements (battery_id, type, quantity, reason, user_id, user_name)
      VALUES (?, 'adjustment', ?, ?, ?, ?)
    `).run(
      battery.id,
      diff,
      `Manual Adjustment (${battery.current_stock} -> ${targetQty}): ${reason.trim()}`,
      req.user.id,
      req.user.name
    );
  });

  adjustTransaction();

  const updated = db.prepare('SELECT * FROM batteries WHERE id = ?').get(battery.id);
  res.json({
    message: `Stock updated for ${battery.brand} ${battery.model_name} to ${targetQty}`,
    battery: updated
  });
});

// GET /stock/movements - Stock history log
router.get('/movements', authenticateToken, requireInventoryAccess, (req, res) => {
  const { battery_id, type, startDate, endDate } = req.query;

  let query = `
    SELECT sm.*, b.brand, b.model_name, b.type AS battery_type
    FROM stock_movements sm
    JOIN batteries b ON b.id = sm.battery_id
    WHERE 1=1
  `;
  const params = [];

  if (battery_id) {
    query += ' AND sm.battery_id = ?';
    params.push(Number(battery_id));
  }

  if (type && type !== 'all') {
    query += ' AND sm.type = ?';
    params.push(type);
  }

  if (startDate) {
    query += ' AND date(sm.created_at) >= date(?)';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND date(sm.created_at) <= date(?)';
    params.push(endDate);
  }

  query += ' ORDER BY sm.id DESC LIMIT 200';

  const movements = db.prepare(query).all(...params);
  res.json({ movements });
});

// GET /stock/old-batteries - Old battery inventory summary & scrap sales
router.get('/old-batteries', authenticateToken, requireInventoryAccess, (req, res) => {
  // Current in-stock old batteries grouped by type & brand
  const inStockSummary = db.prepare(`
    SELECT battery_type, brand, COUNT(*) AS count
    FROM old_battery_stock
    WHERE status = 'in_stock'
    GROUP BY battery_type, brand
    ORDER BY count DESC
  `).all();

  const totalInStock = db.prepare(`
    SELECT COUNT(*) AS count FROM old_battery_stock WHERE status = 'in_stock'
  `).get().count;

  // Recent scrap sales
  const scrapSales = db.prepare(`
    SELECT * FROM scrap_sales ORDER BY id DESC LIMIT 50
  `).all();

  res.json({
    inStockSummary,
    totalInStock,
    scrapSales
  });
});

// POST /stock/old-batteries/scrap-sale - Record scrap sale of old batteries (Owner only)
router.post('/old-batteries/scrap-sale', authenticateToken, requireRole(['owner']), (req, res) => {
  const { scrap_dealer_name, count_to_sell, amount_received, payment_mode, notes } = req.body;

  if (!scrap_dealer_name || !count_to_sell || amount_received === undefined) {
    return res.status(400).json({ error: 'Scrap dealer name, battery count, and amount received are required' });
  }

  const count = parseInt(count_to_sell, 10);
  const amount = parseFloat(amount_received);

  const availableOldCount = db.prepare("SELECT COUNT(*) AS count FROM old_battery_stock WHERE status = 'in_stock'").get().count;
  if (count > availableOldCount) {
    return res.status(400).json({ error: `Cannot sell ${count} batteries. Only ${availableOldCount} old batteries currently in stock.` });
  }

  const scrapTransaction = db.transaction(() => {
    // 1. Record scrap sale
    const saleRes = db.prepare(`
      INSERT INTO scrap_sales (scrap_dealer_name, total_batteries_count, amount_received, payment_mode, notes, sold_by, sold_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      scrap_dealer_name.trim(),
      count,
      amount,
      payment_mode || 'Cash',
      notes ? notes.trim() : null,
      req.user.id,
      req.user.name
    );

    const saleId = saleRes.lastInsertRowid;

    // 2. Mark oldest N old batteries as sold_as_scrap
    const targetBatteries = db.prepare(`
      SELECT id FROM old_battery_stock WHERE status = 'in_stock' ORDER BY id ASC LIMIT ?
    `).all(count);

    const updateStmt = db.prepare("UPDATE old_battery_stock SET status = 'sold_as_scrap', scrap_sale_id = ? WHERE id = ?");
    for (const b of targetBatteries) {
      updateStmt.run(saleId, b.id);
    }

    return saleId;
  });

  const saleId = scrapTransaction();
  res.status(201).json({ message: `Recorded scrap sale of ${count} old batteries for ₹${amount}`, saleId });
});

module.exports = router;
