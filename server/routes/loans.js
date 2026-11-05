const express = require('express');
const router = express.Router();
const { db, nowSql } = require('../db');
const { authenticateToken } = require('../auth');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

router.get('/', authenticateToken, async (req, res) => {
  const { status = 'open', direction, search } = req.query;
  let query = 'SELECT * FROM battery_loans WHERE 1=1';
  const params = [];

  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }

  if (direction && direction !== 'all') {
    query += ' AND direction = ?';
    params.push(direction);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ` AND (
      party_name ILIKE ? OR party_mobile LIKE ? OR serial_number ILIKE ? OR
      battery_brand ILIKE ? OR battery_model ILIKE ?
    )`;
    params.push(term, term, term, term, term);
  }

  query += ' ORDER BY id DESC LIMIT 200';

  const loans = await db.all(query, ...params);
  const stats = await db.get(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'open' AND direction = 'lent') AS open_lent,
      COUNT(*) FILTER (WHERE status = 'open' AND direction = 'borrowed') AS open_borrowed,
      COUNT(*) FILTER (WHERE status = 'open' AND expected_return_date IS NOT NULL AND expected_return_date < ?) AS overdue,
      COUNT(*) FILTER (WHERE status = 'open') AS open_total
    FROM battery_loans
  `, todayStr());

  res.json({ loans, stats });
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const direction = req.body.direction === 'borrowed' ? 'borrowed' : 'lent';
    const partyName = String(req.body.party_name || '').trim();
    const partyMobile = String(req.body.party_mobile || '').replace(/\D/g, '').slice(-10) || null;
    const partyType = ['Customer', 'Dealer', 'Staff', 'Other'].includes(req.body.party_type)
      ? req.body.party_type
      : 'Customer';
    const batteryId = Number(req.body.battery_id);
    const quantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);
    const serialNumber = String(req.body.serial_number || '').trim().toUpperCase() || null;
    const loanDate = String(req.body.loan_date || '').trim() || todayStr();
    const expectedReturnDate = String(req.body.expected_return_date || '').trim() || null;
    const notes = String(req.body.notes || '').trim() || null;

    if (!partyName) {
      return res.status(400).json({ error: 'Please enter the name of the person or dealer' });
    }
    if (!Number.isInteger(batteryId) || batteryId <= 0) {
      return res.status(400).json({ error: 'Please select a battery model' });
    }

    if (serialNumber) {
      const existing = await db.get(`
        SELECT id, direction, party_name
        FROM battery_loans
        WHERE status = 'open' AND LOWER(serial_number) = LOWER(?)
        ORDER BY id DESC LIMIT 1
      `, serialNumber);
      if (existing) {
        return res.status(409).json({
          error: `Serial ${serialNumber} is already on an open ${existing.direction} loan for ${existing.party_name}`
        });
      }
    }

    const loan = await db.transaction(async (tx) => {
      const battery = await tx.get('SELECT * FROM batteries WHERE id = ? AND is_active = 1 FOR UPDATE', batteryId);
      if (!battery) {
        throw httpError(404, 'Battery model not found');
      }

      if (direction === 'lent' && battery.current_stock < quantity) {
        throw httpError(409, `Insufficient stock for ${battery.brand} ${battery.model_name}. Available: ${battery.current_stock}, required: ${quantity}.`);
      }

      const inserted = await tx.run(`
        INSERT INTO battery_loans (
          direction, party_name, party_mobile, party_type, battery_id, battery_brand,
          battery_model, battery_type, quantity, serial_number, loan_date,
          expected_return_date, notes, created_by, created_by_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        direction,
        partyName,
        partyMobile,
        partyType,
        battery.id,
        battery.brand,
        battery.model_name,
        battery.type,
        quantity,
        serialNumber,
        loanDate,
        expectedReturnDate,
        notes,
        req.user.id,
        req.user.name
      );

      const newId = inserted.lastInsertRowid;
      const stockDelta = direction === 'lent' ? -quantity : quantity;
      const movementType = direction === 'lent' ? 'loan_out' : 'loan_in';
      const movementReason = direction === 'lent'
        ? `Battery lent to ${partyName}`
        : `Battery borrowed from ${partyName}`;

      await tx.run('UPDATE batteries SET current_stock = current_stock + ? WHERE id = ?', stockDelta, battery.id);
      await tx.run(`
        INSERT INTO stock_movements (
          battery_id, type, quantity, cost_price, reference_id, reason, user_id, user_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        battery.id,
        movementType,
        stockDelta,
        battery.cost_price || 0,
        `LOAN-${newId}`,
        movementReason,
        req.user.id,
        req.user.name
      );

      return tx.get('SELECT * FROM battery_loans WHERE id = ?', newId);
    });

    res.status(201).json({ loan });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/return', authenticateToken, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid loan id' });
    }

    const loan = await db.transaction(async (tx) => {
      const claim = await tx.get('SELECT * FROM battery_loans WHERE id = ? FOR UPDATE', id);
      if (!claim) {
        throw httpError(404, 'Loan record not found');
      }
      if (claim.status === 'returned') {
        throw httpError(400, 'This battery is already marked returned');
      }
      if (claim.status !== 'open') {
        throw httpError(400, 'This loan cannot be returned');
      }

      const battery = await tx.get('SELECT * FROM batteries WHERE id = ? FOR UPDATE', claim.battery_id);
      if (!battery) {
        throw httpError(400, 'Battery model not found for this loan');
      }

      if (claim.direction === 'borrowed' && battery.current_stock < claim.quantity) {
        throw httpError(409, `Cannot return borrowed battery. Available stock ${battery.current_stock} is less than loan quantity ${claim.quantity}. Adjust stock first.`);
      }

      const stockDelta = claim.direction === 'lent' ? claim.quantity : -claim.quantity;
      const movementType = claim.direction === 'lent' ? 'loan_return_in' : 'loan_return_out';
      const movementReason = claim.direction === 'lent'
        ? `Lent battery returned by ${claim.party_name}`
        : `Borrowed battery returned to ${claim.party_name}`;

      await tx.run('UPDATE batteries SET current_stock = current_stock + ? WHERE id = ?', stockDelta, claim.battery_id);
      await tx.run(`
        INSERT INTO stock_movements (
          battery_id, type, quantity, cost_price, reference_id, reason, user_id, user_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        claim.battery_id,
        movementType,
        stockDelta,
        battery.cost_price || 0,
        `LOAN-${claim.id}`,
        movementReason,
        req.user.id,
        req.user.name
      );

      await tx.run(`
        UPDATE battery_loans
        SET status = 'returned',
            returned_at = ${nowSql},
            returned_by = ?,
            returned_by_name = ?,
            updated_at = ${nowSql}
        WHERE id = ?
      `, req.user.id, req.user.name, id);

      return tx.get('SELECT * FROM battery_loans WHERE id = ?', id);
    });

    res.json({ loan });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
