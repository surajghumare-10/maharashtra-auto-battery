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

// GET /bills - List bills with filters and search
router.get('/', authenticateToken, (req, res) => {
  const { search, startDate, endDate, paymentMode, batteryType, staffId, status = 'completed' } = req.query;

  let query = 'SELECT * FROM bills WHERE 1=1';
  const params = [];

  // Worker role restriction: can view/edit ONLY bills created on current day!
  if (req.user.role === 'worker') {
    const today = getTodayDateStr();
    query += " AND date(created_at) = date('now', 'localtime')";
  }

  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ' AND (bill_no LIKE ? OR customer_name LIKE ? OR customer_mobile LIKE ? OR serial_number LIKE ?)';
    params.push(term, term, term, term);
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
    query += ' AND battery_type = ?';
    params.push(batteryType);
  }

  if (staffId && staffId !== 'all') {
    query += ' AND created_by = ?';
    params.push(Number(staffId));
  }

  query += ' ORDER BY id DESC';

  const bills = db.prepare(query).all(...params);
  res.json({ bills });
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

  // Fetch customer overall pending balance
  const customerSummary = db.prepare(`
    SELECT 
      COALESCE(SUM(b.grand_total), 0) - (COALESCE(SUM(b.amount_paid), 0) + COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = ?), 0)) AS overall_pending
    FROM bills b
    WHERE b.customer_id = ? AND b.status != 'cancelled'
  `).get(bill.customer_id, bill.customer_id);

  // Construct instant WhatsApp link if needed
  const template = getSetting('msg_template_bill');
  const billMsg = renderTemplate(template, {
    bill_no: bill.bill_no,
    date: bill.created_at.split(' ')[0],
    customer_name: bill.customer_name,
    customer_mobile: bill.customer_mobile,
    battery_desc: `${bill.battery_brand} ${bill.battery_model} (${bill.battery_capacity}Ah) x${bill.quantity}`,
    serial_no: bill.serial_number || 'N/A',
    exchange_discount: bill.exchange_discount,
    amount_paid: bill.amount_paid,
    balance_due: bill.balance_due,
    grand_total: bill.grand_total,
    payment_mode: bill.payment_mode,
    warranty_months: bill.warranty_months
  });

  const waMeUrl = generateWaMeUrl(bill.customer_mobile, billMsg);

  res.json({
    bill,
    edits,
    customerOverallPending: customerSummary ? customerSummary.overall_pending : 0,
    waMeUrl
  });
});

