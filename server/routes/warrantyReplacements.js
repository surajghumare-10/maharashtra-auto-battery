const express = require('express');
const router = express.Router();
const { db, nowSql } = require('../db');
const { authenticateToken, requireRole } = require('../auth');
const { warrantyExpiry, isWarrantyExpired } = require('../services/warrantyDates');

function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

async function findOldBattery(serial) {
  const item = await db.get(`
    SELECT bi.id AS item_id, bi.serial_number, bi.battery_id, bi.brand, bi.model_name,
           bi.type, bi.capacity_ah, bi.warranty_months,
           b.id AS bill_id, b.bill_no, b.customer_id, b.customer_name,
           b.customer_mobile, b.created_at
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    WHERE b.status <> 'cancelled' AND LOWER(bi.serial_number) = LOWER(?)
    ORDER BY b.id DESC LIMIT 1
  `, serial);

  if (item) {
    const months = Number(item.warranty_months) || 0;
    return {
      source: 'bill',
      old_bill_id: item.bill_id,
      old_bill_item_id: item.item_id,
      old_bill_no: item.bill_no,
      customer_id: item.customer_id,
      customer_name: item.customer_name,
      customer_mobile: item.customer_mobile,
      battery_id: item.battery_id,
      battery_brand: item.brand,
      battery_model: item.model_name,
      battery_type: item.type,
      capacity_ah: item.capacity_ah,
      warranty_months: months,
      warranty_expires_at: warrantyExpiry(item.created_at, months),
      purchase_date: item.created_at
    };
  }

  const prior = await db.get(`
    SELECT * FROM warranty_replacements
    WHERE status <> 'cancelled' AND LOWER(new_serial_number) = LOWER(?)
    ORDER BY id DESC LIMIT 1
  `, serial);

  if (prior) {
    return {
      source: 'replacement',
      old_bill_id: prior.old_bill_id,
      old_bill_item_id: prior.old_bill_item_id,
      old_bill_no: prior.old_bill_no,
      customer_id: prior.customer_id,
      customer_name: prior.customer_name,
      customer_mobile: prior.customer_mobile,
      battery_id: prior.battery_id,
      battery_brand: prior.battery_brand,
      battery_model: prior.battery_model,
      battery_type: prior.battery_type,
      capacity_ah: null,
      warranty_months: prior.warranty_months,
      warranty_expires_at: prior.warranty_expires_at || warrantyExpiry(prior.replacement_date, prior.warranty_months),
      purchase_date: prior.replacement_date
    };
  }

  return null;
}

