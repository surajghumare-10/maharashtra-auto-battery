const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../auth');
const { renderTemplate, sendNotification, generateWaMeUrl, getSetting } = require('../services/messaging');

function getNextBillNo() {
  const lastBill = db.prepare('SELECT id FROM bills ORDER BY id DESC LIMIT 1').get();
  const nextId = (lastBill ? lastBill.id : 0) + 1;
  return `MAB-${String(nextId).padStart(4, '0')}`;
}

function getTodayDateStr() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getBillItems(billId) {
  return db.prepare('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id ASC').all(billId);
}

function attachItems(bills) {
  if (!bills || bills.length === 0) return bills;
  const ids = bills.map(b => b.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM bill_items WHERE bill_id IN (${placeholders}) ORDER BY id ASC`).all(...ids);
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.bill_id)) map.set(row.bill_id, []);
    map.get(row.bill_id).push(row);
  }
  return bills.map(b => ({ ...b, items: map.get(b.id) || [] }));
}

function itemDescription(items) {
  if (!items || items.length === 0) return 'Battery';
  return items
    .map(i => `${i.brand} ${i.model_name} (${i.capacity_ah || ''}Ah) x${i.quantity}`)
    .join(' + ');
}

function normalizeItems(rawItems, oldBatteryReturned, oldBatteryType, oldBatteryBrand, oldBatteryCondition) {
  const items = [];
  for (const raw of rawItems) {
    const battery = db.prepare('SELECT * FROM batteries WHERE id = ? AND is_active = 1').get(Number(raw.battery_id));
    if (!battery) {
      const err = new Error(`Battery model ID ${raw.battery_id} is invalid or unavailable`);
      err.status = 400;
      throw err;
    }

    const qty = Math.max(1, parseInt(raw.quantity, 10) || 1);
    const price = raw.unit_price !== undefined && raw.unit_price !== '' && !isNaN(parseFloat(raw.unit_price))
      ? Math.max(0, parseFloat(raw.unit_price))
      : battery.selling_price;

    const isOldReturned = !!oldBatteryReturned;
    let itemExchange;
    if (raw.exchange_discount !== undefined && raw.exchange_discount !== '' && !isNaN(parseFloat(raw.exchange_discount))) {
      itemExchange = Math.max(0, parseFloat(raw.exchange_discount));
    } else {
      itemExchange = isOldReturned ? (battery.exchange_discount || 0) : 0;
    }
    if (!isOldReturned) itemExchange = 0;

    const warranty = raw.warranty_months !== undefined && raw.warranty_months !== '' && !isNaN(parseInt(raw.warranty_months, 10))
      ? Math.max(0, parseInt(raw.warranty_months, 10))
      : battery.warranty_months;

    items.push({
      battery,
      battery_id: battery.id,
      brand: battery.brand,
      model_name: battery.model_name,
      type: battery.type,
      capacity_ah: battery.capacity_ah,
      quantity: qty,
      unit_price: price,
      subtotal: qty * price,
      exchange_discount: itemExchange,
      warranty_months: warranty,
      serial_number: raw.serial_number ? String(raw.serial_number).trim().toUpperCase() : null,
      old_battery_returned: isOldReturned ? 1 : 0,
      old_battery_type: isOldReturned ? (raw.old_battery_type || oldBatteryType || battery.type) : null,
      old_battery_brand: isOldReturned ? (raw.old_battery_brand || oldBatteryBrand || 'Old Return') : null,
      old_battery_condition: isOldReturned ? (raw.old_battery_condition || oldBatteryCondition || 'Used') : null
    });
  }
  return items;
}

// GET /bills - List bills with filters and search
router.get('/', authenticateToken, (req, res) => {
  const { search, startDate, endDate, paymentMode, batteryType, staffId, status = 'completed' } = req.query;

  let query = 'SELECT * FROM bills WHERE 1=1';
  const params = [];

  // Worker role restriction: can view/edit ONLY bills created on current day!
  if (req.user.role === 'worker') {
    query += " AND date(created_at) = date('now', 'localtime')";
  }

  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ` AND (bill_no LIKE ? OR customer_name LIKE ? OR customer_mobile LIKE ?
      OR serial_number LIKE ? OR vehicle_number LIKE ? OR village_name LIKE ?
      OR id IN (SELECT bill_id FROM bill_items WHERE serial_number LIKE ?))`;
    params.push(term, term, term, term, term, term, term);
  }

  if (startDate) {
    query += ' AND date(created_at) >= date(?)';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND date(created_at) <= date(?)';
    params.push(endDate);
  }

  if (paymentMode && paymentMode !== 'all') {
    query += ' AND payment_mode = ?';
    params.push(paymentMode);
  }

  if (batteryType && batteryType !== 'all') {
    query += ' AND (battery_type = ? OR id IN (SELECT bill_id FROM bill_items WHERE type = ?))';
    params.push(batteryType, batteryType);
  }

  if (staffId && staffId !== 'all') {
    query += ' AND created_by = ?';
    params.push(Number(staffId));
  }

  query += ' ORDER BY id DESC LIMIT 500';

  const bills = db.prepare(query).all(...params);
  res.json({ bills: attachItems(bills) });
});

// GET /bills/warranty-check - Check battery warranty status by serial no, mobile, or bill no
router.get('/warranty-check', authenticateToken, (req, res) => {
  const { search } = req.query;
  if (!search || !search.trim()) {
    return res.status(400).json({ error: 'Please enter a serial number, customer mobile, or bill number' });
  }

  const term = search.trim();
  const cleanMob = term.replace(/\D/g, '').slice(-10);

  // 1. Match a specific serial number on a bill item (works for multi-item bills)
  const itemMatch = db.prepare(`
    SELECT b.*, bi.serial_number AS item_serial, bi.warranty_months AS item_warranty,
           bi.brand AS item_brand, bi.model_name AS item_model, bi.type AS item_type,
           bi.capacity_ah AS item_capacity, bi.quantity AS item_quantity
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    WHERE b.status != 'cancelled' AND LOWER(bi.serial_number) = LOWER(?)
    ORDER BY b.id DESC LIMIT 1
  `).get(term);

  let bill = itemMatch;
  let warrantyMonths = itemMatch ? itemMatch.item_warranty : null;

  if (!bill) {
    bill = db.prepare(`
      SELECT * FROM bills
      WHERE status != 'cancelled'
        AND (
          LOWER(serial_number) = LOWER(?)
          OR (length(?) = 10 AND customer_mobile = ?)
          OR LOWER(bill_no) = LOWER(?)
        )
      ORDER BY id DESC LIMIT 1
    `).get(term, cleanMob, cleanMob, term);
    if (bill) warrantyMonths = bill.warranty_months;
  }

  if (!bill) {
    return res.json({
      found: false,
      status: 'not_found',
      message: `No bill found matching "${term}". Please verify the serial number or customer mobile.`
    });
  }

  // Calculate warranty expiry date
  const billDate = new Date(bill.created_at);
  const expiryDate = new Date(billDate);
  expiryDate.setMonth(expiryDate.getMonth() + (warrantyMonths || 0));

  const now = new Date();
  const isUnderWarranty = now <= expiryDate;
  const diffMs = expiryDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const monthsRemaining = (daysRemaining / 30.4).toFixed(1);

  const items = getBillItems(bill.id);

  res.json({
    found: true,
    isUnderWarranty,
    status: isUnderWarranty ? 'valid' : 'expired',
    purchaseDate: bill.created_at.split(' ')[0],
    expiryDate: expiryDate.toISOString().split('T')[0],
    warrantyMonths,
    daysRemaining,
    monthsRemaining: Math.max(0, parseFloat(monthsRemaining)),
    daysExpired: isUnderWarranty ? 0 : Math.abs(daysRemaining),
    message: isUnderWarranty
      ? `Warranty is VALID until ${expiryDate.toISOString().split('T')[0]} (${Math.max(0, Math.ceil(daysRemaining))} days remaining).`
      : `WARRANTY EXPIRED on ${expiryDate.toISOString().split('T')[0]} (${Math.abs(daysRemaining)} days ago). This battery is NOT covered for free replacement.`,
    bill: {
      id: bill.id,
      bill_no: bill.bill_no,
      customer_name: bill.customer_name,
      customer_mobile: bill.customer_mobile,
      vehicle_number: bill.vehicle_number,
      village_name: bill.village_name,
      battery_brand: itemMatch ? itemMatch.item_brand : bill.battery_brand,
      battery_model: itemMatch ? itemMatch.item_model : bill.battery_model,
      battery_type: itemMatch ? itemMatch.item_type : bill.battery_type,
      capacity_ah: itemMatch ? itemMatch.item_capacity : bill.battery_capacity,
      quantity: itemMatch ? itemMatch.item_quantity : bill.quantity,
      serial_number: itemMatch ? itemMatch.item_serial : bill.serial_number,
      warranty_months: warrantyMonths,
      grand_total: bill.grand_total,
      created_at: bill.created_at,
      items
    }
  });
});

// GET /bills/:id
router.get('/:id', authenticateToken, (req, res) => {
  const billId = Number(req.params.id);
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);

  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  // Worker check: if worker, only allow if bill is from today
  if (req.user.role === 'worker') {
    const billDate = bill.created_at.split(' ')[0];
    const today = getTodayDateStr();
    if (billDate !== today) {
      return res.status(403).json({ error: 'Workers can only view bills created today.' });
    }
  }

  // Fetch edits audit trail
  const edits = db.prepare(`
    SELECT * FROM bill_edits WHERE bill_id = ? ORDER BY id DESC
  `).all(billId);

  // Fetch customer overall pending balance (source of truth: bills.balance_due)
  const customerSummary = db.prepare(`
    SELECT COALESCE(SUM(balance_due), 0) AS overall_pending
    FROM bills
    WHERE customer_id = ? AND status != 'cancelled'
  `).get(bill.customer_id);

  const items = getBillItems(billId);

  // Construct instant WhatsApp link if needed
  const template = getSetting('msg_template_bill');
  const billMsg = renderTemplate(template, {
    bill_no: bill.bill_no,
    date: bill.created_at.split(' ')[0],
    customer_name: bill.customer_name,
    customer_mobile: bill.customer_mobile,
    battery_desc: itemDescription(items),
    serial_no: items.map(i => i.serial_number).filter(Boolean).join(', ') || 'N/A',
    exchange_discount: bill.exchange_discount,
    amount_paid: bill.amount_paid,
    balance_due: bill.balance_due,
    grand_total: bill.grand_total,
    payment_mode: bill.payment_mode,
    warranty_months: bill.warranty_months,
    vehicle_number: bill.vehicle_number || '',
    village_name: bill.village_name || ''
  });

  const waMeUrl = generateWaMeUrl(bill.customer_mobile, billMsg);

  res.json({
    bill: { ...bill, items },
    edits,
    customerOverallPending: customerSummary ? customerSummary.overall_pending : 0,
    waMeUrl
  });
});

// POST /bills - Create new bill (supports multiple line items / units)
router.post('/', authenticateToken, async (req, res) => {
  const {
    customer_name,
    customer_mobile,
    vehicle_number,
    village_name,
    battery_id,
    quantity = 1,
    unit_price,
    old_battery_returned = false,
    old_battery_type,
    old_battery_brand,
    old_battery_condition,
    exchange_discount = 0,
    manual_discount = 0,
    payment_mode,
    amount_paid,
    warranty_months,
    serial_number,
    notes,
    allow_zero_stock_override = false,
    send_message = true,
    items: bodyItems
  } = req.body;

  // 1. Validation
  if (!customer_name || !customer_name.trim()) {
    return res.status(400).json({ error: 'Customer name is required' });
  }

  const cleanMobile = String(customer_mobile || '').replace(/\D/g, '').slice(-10);
  if (!cleanMobile || cleanMobile.length !== 10) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
  }

  const rawItems = Array.isArray(bodyItems) && bodyItems.length > 0
    ? bodyItems
    : (battery_id
      ? [{
          battery_id,
          quantity,
          unit_price,
          exchange_discount,
          warranty_months,
          serial_number
        }]
      : []);

  if (rawItems.length === 0) {
    return res.status(400).json({ error: 'Please add at least one battery to the bill' });
  }

  let items;
  try {
    items = normalizeItems(rawItems, old_battery_returned, old_battery_type, old_battery_brand, old_battery_condition);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
  const exDiscount = items.reduce((sum, i) => sum + i.exchange_discount, 0);
  const manDiscount = Math.max(0, parseFloat(manual_discount) || 0);
  const grandTotal = Math.max(0, subtotal - exDiscount - manDiscount);

  // Flexible payment: part-payment allowed in ANY mode, remaining becomes credit.
  let paidAmount = 0;
  if (amount_paid !== undefined && amount_paid !== '' && amount_paid !== null) {
    paidAmount = Math.max(0, parseFloat(amount_paid) || 0);
  } else if (payment_mode === 'Credit') {
    paidAmount = 0;
  } else {
    paidAmount = grandTotal;
  }
  paidAmount = Math.min(paidAmount, grandTotal);
  const balanceDue = Math.max(0, grandTotal - paidAmount);

  const validModes = ['Cash', 'UPI', 'Card', 'Credit'];
  const mode = validModes.includes(payment_mode) ? payment_mode : 'Cash';

  // Check stock for every item (aggregate duplicates)
  const needed = new Map();
  for (const it of items) {
    needed.set(it.battery_id, (needed.get(it.battery_id) || 0) + it.quantity);
  }
  for (const [id, qty] of needed.entries()) {
    const b = db.prepare('SELECT * FROM batteries WHERE id = ?').get(id);
    if (!b) continue;
    if (b.current_stock < qty) {
      if (req.user.role === 'worker') {
        return res.status(400).json({
          error: `Insufficient stock! Current stock of ${b.brand} ${b.model_name} is ${b.current_stock}. Ask Owner/Manager to add stock.`
        });
      } else if (!allow_zero_stock_override) {
        return res.status(409).json({
          warning: `Low/Zero stock alert! ${b.brand} ${b.model_name} has only ${b.current_stock} unit(s) but ${qty} needed. Do you want to override and continue?`,
          requiresOverride: true
        });
      }
    }
  }

  // 2. Perform DB operations inside a synchronous transaction
  const billNo = getNextBillNo();
  const vNum = vehicle_number ? vehicle_number.trim().toUpperCase() : null;
  const vName = village_name ? village_name.trim() : null;
  const primary = items[0];

  const createTransaction = db.transaction(() => {
    // Upsert or fetch customer
    let customer = db.prepare('SELECT id FROM customers WHERE mobile = ?').get(cleanMobile);
    let customerId;
    if (customer) {
      customerId = customer.id;
      db.prepare(`
        UPDATE customers
        SET name = ?,
            village = COALESCE(?, village),
            last_vehicle_number = COALESCE(?, last_vehicle_number),
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(customer_name.trim(), vName, vNum, customerId);
    } else {
      const custRes = db.prepare("INSERT INTO customers (name, mobile, village, last_vehicle_number) VALUES (?, ?, ?, ?)")
        .run(customer_name.trim(), cleanMobile, vName, vNum);
      customerId = custRes.lastInsertRowid;
    }

    // Insert bill (primary columns mirror first line item for compatibility)
    const insertBill = db.prepare(`
      INSERT INTO bills (
        bill_no, customer_id, customer_name, customer_mobile, vehicle_number, village_name,
        battery_id, battery_brand, battery_model, battery_type, battery_capacity,
        quantity, unit_price, subtotal, old_battery_returned, old_battery_type,
        old_battery_brand, old_battery_condition, exchange_discount, manual_discount,
        grand_total, payment_mode, amount_paid, balance_due, warranty_months,
        serial_number, notes, created_by, created_by_name, whatsapp_status
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 'pending'
      )
    `);

    const billRes = insertBill.run(
      billNo, customerId, customer_name.trim(), cleanMobile, vNum, vName,
      primary.battery_id, primary.brand, primary.model_name, primary.type, primary.capacity_ah,
      primary.quantity, primary.unit_price, subtotal, old_battery_returned ? 1 : 0, old_battery_type || primary.type,
      old_battery_brand || 'Old Return', old_battery_condition || 'Used', exDiscount, manDiscount,
      grandTotal, mode, paidAmount, balanceDue, primary.warranty_months,
      primary.serial_number, notes ? notes.trim() : null,
      req.user.id, req.user.name
    );

    const newBillId = billRes.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO bill_items (
        bill_id, battery_id, brand, model_name, type, capacity_ah, quantity,
        unit_price, subtotal, exchange_discount, warranty_months, serial_number,
        old_battery_returned, old_battery_type, old_battery_brand, old_battery_condition
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMovement = db.prepare(`
      INSERT INTO stock_movements (battery_id, type, quantity, cost_price, reference_id, reason, user_id, user_name)
      VALUES (?, 'sale', ?, ?, ?, 'Bill Sale', ?, ?)
    `);

    const insertOldBattery = db.prepare(`
      INSERT INTO old_battery_stock (battery_type, brand, condition, source_bill_id, status)
      VALUES (?, ?, ?, ?, 'in_stock')
    `);

    for (const it of items) {
      insertItem.run(
        newBillId, it.battery_id, it.brand, it.model_name, it.type, it.capacity_ah, it.quantity,
        it.unit_price, it.subtotal, it.exchange_discount, it.warranty_months, it.serial_number,
        it.old_battery_returned, it.old_battery_type, it.old_battery_brand, it.old_battery_condition
      );

      // Deduct stock
      db.prepare('UPDATE batteries SET current_stock = current_stock - ? WHERE id = ?').run(it.quantity, it.battery_id);
      insertMovement.run(
        it.battery_id,
        -it.quantity,
        it.battery.cost_price,
        billNo,
        req.user.id,
        req.user.name
      );

      // Track returned old battery stock (one row per physical battery)
      if (it.old_battery_returned) {
        for (let n = 0; n < it.quantity; n++) {
          insertOldBattery.run(
            it.old_battery_type || it.type,
            it.old_battery_brand || 'Old Return',
            it.old_battery_condition || 'Used',
            newBillId
          );
        }
      }
    }

    return newBillId;
  });

  const createdBillId = createTransaction();
  const createdBill = db.prepare('SELECT * FROM bills WHERE id = ?').get(createdBillId);
  const createdItems = getBillItems(createdBillId);

  // 3. Automated Messaging & Notifications
  let customerMsgResult = { success: false, status: 'wa_link_ready' };
  let ownerMsgResult = { success: false };

  const billDate = createdBill.created_at.split(' ')[0];
  const batteryDesc = itemDescription(createdItems);

  const customerMsgTemplate = getSetting('msg_template_bill');
  const customerMsgText = renderTemplate(customerMsgTemplate, {
    bill_no: createdBill.bill_no,
    date: billDate,
    customer_name: createdBill.customer_name,
    customer_mobile: createdBill.customer_mobile,
    battery_desc: batteryDesc,
    serial_no: createdItems.map(i => i.serial_number).filter(Boolean).join(', ') || 'N/A',
    exchange_discount: createdBill.exchange_discount,
    amount_paid: createdBill.amount_paid,
    balance_due: createdBill.balance_due,
    grand_total: createdBill.grand_total,
    payment_mode: createdBill.payment_mode,
    warranty_months: createdBill.warranty_months,
    vehicle_number: createdBill.vehicle_number || '',
    village_name: createdBill.village_name || ''
  });

  const customerWaMeUrl = generateWaMeUrl(createdBill.customer_mobile, customerMsgText);

  if (send_message) {
    try {
      customerMsgResult = await sendNotification(createdBill.customer_mobile, customerMsgText);
      db.prepare('UPDATE bills SET whatsapp_status = ?, whatsapp_error = ? WHERE id = ?')
        .run(customerMsgResult.status, customerMsgResult.error || null, createdBillId);
    } catch (err) {
      console.error('Customer message error:', err);
      db.prepare("UPDATE bills SET whatsapp_status = 'failed', whatsapp_error = ? WHERE id = ?")
        .run(err.message, createdBillId);
      customerMsgResult = { success: false, status: 'failed', error: err.message, waMeUrl: customerWaMeUrl };
    }

    // Send owner notification
    const ownerMobile = getSetting('owner_mobile');
    if (ownerMobile) {
      const ownerMsgTemplate = getSetting('msg_template_owner');
      const ownerMsgText = renderTemplate(ownerMsgTemplate, {
        bill_no: createdBill.bill_no,
        date: billDate,
        created_by_name: req.user.name,
        created_by_role: req.user.role,
        customer_name: createdBill.customer_name,
        customer_mobile: createdBill.customer_mobile,
        battery_desc: batteryDesc,
        grand_total: createdBill.grand_total,
        amount_paid: createdBill.amount_paid,
        payment_mode: createdBill.payment_mode,
        balance_due: createdBill.balance_due
      });
      try {
        ownerMsgResult = await sendNotification(ownerMobile, ownerMsgText);
      } catch (err) {
        console.error('Owner notification error:', err);
      }
    }
  } else {
    customerMsgResult = { success: true, status: 'manual_wa_ready', waMeUrl: customerWaMeUrl };
  }

  const finalBill = db.prepare('SELECT * FROM bills WHERE id = ?').get(createdBillId);

  res.status(201).json({
    bill: { ...finalBill, items: createdItems },
    messaging: {
      customerStatus: customerMsgResult.status,
      customerError: customerMsgResult.error,
      waMeUrl: customerWaMeUrl,
      ownerStatus: ownerMsgResult.status
    }
  });
});

