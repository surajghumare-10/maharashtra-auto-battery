const express = require('express');
const router = express.Router();
const { db, nowSql } = require('../db');
const { authenticateToken, requireRole, requireInventoryAccess } = require('../auth');

// POST /stock/add - Add Stock / Stock In (Owner / Manager)
router.post('/add', authenticateToken, requireRole(['owner', 'manager']), async (req, res) => {
  const {
    battery_id,
    quantity,
    cost_price,
    supplier_id,
    supplier_name,
    reference_id,
    date,
    notes,
    total_cost,
    amount_paid,
    payment_mode = 'Cash'
  } = req.body;

  if (!battery_id || !quantity) {
    return res.status(400).json({ error: 'Battery model and quantity are required' });
  }

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive integer' });
  }

  const battery = await db.get('SELECT * FROM batteries WHERE id = ?', Number(battery_id));
  if (!battery) {
    return res.status(404).json({ error: 'Battery model not found' });
  }

  const unitCost = cost_price !== undefined && !isNaN(parseFloat(cost_price))
    ? Math.max(0, parseFloat(cost_price))
    : battery.cost_price;

  const purchaseTotal = total_cost !== undefined && total_cost !== '' && !isNaN(parseFloat(total_cost))
    ? Math.max(0, parseFloat(total_cost))
    : qty * unitCost;
  const paidNow = amount_paid !== undefined && amount_paid !== '' && !isNaN(parseFloat(amount_paid))
    ? Math.min(Math.max(0, parseFloat(amount_paid)), purchaseTotal)
    : 0;
  const balanceDue = Math.max(0, purchaseTotal - paidNow);

  let dealerId = supplier_id ? Number(supplier_id) : null;
  let dealerName = supplier_name ? supplier_name.trim() : null;

  if (dealerId) {
    const dealer = await db.get('SELECT * FROM suppliers WHERE id = ?', dealerId);
    if (!dealer) {
      return res.status(404).json({ error: 'Dealer / supplier not found' });
    }
    dealerName = dealer.name;
  } else if (dealerName) {
    const existing = await db.get('SELECT * FROM suppliers WHERE LOWER(name) = LOWER(?)', dealerName);
    if (existing) {
      dealerId = existing.id;
      dealerName = existing.name;
    } else {
      const created = await db.run('INSERT INTO suppliers (name, notes) VALUES (?, ?)', dealerName, 'Auto-created from stock purchase');
      dealerId = created.lastInsertRowid;
    }
  }

  const movementId = await db.transaction(async (tx) => {
    await tx.run(`
      UPDATE batteries
      SET current_stock = current_stock + ?,
          cost_price = CASE WHEN ? > 0 THEN ? ELSE cost_price END
      WHERE id = ?
    `, qty, unitCost, unitCost, battery.id);

    const createdAt = date ? '?' : nowSql;
    const movementParams = [
      battery.id,
      qty,
      unitCost,
      dealerName || 'Supplier Inward',
      dealerId,
      reference_id ? reference_id.trim() : null,
      notes ? notes.trim() : 'Stock Inward / Purchase',
      purchaseTotal,
      paidNow,
      balanceDue,
      req.user.id,
      req.user.name
    ];
    if (date) movementParams.push(date);
    const result = await tx.run(`
      INSERT INTO stock_movements (
        battery_id, type, quantity, cost_price, supplier_name, supplier_id, reference_id, reason,
        total_cost, amount_paid, balance_due, user_id, user_name, created_at
      ) VALUES (?, 'in', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${createdAt})
    `, ...movementParams);

    if (paidNow > 0 && dealerId) {
      await tx.run(`
        INSERT INTO supplier_payments (supplier_id, amount, payment_mode, reference_no, notes, paid_by, paid_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        dealerId,
        paidNow,
        ['Cash', 'UPI', 'Bank Transfer', 'Cheque'].includes(payment_mode) ? payment_mode : 'Cash',
        reference_id ? reference_id.trim() : null,
        `Payment for stock purchase (${qty} x ${battery.brand} ${battery.model_name})`,
        req.user.id,
        req.user.name
      );
    }

    return result.lastInsertRowid;
  });

  const updatedBattery = await db.get('SELECT * FROM batteries WHERE id = ?', battery.id);

  res.status(201).json({
    message: `Added ${qty} units to ${battery.brand} ${battery.model_name}`,
    battery: updatedBattery,
    movementId,
    dealer_id: dealerId,
    purchase: { total_cost: purchaseTotal, amount_paid: paidNow, balance_due: balanceDue }
  });
});

// POST /stock/adjust - Manual stock adjustment with MANDATORY reason (Owner / Manager)
router.post('/adjust', authenticateToken, requireRole(['owner', 'manager']), async (req, res) => {
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

  const battery = await db.get('SELECT * FROM batteries WHERE id = ?', Number(battery_id));
  if (!battery) {
    return res.status(404).json({ error: 'Battery model not found' });
  }

  const diff = targetQty - battery.current_stock;
  if (diff === 0) {
    return res.status(400).json({ error: 'New quantity is same as current stock. No change needed.' });
  }

  await db.transaction(async (tx) => {
    await tx.run('UPDATE batteries SET current_stock = ? WHERE id = ?', targetQty, battery.id);

    await tx.run(`
      INSERT INTO stock_movements (battery_id, type, quantity, reason, user_id, user_name)
      VALUES (?, 'adjustment', ?, ?, ?, ?)
    `,
      battery.id,
      diff,
      `Manual Adjustment (${battery.current_stock} -> ${targetQty}): ${reason.trim()}`,
      req.user.id,
      req.user.name
    );
  });

  const updated = await db.get('SELECT * FROM batteries WHERE id = ?', battery.id);
  res.json({
    message: `Stock updated for ${battery.brand} ${battery.model_name} to ${targetQty}`,
    battery: updated
  });
});

// GET /stock/movements - Stock history log
router.get('/movements', authenticateToken, requireInventoryAccess, async (req, res) => {
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
    query += ' AND sm.created_at::date >= ?::date';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND sm.created_at::date <= ?::date';
    params.push(endDate);
  }

  query += ' ORDER BY sm.id DESC LIMIT 200';

  const movements = await db.all(query, ...params);
  res.json({ movements });
});

// GET /stock/old-batteries - Old battery inventory summary & scrap sales
router.get('/old-batteries', authenticateToken, requireInventoryAccess, async (req, res) => {
  const inStockSummary = await db.all(`
    SELECT battery_type, brand, COUNT(*) AS count
    FROM old_battery_stock
    WHERE status = 'in_stock'
    GROUP BY battery_type, brand
    ORDER BY count DESC
  `);

  const totalInStock = (await db.get(`
    SELECT COUNT(*) AS count FROM old_battery_stock WHERE status = 'in_stock'
  `)).count;

  const scrapSales = await db.all(`
    SELECT * FROM scrap_sales ORDER BY id DESC LIMIT 50
  `);

  res.json({
    inStockSummary,
    totalInStock,
    scrapSales
  });
});

// POST /stock/old-batteries/scrap-sale - Record scrap sale of old batteries (Owner only)
router.post('/old-batteries/scrap-sale', authenticateToken, requireRole(['owner']), async (req, res) => {
  const { scrap_dealer_name, count_to_sell, amount_received, payment_mode, notes } = req.body;

  if (!scrap_dealer_name || !count_to_sell || amount_received === undefined) {
    return res.status(400).json({ error: 'Scrap dealer name, battery count, and amount received are required' });
  }

  const count = parseInt(count_to_sell, 10);
  const amount = parseFloat(amount_received);

  const availableOldCount = (await db.get("SELECT COUNT(*) AS count FROM old_battery_stock WHERE status = 'in_stock'")).count;
  if (count > availableOldCount) {
    return res.status(400).json({ error: `Cannot sell ${count} batteries. Only ${availableOldCount} old batteries currently in stock.` });
  }

  const saleId = await db.transaction(async (tx) => {
    const saleRes = await tx.run(`
      INSERT INTO scrap_sales (scrap_dealer_name, total_batteries_count, amount_received, payment_mode, notes, sold_by, sold_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      scrap_dealer_name.trim(),
      count,
      amount,
      payment_mode || 'Cash',
      notes ? notes.trim() : null,
      req.user.id,
      req.user.name
    );

    const newSaleId = saleRes.lastInsertRowid;

    const targetBatteries = await tx.all(`
      SELECT id FROM old_battery_stock WHERE status = 'in_stock' ORDER BY id ASC LIMIT ?
    `, count);

    for (const b of targetBatteries) {
      await tx.run("UPDATE old_battery_stock SET status = 'sold_as_scrap', scrap_sale_id = ? WHERE id = ?", newSaleId, b.id);
    }

    return newSaleId;
  });

  res.status(201).json({ message: `Recorded scrap sale of ${count} old batteries for ₹${amount}`, saleId });
});

module.exports = router;