router.get('/', authenticateToken, async (req, res) => {
  const { status, search } = req.query;
  let query = 'SELECT * FROM warranty_replacements WHERE 1=1';
  const params = [];

  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ` AND (
      old_serial_number ILIKE ? OR new_serial_number ILIKE ? OR
      customer_name ILIKE ? OR customer_mobile LIKE ? OR
      supplier_name ILIKE ? OR old_bill_no ILIKE ?
    )`;
    params.push(term, term, term, term, term, term);
  }

  query += ' ORDER BY id DESC LIMIT 50';

  const replacements = await db.all(query, ...params);
  const stats = await db.get(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending_dealer') AS pending,
      COUNT(*) FILTER (WHERE status = 'replacement_received') AS received,
      COUNT(*) AS total
    FROM warranty_replacements
  `);

  res.json({ replacements, stats });
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const oldSerial = String(req.body.old_serial_number || '').trim();
    const newSerial = String(req.body.new_serial_number || '').trim();

    if (!oldSerial) {
      return res.status(400).json({ error: 'Old battery serial number is required' });
    }
    if (!newSerial) {
      return res.status(400).json({ error: 'New battery serial number is required' });
    }
    if (oldSerial.toLowerCase() === newSerial.toLowerCase()) {
      return res.status(400).json({ error: 'Old and new serial numbers must be different' });
    }

    const source = await findOldBattery(oldSerial);
    if (!source) {
      return res.status(404).json({ error: `No warranty record found for serial number ${oldSerial}` });
    }

    const existing = await db.get(`
      SELECT id, old_serial_number, new_serial_number, status, replacement_date
      FROM warranty_replacements
      WHERE status <> 'cancelled' AND LOWER(old_serial_number) = LOWER(?)
      ORDER BY id DESC LIMIT 1
    `, oldSerial);

    if (existing) {
      return res.status(409).json({
        error: `A warranty replacement is already recorded for serial ${oldSerial}`,
        replacement: existing
      });
    }

    if (isWarrantyExpired(source.warranty_expires_at)) {
      return res.status(400).json({
        error: `Warranty expired for serial ${oldSerial} on ${source.warranty_expires_at}`
      });
    }

    const soldNew = await db.get(`
      SELECT b.bill_no
      FROM bill_items bi
      JOIN bills b ON b.id = bi.bill_id
      WHERE b.status <> 'cancelled' AND LOWER(bi.serial_number) = LOWER(?)
      ORDER BY b.id DESC LIMIT 1
    `, newSerial);
    if (soldNew) {
      return res.status(409).json({
        error: `New serial ${newSerial} is already recorded on bill ${soldNew.bill_no}`
      });
    }

    const usedNew = await db.get(`
      SELECT id, old_serial_number, new_serial_number, status
      FROM warranty_replacements
      WHERE status <> 'cancelled' AND LOWER(new_serial_number) = LOWER(?)
      ORDER BY id DESC LIMIT 1
    `, newSerial);
    if (usedNew) {
      return res.status(409).json({
        error: `New serial ${newSerial} was already issued in an earlier warranty replacement`
      });
    }

    const claimedOld = await db.get(`
      SELECT id, status
      FROM warranty_replacements
      WHERE status <> 'cancelled' AND LOWER(old_serial_number) = LOWER(?)
      ORDER BY id DESC LIMIT 1
    `, newSerial);
    if (claimedOld) {
      return res.status(409).json({
        error: `New serial ${newSerial} has already been sent to a dealer for replacement`
      });
    }

    let supplierId = req.body.supplier_id ? Number(req.body.supplier_id) : null;
    let supplierName = String(req.body.supplier_name || '').trim() || null;

    if (supplierId) {
      const supplier = await db.get('SELECT id, name FROM suppliers WHERE id = ?', supplierId);
      if (!supplier) {
        return res.status(404).json({ error: 'Dealer / supplier not found' });
      }
      supplierId = supplier.id;
      supplierName = supplier.name;
    } else if (supplierName) {
      const supplier = await db.get('SELECT id, name FROM suppliers WHERE LOWER(name) = LOWER(?)', supplierName);
      if (supplier) {
        supplierId = supplier.id;
        supplierName = supplier.name;
      }
    }

    const notes = String(req.body.notes || '').trim() || null;

    const record = await db.transaction(async (tx) => {
      const battery = await tx.get('SELECT * FROM batteries WHERE id = ? FOR UPDATE', source.battery_id);
      if (!battery) {
        throw httpError(400, 'Replacement battery model not found');
      }
      if (battery.current_stock < 1) {
        throw httpError(409, `Insufficient stock for ${battery.brand} ${battery.model_name}. Current stock: ${battery.current_stock}.`);
      }

      await tx.run('UPDATE batteries SET current_stock = current_stock - 1 WHERE id = ?', battery.id);

      await tx.run(`
        INSERT INTO stock_movements (
          battery_id, type, quantity, cost_price, supplier_id, supplier_name,
          reference_id, reason, user_id, user_name
        ) VALUES (?, 'warranty_out', -1, ?, ?, ?, ?, ?, ?, ?)
      `,
        battery.id,
        battery.cost_price || 0,
        supplierId,
        supplierName,
        newSerial,
        `Warranty replacement ${oldSerial} -> ${newSerial}; old battery sent to dealer`,
        req.user.id,
        req.user.name
      );

      const inserted = await tx.run(`
        INSERT INTO warranty_replacements (
          old_serial_number, new_serial_number, old_bill_id, old_bill_item_id, old_bill_no,
          customer_id, customer_name, customer_mobile, battery_id, battery_brand, battery_model,
          battery_type, supplier_id, supplier_name, warranty_months, warranty_expires_at,
          notes, created_by, created_by_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        oldSerial,
        newSerial,
        source.old_bill_id,
        source.old_bill_item_id,
        source.old_bill_no,
        source.customer_id,
        source.customer_name,
        source.customer_mobile,
        source.battery_id,
        source.battery_brand,
        source.battery_model,
        source.battery_type,
        supplierId,
        supplierName,
        source.warranty_months,
        source.warranty_expires_at,
        notes,
        req.user.id,
        req.user.name
      );

      return tx.get('SELECT * FROM warranty_replacements WHERE id = ?', inserted.lastInsertRowid);
    });

    res.status(201).json({ replacement: record });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'This serial number is already used in another warranty replacement' });
    }
    next(error);
  }
});

router.post('/:id/received', authenticateToken, requireRole(['owner', 'manager']), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid warranty replacement id' });
    }

    const record = await db.transaction(async (tx) => {
      const claim = await tx.get('SELECT * FROM warranty_replacements WHERE id = ? FOR UPDATE', id);
      if (!claim) {
        throw httpError(404, 'Warranty replacement not found');
      }
      if (claim.status === 'replacement_received') {
        throw httpError(400, 'Dealer replacement is already marked received');
      }
      if (claim.status !== 'pending_dealer') {
        throw httpError(400, 'This warranty replacement cannot be marked received');
      }

      const battery = await tx.get('SELECT * FROM batteries WHERE id = ? FOR UPDATE', claim.battery_id);
      if (!battery) {
        throw httpError(400, 'Battery model not found for this warranty replacement');
      }

      await tx.run('UPDATE batteries SET current_stock = current_stock + 1 WHERE id = ?', claim.battery_id);

      await tx.run(`
        INSERT INTO stock_movements (
          battery_id, type, quantity, cost_price, supplier_id, supplier_name,
          reference_id, reason, user_id, user_name
        ) VALUES (?, 'warranty_in', 1, ?, ?, ?, ?, ?, ?, ?)
      `,
        claim.battery_id,
        battery.cost_price || 0,
        claim.supplier_id,
        claim.supplier_name,
        claim.old_serial_number,
        `Dealer replacement received for ${claim.old_serial_number}`,
        req.user.id,
        req.user.name
      );

      await tx.run(`
        UPDATE warranty_replacements
        SET status = 'replacement_received',
            dealer_received_at = ${nowSql},
            dealer_received_by = ?,
            dealer_received_by_name = ?,
            updated_at = ${nowSql}
        WHERE id = ?
      `, req.user.id, req.user.name, id);

      return tx.get('SELECT * FROM warranty_replacements WHERE id = ?', id);
    });

    res.json({ replacement: record });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