// POST /bills - Create new bill
router.post('/', authenticateToken, async (req, res) => {
  const {
    customer_name,
    customer_mobile,
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
    send_message = true
  } = req.body;

  // 1. Validation
  if (!customer_name || !customer_name.trim()) {
    return res.status(400).json({ error: 'Customer name is required' });
  }

  const cleanMobile = String(customer_mobile).replace(/\D/g, '').slice(-10);
  if (!cleanMobile || cleanMobile.length !== 10) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
  }

  if (!battery_id) {
    return res.status(400).json({ error: 'Please select a battery model' });
  }

  const battery = db.prepare('SELECT * FROM batteries WHERE id = ? AND is_active = 1').get(Number(battery_id));
  if (!battery) {
    return res.status(400).json({ error: 'Selected battery model is invalid or unavailable' });
  }

  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const price = parseFloat(unit_price) >= 0 ? parseFloat(unit_price) : battery.selling_price;
  const subtotal = qty * price;
  const exDiscount = old_battery_returned ? (parseFloat(exchange_discount) || 0) : 0;
  const manDiscount = parseFloat(manual_discount) || 0;
  const grandTotal = Math.max(0, subtotal - exDiscount - manDiscount);

  let paidAmount = 0;
  if (payment_mode === 'Credit') {
    paidAmount = Math.max(0, parseFloat(amount_paid) || 0);
  } else {
    // For Cash, UPI, Card: default paid is grand_total unless specified
    paidAmount = amount_paid !== undefined ? parseFloat(amount_paid) : grandTotal;
  }
  const balanceDue = Math.max(0, grandTotal - paidAmount);

  // Check stock
  if (battery.current_stock < qty) {
    if (req.user.role === 'worker') {
      return res.status(400).json({
        error: `Insufficient stock! Current stock of ${battery.brand} ${battery.model_name} is ${battery.current_stock}. Ask Owner/Manager to add stock.`
      });
    } else if (!allow_zero_stock_override) {
      return res.status(409).json({
        warning: `Low/Zero stock alert! Current stock is ${battery.current_stock}. Do you want to override and continue?`,
        requiresOverride: true
      });
    }
  }

  // 2. Perform DB operations inside a synchronous transaction
  const billNo = getNextBillNo();
  const warrantyVal = warranty_months !== undefined ? Number(warranty_months) : battery.warranty_months;

  const createTransaction = db.transaction(() => {
    // Upsert or fetch customer
    let customer = db.prepare('SELECT id FROM customers WHERE mobile = ?').get(cleanMobile);
    let customerId;
    if (customer) {
      customerId = customer.id;
      db.prepare("UPDATE customers SET name = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
        .run(customer_name.trim(), customerId);
    } else {
      const custRes = db.prepare("INSERT INTO customers (name, mobile) VALUES (?, ?)")
        .run(customer_name.trim(), cleanMobile);
      customerId = custRes.lastInsertRowid;
    }

    // Insert bill
    const insertBill = db.prepare(`
      INSERT INTO bills (
        bill_no, customer_id, customer_name, customer_mobile,
        battery_id, battery_brand, battery_model, battery_type, battery_capacity,
        quantity, unit_price, subtotal, old_battery_returned, old_battery_type,
        old_battery_brand, old_battery_condition, exchange_discount, manual_discount,
        grand_total, payment_mode, amount_paid, balance_due, warranty_months,
        serial_number, notes, created_by, created_by_name, whatsapp_status
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 'pending'
      )
    `);

    const billRes = insertBill.run(
      billNo, customerId, customer_name.trim(), cleanMobile,
      battery.id, battery.brand, battery.model_name, battery.type, battery.capacity_ah,
      qty, price, subtotal, old_battery_returned ? 1 : 0, old_battery_type || battery.type,
      old_battery_brand || 'Old Return', old_battery_condition || 'Used', exDiscount, manDiscount,
      grandTotal, payment_mode, paidAmount, balanceDue, warrantyVal,
      serial_number ? serial_number.trim() : null, notes ? notes.trim() : null,
      req.user.id, req.user.name
    );

    const newBillId = billRes.lastInsertRowid;

    // Deduct stock
    db.prepare('UPDATE batteries SET current_stock = current_stock - ? WHERE id = ?').run(qty, battery.id);

    // Log stock movement
    db.prepare(`
      INSERT INTO stock_movements (battery_id, type, quantity, cost_price, reference_id, reason, user_id, user_name)
      VALUES (?, 'sale', ?, ?, ?, 'Bill Sale', ?, ?)
    `).run(
      battery.id,
      -qty,
      battery.cost_price,
      billNo,
      req.user.id,
      req.user.name
    );

    // Track returned old battery stock
    if (old_battery_returned) {
      db.prepare(`
        INSERT INTO old_battery_stock (battery_type, brand, condition, source_bill_id, status)
        VALUES (?, ?, ?, ?, 'in_stock')
      `).run(
        old_battery_type || battery.type,
        old_battery_brand || 'Old Return',
        old_battery_condition || 'Used',
        newBillId
      );
    }

    return newBillId;
  });

  const createdBillId = createTransaction();
  const createdBill = db.prepare('SELECT * FROM bills WHERE id = ?').get(createdBillId);

  // 3. Automated Messaging & Notifications
  let customerMsgResult = { success: false, status: 'wa_link_ready' };
  let ownerMsgResult = { success: false };

  const billDate = createdBill.created_at.split(' ')[0];
  const batteryDesc = `${createdBill.battery_brand} ${createdBill.battery_model} (${createdBill.battery_capacity}Ah) x${createdBill.quantity}`;

  const customerMsgTemplate = getSetting('msg_template_bill');
  const customerMsgText = renderTemplate(customerMsgTemplate, {
    bill_no: createdBill.bill_no,
    date: billDate,
    customer_name: createdBill.customer_name,
    customer_mobile: createdBill.customer_mobile,
    battery_desc: batteryDesc,
    serial_no: createdBill.serial_number || 'N/A',
    exchange_discount: createdBill.exchange_discount,
    amount_paid: createdBill.amount_paid,
    balance_due: createdBill.balance_due,
    grand_total: createdBill.grand_total,
    payment_mode: createdBill.payment_mode,
    warranty_months: createdBill.warranty_months
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
    bill: finalBill,
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
    quantity = bill.quantity,
    unit_price = bill.unit_price,
    exchange_discount = bill.exchange_discount,
    manual_discount = bill.manual_discount,
    payment_mode = bill.payment_mode,
    amount_paid = bill.amount_paid,
    warranty_months = bill.warranty_months,
    serial_number = bill.serial_number,
    notes = bill.notes
  } = req.body;

  const newQty = parseInt(quantity, 10);
  const newPrice = parseFloat(unit_price);
  const newSubtotal = newQty * newPrice;
  const newExDiscount = parseFloat(exchange_discount) || 0;
  const newManDiscount = parseFloat(manual_discount) || 0;
  const newGrandTotal = Math.max(0, newSubtotal - newExDiscount - newManDiscount);
  const newPaid = parseFloat(amount_paid) || 0;
  const newDue = Math.max(0, newGrandTotal - newPaid);

  const editTransaction = db.transaction(() => {
    // If quantity changed, adjust stock
    const qtyDiff = newQty - bill.quantity;
    if (qtyDiff !== 0 && bill.battery_id) {
      db.prepare('UPDATE batteries SET current_stock = current_stock - ? WHERE id = ?').run(qtyDiff, bill.battery_id);
      db.prepare(`
        INSERT INTO stock_movements (battery_id, type, quantity, reference_id, reason, user_id, user_name)
        VALUES (?, 'adjustment', ?, ?, 'Bill Edit Qty Adjustment', ?, ?)
      `).run(bill.battery_id, -qtyDiff, bill.bill_no, req.user.id, req.user.name);
    }

    // Build changes summary for audit trail
    const changes = [];
    if (customer_name !== bill.customer_name) changes.push(`Name: ${bill.customer_name} -> ${customer_name}`);
    if (customer_mobile !== bill.customer_mobile) changes.push(`Mobile: ${bill.customer_mobile} -> ${customer_mobile}`);
    if (newQty !== bill.quantity) changes.push(`Qty: ${bill.quantity} -> ${newQty}`);
    if (newPrice !== bill.unit_price) changes.push(`Price: ₹${bill.unit_price} -> ₹${newPrice}`);
    if (newGrandTotal !== bill.grand_total) changes.push(`Total: ₹${bill.grand_total} -> ₹${newGrandTotal}`);
    if (newPaid !== bill.amount_paid) changes.push(`Paid: ₹${bill.amount_paid} -> ₹${newPaid}`);
    if (payment_mode !== bill.payment_mode) changes.push(`Mode: ${bill.payment_mode} -> ${payment_mode}`);
    if (serial_number !== bill.serial_number) changes.push(`Serial: ${bill.serial_number} -> ${serial_number}`);

    const summary = changes.length > 0 ? changes.join('; ') : 'Details updated';

    // Log edit history
    db.prepare(`
      INSERT INTO bill_edits (bill_id, edited_by, edited_by_name, changes_summary, previous_data, new_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      billId,
      req.user.id,
      req.user.name,
      summary,
      JSON.stringify(bill),
      JSON.stringify(req.body)
    );

    // Update bill
    db.prepare(`
      UPDATE bills
      SET customer_name = ?, customer_mobile = ?, quantity = ?, unit_price = ?,
          subtotal = ?, exchange_discount = ?, manual_discount = ?, grand_total = ?,
          payment_mode = ?, amount_paid = ?, balance_due = ?, warranty_months = ?,
          serial_number = ?, notes = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      customer_name.trim(),
      customer_mobile.trim(),
      newQty,
      newPrice,
      newSubtotal,
      newExDiscount,
      newManDiscount,
      newGrandTotal,
      payment_mode,
      newPaid,
      newDue,
      Number(warranty_months),
      serial_number ? serial_number.trim() : null,
      notes ? notes.trim() : null,
      billId
    );
  });

  editTransaction();

  const updatedBill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
  res.json({ bill: updatedBill });
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

  const cancelTransaction = db.transaction(() => {
    // 1. Mark bill as cancelled
    db.prepare("UPDATE bills SET status = 'cancelled', updated_at = datetime('now', 'localtime') WHERE id = ?").run(billId);

    // 2. Return sold stock back to inventory
    if (bill.battery_id) {
      db.prepare('UPDATE batteries SET current_stock = current_stock + ? WHERE id = ?').run(bill.quantity, bill.battery_id);
      db.prepare(`
        INSERT INTO stock_movements (battery_id, type, quantity, reference_id, reason, user_id, user_name)
        VALUES (?, 'cancel_reversal', ?, ?, 'Bill Cancellation Reversal', ?, ?)
      `).run(bill.battery_id, bill.quantity, bill.bill_no, req.user.id, req.user.name);
    }

    // 3. Remove returned old battery stock if any
    db.prepare("DELETE FROM old_battery_stock WHERE source_bill_id = ? AND status = 'in_stock'").run(billId);

    // 4. Audit trail
    db.prepare(`
      INSERT INTO bill_edits (bill_id, edited_by, edited_by_name, changes_summary, previous_data, new_data)
      VALUES (?, ?, ?, 'Bill Cancelled and stock reversed', ?, '{"status":"cancelled"}')
    `).run(billId, req.user.id, req.user.name, JSON.stringify(bill));
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

  const billDate = bill.created_at.split(' ')[0];
  const batteryDesc = `${bill.battery_brand} ${bill.battery_model} (${bill.battery_capacity}Ah) x${bill.quantity}`;
  const template = getSetting('msg_template_bill');
  const messageText = renderTemplate(template, {
    bill_no: bill.bill_no,
    date: billDate,
    customer_name: bill.customer_name,
    customer_mobile: bill.customer_mobile,
    battery_desc: batteryDesc,
    serial_no: bill.serial_number || 'N/A',
    exchange_discount: bill.exchange_discount,
    amount_paid: bill.amount_paid,
    balance_due: bill.balance_due,
    grand_total: bill.grand_total,
    payment_mode: bill.payment_mode,
    warranty_months: bill.warranty_months
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