// PUT /bills/:id - Edit bill (Owner/Manager anytime, Worker only if bill is from today)
router.put('/:id', authenticateToken, (req, res) => {
  const billId = Number(req.params.id);
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);

  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  if (bill.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot edit a cancelled bill.' });
  }

  // Worker permission check: can only edit today's bills
  if (req.user.role === 'worker') {
    const billDate = bill.created_at.split(' ')[0];
    const today = getTodayDateStr();
    if (billDate !== today) {
      return res.status(403).json({ error: 'Workers can only edit bills created on the current day.' });
    }
  }

  const {
    customer_name = bill.customer_name,
    customer_mobile = bill.customer_mobile,
    vehicle_number,
    village_name,
    quantity,
    unit_price,
    exchange_discount,
    manual_discount = bill.manual_discount,
    payment_mode = bill.payment_mode,
    amount_paid = bill.amount_paid,
    warranty_months,
    serial_number,
    notes,
    old_battery_returned,
    old_battery_type,
    old_battery_brand,
    old_battery_condition,
    items: bodyItems
  } = req.body;

  const existingItems = getBillItems(billId);

  // Build the updated item list
  let rawItems;
  if (Array.isArray(bodyItems) && bodyItems.length > 0) {
    rawItems = bodyItems;
  } else if (existingItems.length > 0) {
    // Legacy partial edit: apply submitted fields to the first item only
    rawItems = existingItems.map((it, idx) => {
      if (idx !== 0) return it;
      return {
        ...it,
        quantity: quantity !== undefined ? quantity : it.quantity,
        unit_price: unit_price !== undefined ? unit_price : it.unit_price,
        exchange_discount: exchange_discount !== undefined ? exchange_discount : it.exchange_discount,
        warranty_months: warranty_months !== undefined ? warranty_months : it.warranty_months,
        serial_number: serial_number !== undefined ? serial_number : it.serial_number
      };
    });
  } else {
    rawItems = [{
      battery_id: bill.battery_id,
      quantity: quantity !== undefined ? quantity : bill.quantity,
      unit_price: unit_price !== undefined ? unit_price : bill.unit_price,
      exchange_discount: exchange_discount !== undefined ? exchange_discount : bill.exchange_discount,
      warranty_months: warranty_months !== undefined ? warranty_months : bill.warranty_months,
      serial_number: serial_number !== undefined ? serial_number : bill.serial_number
    }];
  }

  const oldReturned = old_battery_returned !== undefined ? !!old_battery_returned : existingItems.some(i => i.old_battery_returned);

  let newItems;
  try {
    newItems = normalizeItems(
      rawItems,
      oldReturned,
      old_battery_type || bill.old_battery_type,
      old_battery_brand || bill.old_battery_brand,
      old_battery_condition || bill.old_battery_condition
    );
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const newSubtotal = newItems.reduce((sum, i) => sum + i.subtotal, 0);
  const newExDiscount = newItems.reduce((sum, i) => sum + i.exchange_discount, 0);
  const newManDiscount = Math.max(0, parseFloat(manual_discount) || 0);
  const newGrandTotal = Math.max(0, newSubtotal - newExDiscount - newManDiscount);

  let newPaid = parseFloat(amount_paid) || 0;
  newPaid = Math.min(Math.max(0, newPaid), newGrandTotal);
  const newDue = Math.max(0, newGrandTotal - newPaid);
  const primary = newItems[0];

  const cleanMobile = String(customer_mobile).replace(/\D/g, '').slice(-10);
  if (!cleanMobile || cleanMobile.length !== 10) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
  }

  const editTransaction = db.transaction(() => {
    // 1. Restore stock for previous items and remove old-battery entries from this bill
    for (const it of existingItems) {
      if (it.battery_id) {
        db.prepare('UPDATE batteries SET current_stock = current_stock + ? WHERE id = ?').run(it.quantity, it.battery_id);
        db.prepare(`
          INSERT INTO stock_movements (battery_id, type, quantity, reference_id, reason, user_id, user_name)
          VALUES (?, 'adjustment', ?, ?, 'Bill Edit - Old Items Restored', ?, ?)
        `).run(it.battery_id, it.quantity, bill.bill_no, req.user.id, req.user.name);
      }
    }
    db.prepare('DELETE FROM old_battery_stock WHERE source_bill_id = ? AND status = ?').run(billId, 'in_stock');
    db.prepare('DELETE FROM bill_items WHERE bill_id = ?').run(billId);

    // 2. Insert updated items and deduct stock again
    const insertItem = db.prepare(`
      INSERT INTO bill_items (
        bill_id, battery_id, brand, model_name, type, capacity_ah, quantity,
        unit_price, subtotal, exchange_discount, warranty_months, serial_number,
        old_battery_returned, old_battery_type, old_battery_brand, old_battery_condition
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMovement = db.prepare(`
      INSERT INTO stock_movements (battery_id, type, quantity, cost_price, reference_id, reason, user_id, user_name)
      VALUES (?, 'sale', ?, ?, ?, 'Bill Edit - New Items', ?, ?)
    `);
    const insertOldBattery = db.prepare(`
      INSERT INTO old_battery_stock (battery_type, brand, condition, source_bill_id, status)
      VALUES (?, ?, ?, ?, 'in_stock')
    `);

    for (const it of newItems) {
      insertItem.run(
        billId, it.battery_id, it.brand, it.model_name, it.type, it.capacity_ah, it.quantity,
        it.unit_price, it.subtotal, it.exchange_discount, it.warranty_months, it.serial_number,
        it.old_battery_returned, it.old_battery_type, it.old_battery_brand, it.old_battery_condition
      );
      db.prepare('UPDATE batteries SET current_stock = current_stock - ? WHERE id = ?').run(it.quantity, it.battery_id);
      insertMovement.run(it.battery_id, -it.quantity, it.battery.cost_price, bill.bill_no, req.user.id, req.user.name);

      if (it.old_battery_returned) {
        for (let n = 0; n < it.quantity; n++) {
          insertOldBattery.run(
            it.old_battery_type || it.type,
            it.old_battery_brand || 'Old Return',
            it.old_battery_condition || 'Used',
            billId
          );
        }
      }
    }

    // 3. Update customer (keep mobile-based recognition in sync)
    let customer = db.prepare('SELECT id FROM customers WHERE mobile = ?').get(cleanMobile);
    let customerId;
    const vNum = vehicle_number !== undefined ? (vehicle_number ? vehicle_number.trim().toUpperCase() : null) : bill.vehicle_number;
    const vName = village_name !== undefined ? (village_name ? village_name.trim() : null) : bill.village_name;

    if (customer) {
      customerId = customer.id;
      db.prepare("UPDATE customers SET name = ?, village = COALESCE(?, village), last_vehicle_number = COALESCE(?, last_vehicle_number), updated_at = datetime('now', 'localtime') WHERE id = ?")
        .run(customer_name.trim(), vName, vNum, customerId);
    } else {
      const res = db.prepare("INSERT INTO customers (name, mobile, village, last_vehicle_number) VALUES (?, ?, ?, ?)")
        .run(customer_name.trim(), cleanMobile, vName, vNum);
      customerId = res.lastInsertRowid;
    }

    // 4. Build changes summary for audit trail
    const changes = [];
    if (customer_name !== bill.customer_name) changes.push(`Name: ${bill.customer_name} -> ${customer_name}`);
    if (cleanMobile !== bill.customer_mobile) changes.push(`Mobile: ${bill.customer_mobile} -> ${cleanMobile}`);
    if (vNum !== bill.vehicle_number) changes.push(`Vehicle: ${bill.vehicle_number || '-'} -> ${vNum || '-'}`);
    if (vName !== bill.village_name) changes.push(`Village: ${bill.village_name || '-'} -> ${vName || '-'}`);
    if (existingItems.length !== newItems.length) changes.push(`Items: ${existingItems.length} -> ${newItems.length}`);
    if (newSubtotal !== bill.subtotal) changes.push(`Subtotal: ₹${bill.subtotal} -> ₹${newSubtotal}`);
    if (newGrandTotal !== bill.grand_total) changes.push(`Total: ₹${bill.grand_total} -> ₹${newGrandTotal}`);
    if (newPaid !== bill.amount_paid) changes.push(`Paid: ₹${bill.amount_paid} -> ₹${newPaid}`);
    if (payment_mode !== bill.payment_mode) changes.push(`Mode: ${bill.payment_mode} -> ${payment_mode}`);
    const summary = changes.length > 0 ? changes.join('; ') : 'Details updated';

    db.prepare(`
      INSERT INTO bill_edits (bill_id, edited_by, edited_by_name, changes_summary, previous_data, new_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      billId,
      req.user.id,
      req.user.name,
      summary,
      JSON.stringify({ ...bill, items: existingItems }),
      JSON.stringify({ ...req.body, items: newItems.map(i => ({
        battery_id: i.battery_id, quantity: i.quantity, unit_price: i.unit_price,
        warranty_months: i.warranty_months, serial_number: i.serial_number
      })) })
    );

    // 5. Update bill
    db.prepare(`
      UPDATE bills
      SET customer_id = ?, customer_name = ?, customer_mobile = ?, vehicle_number = ?, village_name = ?,
          battery_id = ?, battery_brand = ?, battery_model = ?, battery_type = ?, battery_capacity = ?,
          quantity = ?, unit_price = ?, subtotal = ?, old_battery_returned = ?,
          exchange_discount = ?, manual_discount = ?, grand_total = ?, payment_mode = ?,
          amount_paid = ?, balance_due = ?, warranty_months = ?, serial_number = ?, notes = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      customerId,
      customer_name.trim(),
      cleanMobile,
      vNum,
      vName,
      primary.battery_id,
      primary.brand,
      primary.model_name,
      primary.type,
      primary.capacity_ah,
      primary.quantity,
      primary.unit_price,
      newSubtotal,
      oldReturned ? 1 : 0,
      newExDiscount,
      newManDiscount,
      newGrandTotal,
      payment_mode,
      newPaid,
      newDue,
      primary.warranty_months,
      primary.serial_number,
      notes !== undefined ? (notes ? notes.trim() : null) : bill.notes,
      billId
    );
  });

  editTransaction();

  const updatedBill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
  res.json({ bill: { ...updatedBill, items: getBillItems(billId) } });
});

// DELETE /bills/:id - Cancel/Delete bill (Owner only)
router.delete('/:id', authenticateToken, requireRole(['owner']), (req, res) => {
  const billId = Number(req.params.id);
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);

  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  if (bill.status === 'cancelled') {
    return res.status(400).json({ error: 'Bill is already cancelled' });
  }

  const items = getBillItems(billId);

  const cancelTransaction = db.transaction(() => {
    // 1. Mark bill as cancelled
    db.prepare("UPDATE bills SET status = 'cancelled', updated_at = datetime('now', 'localtime') WHERE id = ?").run(billId);

    // 2. Return sold stock back to inventory for every item
    for (const it of items) {
      if (it.battery_id) {
        db.prepare('UPDATE batteries SET current_stock = current_stock + ? WHERE id = ?').run(it.quantity, it.battery_id);
        db.prepare(`
          INSERT INTO stock_movements (battery_id, type, quantity, reference_id, reason, user_id, user_name)
          VALUES (?, 'cancel_reversal', ?, ?, 'Bill Cancellation Reversal', ?, ?)
        `).run(it.battery_id, it.quantity, bill.bill_no, req.user.id, req.user.name);
      }
    }

    // 3. Remove returned old battery stock from this bill
    db.prepare("DELETE FROM old_battery_stock WHERE source_bill_id = ? AND status = 'in_stock'").run(billId);

    // 4. Audit trail
    db.prepare(`
      INSERT INTO bill_edits (bill_id, edited_by, edited_by_name, changes_summary, previous_data, new_data)
      VALUES (?, ?, ?, 'Bill Cancelled and stock reversed', ?, '{"status":"cancelled"}')
    `).run(billId, req.user.id, req.user.name, JSON.stringify({ ...bill, items }));
  });

  cancelTransaction();

  res.json({ message: `Bill ${bill.bill_no} cancelled successfully and stock restored.` });
});

// POST /bills/:id/resend-message - Resend WhatsApp / SMS message
router.post('/:id/resend-message', authenticateToken, async (req, res) => {
  const billId = Number(req.params.id);
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);

  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  const items = getBillItems(billId);
  const billDate = bill.created_at.split(' ')[0];
  const template = getSetting('msg_template_bill');
  const messageText = renderTemplate(template, {
    bill_no: bill.bill_no,
    date: billDate,
    customer_name: bill.customer_name,
    customer_mobile: bill.customer_mobile,
    battery_desc: itemDescription(items),
    serial_no: items.map(i => i.serial_number).filter(Boolean).join(', ') || 'N/A',
    exchange_discount: bill.exchange_discount,
    amount_paid: bill.amount_paid,
    balance_due: bill.balance_due,
    grand_total: bill.grand_total,
    payment_mode: bill.payment_mode,
    warranty_months: bill.warranty_months,
    vehicle_number: bill.vehicle_number || '',
    village_name: bill.village_name || ''
  });

  const waMeUrl = generateWaMeUrl(bill.customer_mobile, messageText);

  try {
    const sendRes = await sendNotification(bill.customer_mobile, messageText);
    db.prepare('UPDATE bills SET whatsapp_status = ?, whatsapp_error = ? WHERE id = ?')
      .run(sendRes.status, sendRes.error || null, billId);

    return res.json({
      status: sendRes.status,
      provider: sendRes.provider,
      waMeUrl,
      error: sendRes.error
    });
  } catch (err) {
    db.prepare("UPDATE bills SET whatsapp_status = 'failed', whatsapp_error = ? WHERE id = ?")
      .run(err.message, billId);

    return res.json({
      status: 'failed',
      error: err.message,
      waMeUrl
    });
  }
});

module.exports = router;
