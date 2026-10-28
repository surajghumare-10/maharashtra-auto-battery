const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole, requireDuesAccess, requireInventoryAccess } = require('../auth');
const { renderTemplate, sendNotification, generateWaMeUrl, getSetting } = require('../services/messaging');

// GET /reports/dashboard - Overview metrics for Owner / Manager
router.get('/dashboard', authenticateToken, requireRole(['owner', 'manager']), (req, res) => {
  // 1. Today's stats
  const todayStats = db.prepare(`
    SELECT 
      COUNT(*) AS bill_count,
      COALESCE(SUM(grand_total), 0) AS total_sales,
      COALESCE(SUM(amount_paid), 0) AS total_collected,
      COALESCE(SUM(balance_due), 0) AS total_credit_given
    FROM bills
    WHERE date(created_at) = date('now', 'localtime') AND status != 'cancelled'
  `).get();

  // Today's collections from previous dues payments
  const todayPayments = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS dues_collected
    FROM payments
    WHERE date(created_at) = date('now', 'localtime')
  `).get();

  // Payment mode split for today's bills
  const modeSplits = db.prepare(`
    SELECT payment_mode, COUNT(*) as count, COALESCE(SUM(amount_paid), 0) as amount
    FROM bills
    WHERE date(created_at) = date('now', 'localtime') AND status != 'cancelled'
    GROUP BY payment_mode
  `).all();

  // 2. All-time pending dues across all customers
  const overallDues = db.prepare(`
    SELECT COALESCE(SUM(balance_due), 0) AS total_pending_dues
    FROM bills
    WHERE status != 'cancelled'
  `).get();

  // Total sales all time
  const allTimeSales = db.prepare(`
    SELECT COALESCE(SUM(grand_total), 0) AS total_sales_all_time, COUNT(*) as total_bills
    FROM bills
    WHERE status != 'cancelled'
  `).get();

  // 3. Weekly sales (last 7 days)
  const last7Days = db.prepare(`
    SELECT 
      date(created_at) as sale_date,
      COUNT(*) as bills_count,
      COALESCE(SUM(grand_total), 0) as daily_total
    FROM bills
    WHERE date(created_at) >= date('now', 'localtime', '-6 days') AND status != 'cancelled'
    GROUP BY date(created_at)
    ORDER BY date(created_at) ASC
  `).all();

  // 4. Monthly sales summary (last 6 months)
  const monthlySales = db.prepare(`
    SELECT 
      strftime('%Y-%m', created_at) as month,
      COUNT(*) as bills_count,
      COALESCE(SUM(grand_total), 0) as monthly_total
    FROM bills
    WHERE date(created_at) >= date('now', 'localtime', '-180 days') AND status != 'cancelled'
    GROUP BY strftime('%Y-%m', created_at)
    ORDER BY month ASC
  `).all();

  // 5. Low stock alerts count
  const lowStockCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM batteries
    WHERE is_active = 1 AND current_stock <= low_stock_alert
  `).get().count;

  // 6. Recent 5 bills
  const recentBills = db.prepare(`
    SELECT id, bill_no, customer_name, customer_mobile, vehicle_number, village_name, battery_brand, battery_model, grand_total, payment_mode, created_at, created_by_name
    FROM bills
    WHERE status != 'cancelled'
    ORDER BY id DESC LIMIT 5
  `).all();

  const dashItemsStmt = db.prepare('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id ASC');
  const recentBillsWithItems = recentBills.map(b => ({ ...b, items: dashItemsStmt.all(b.id) }));

  res.json({
    today: {
      billCount: todayStats.bill_count,
      totalSales: todayStats.total_sales,
      totalCollected: todayStats.total_collected + todayPayments.dues_collected,
      duesCollected: todayPayments.dues_collected,
      totalCreditGiven: todayStats.total_credit_given,
      modeSplits
    },
    overall: {
      totalPendingDues: Math.max(0, overallDues.total_pending_dues || 0),
      totalSalesAllTime: allTimeSales.total_sales_all_time,
      totalBillsAllTime: allTimeSales.total_bills,
      lowStockCount
    },
    last7Days,
    monthlySales,
    recentBills: recentBillsWithItems
  });
});

// GET /reports/dues - Customer Dues Page (Owner only, Manager if permitted)
router.get('/dues', authenticateToken, requireDuesAccess, (req, res) => {
  const { search, pendingOnly = 'false', sortBy = 'highestPending' } = req.query;

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
    WHERE 1=1
  `;
  const params = [];

  if (search && search.trim()) {
    query += ' AND (c.name LIKE ? OR c.mobile LIKE ? OR c.village LIKE ? OR c.last_vehicle_number LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  query += ' GROUP BY c.id';

  if (pendingOnly === 'true' || pendingOnly === true) {
    query += ' HAVING pending_balance > 0';
  }

  if (sortBy === 'highestPending') {
    query += ' ORDER BY pending_balance DESC, c.name ASC';
  } else if (sortBy === 'oldestDue') {
    query += ' ORDER BY last_purchase_date ASC, pending_balance DESC';
  } else {
    query += ' ORDER BY c.name ASC';
  }

  const customers = db.prepare(query).all(...params);

  // Summary strip calculation across all customers
  const overallSummary = db.prepare(`
    SELECT 
      COALESCE(SUM(b.grand_total), 0) AS total_sales_all_time,
      COALESCE(SUM(b.amount_paid), 0) AS total_paid_all_time,
      COALESCE(SUM(b.balance_due), 0) AS total_pending_all_time
    FROM bills b
    WHERE b.status != 'cancelled'
  `).get();

  const totalSalesToDate = overallSummary.total_sales_all_time;
  const totalPendingAcrossAll = Math.max(0, overallSummary.total_pending_all_time);

  // Count customers with dues > 0
  const customersWithDues = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT c.id
      FROM customers c
      LEFT JOIN bills b ON b.customer_id = c.id AND b.status != 'cancelled'
      GROUP BY c.id
      HAVING COALESCE(SUM(b.balance_due), 0) > 0
    )
  `).get().count;

  res.json({
    summary: {
      totalPendingAcrossAll,
      customersWithDuesCount: customersWithDues,
      totalSalesToDate
    },
    customers
  });
});

// POST /reports/dues/:customerId/send-reminder - Send payment due reminder
router.post('/dues/:customerId/send-reminder', authenticateToken, requireDuesAccess, async (req, res) => {
  const customerId = Number(req.params.customerId);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  // Calculate balance
  const balanceRow = db.prepare(`
    SELECT COALESCE(SUM(b.balance_due), 0) AS balance_due
    FROM bills b
    WHERE b.customer_id = ? AND b.status != 'cancelled'
  `).get(customerId);

  const balanceDue = Math.max(0, balanceRow ? balanceRow.balance_due : 0);
  if (balanceDue <= 0) {
    return res.status(400).json({ error: 'This customer has zero pending balance. No reminder needed.' });
  }

  const template = getSetting('msg_template_reminder');
  const upiId = getSetting('upi_id');
  const shopPhone = getSetting('phone');

  const reminderText = renderTemplate(template, {
    customer_name: customer.name,
    balance_due: balanceDue.toLocaleString('en-IN'),
    upi_id: upiId,
    shop_phone: shopPhone
  });

  const waMeUrl = generateWaMeUrl(customer.mobile, reminderText);

  try {
    const notifyRes = await sendNotification(customer.mobile, reminderText);
    res.json({
      status: notifyRes.status,
      provider: notifyRes.provider,
      waMeUrl,
      error: notifyRes.error,
      message: 'Reminder sent successfully'
    });
  } catch (err) {
    res.json({
      status: 'failed',
      error: err.message,
      waMeUrl,
      message: 'Automated delivery failed. Direct WhatsApp link is ready.'
    });
  }
});

// GET /reports/inventory - Complete Inventory Report (Owner only, Manager if permitted)
router.get('/inventory', authenticateToken, requireInventoryAccess, (req, res) => {
  const { startDate, endDate, type, search } = req.query;

  // Fetch active battery models
  let baseQuery = 'SELECT * FROM batteries WHERE is_active = 1';
  const baseParams = [];

  if (type && type !== 'all') {
    baseQuery += ' AND type = ?';
    baseParams.push(type);
  }

  if (search && search.trim()) {
    baseQuery += ' AND (brand LIKE ? OR model_name LIKE ?)';
    const term = `%${search.trim()}%`;
    baseParams.push(term, term);
  }

  baseQuery += ' ORDER BY type ASC, brand ASC, model_name ASC';
  const batteries = db.prepare(baseQuery).all(...baseParams);

  // Compute opening, stock in, sold for each model within date range if provided
  const reportRows = batteries.map(b => {
    let soldQty = 0;
    let stockInQty = 0;

    if (startDate || endDate) {
      // Stock sold in range (from bill items so multi-item bills count correctly)
      let soldQ = `
        SELECT COALESCE(SUM(bi.quantity), 0) as q
        FROM bill_items bi
        JOIN bills b ON b.id = bi.bill_id
        WHERE bi.battery_id = ? AND b.status != 'cancelled'`;
      const soldParams = [b.id];
      if (startDate) { soldQ += ' AND date(b.created_at) >= date(?)'; soldParams.push(startDate); }
      if (endDate) { soldQ += ' AND date(b.created_at) <= date(?)'; soldParams.push(endDate); }
      soldQty = db.prepare(soldQ).get(...soldParams).q;

      // Stock In in range
      let inQ = 'SELECT COALESCE(SUM(quantity), 0) as q FROM stock_movements WHERE battery_id = ? AND type = "in"';
      const inParams = [b.id];
      if (startDate) { inQ += ' AND date(created_at) >= date(?)'; inParams.push(startDate); }
      if (endDate) { inQ += ' AND date(created_at) <= date(?)'; inParams.push(endDate); }
      stockInQty = db.prepare(inQ).get(...inParams).q;
    } else {
      // All-time sold and in
      soldQty = db.prepare(`
        SELECT COALESCE(SUM(bi.quantity), 0) as q
        FROM bill_items bi
        JOIN bills b ON b.id = bi.bill_id
        WHERE bi.battery_id = ? AND b.status != 'cancelled'
      `).get(b.id).q;
      stockInQty = db.prepare("SELECT COALESCE(SUM(quantity), 0) as q FROM stock_movements WHERE battery_id = ? AND type = 'in'").get(b.id).q;
    }

    const currentStock = b.current_stock;
    const openingStock = Math.max(0, currentStock + soldQty - stockInQty);
    const stockValueAtCost = currentStock * (b.cost_price || 0);
    const stockValueAtSelling = currentStock * (b.selling_price || 0);

    const isLowStock = currentStock > 0 && currentStock <= b.low_stock_alert;
    const isOutOfStock = currentStock <= 0;

    return {
      id: b.id,
      brand: b.brand,
      model_name: b.model_name,
      type: b.type,
      capacity_ah: b.capacity_ah,
      warranty_months: b.warranty_months,
      opening_stock: openingStock,
      stock_in: stockInQty,
      sold: soldQty,
      current_stock: currentStock,
      cost_price: b.cost_price,
      selling_price: b.selling_price,
      exchange_discount: b.exchange_discount,
      stock_value_cost: stockValueAtCost,
      stock_value_selling: stockValueAtSelling,
      low_stock_alert: b.low_stock_alert,
      is_low_stock: isLowStock,
      is_out_of_stock: isOutOfStock
    };
  });

  // Summary strip
  const totalBatteriesInStock = reportRows.reduce((acc, r) => acc + r.current_stock, 0);
  const totalStockValueCost = reportRows.reduce((acc, r) => acc + r.stock_value_cost, 0);
  const totalPotentialSalesValue = reportRows.reduce((acc, r) => acc + r.stock_value_selling, 0);
  const lowStockModelsCount = reportRows.filter(r => r.is_low_stock || r.is_out_of_stock).length;

  // Top selling models
  const topSelling = db.prepare(`
    SELECT b.brand, b.model_name, b.type, SUM(bi.quantity) AS total_sold, SUM(bi.subtotal) as revenue
    FROM bill_items bi
    JOIN bills bl ON bl.id = bi.bill_id
    JOIN batteries b ON b.id = bi.battery_id
    WHERE bl.status != 'cancelled'
    GROUP BY bi.battery_id
    ORDER BY total_sold DESC LIMIT 5
  `).all();

  // Slow moving models (no sales in last 60 days)
  const slowMoving = db.prepare(`
    SELECT b.id, b.brand, b.model_name, b.type, b.current_stock, ls.last_sale_date
    FROM batteries b
    LEFT JOIN (
      SELECT bi.battery_id, MAX(bl.created_at) AS last_sale_date
      FROM bill_items bi
      JOIN bills bl ON bl.id = bi.bill_id
      WHERE bl.status != 'cancelled'
      GROUP BY bi.battery_id
    ) ls ON ls.battery_id = b.id
    WHERE b.is_active = 1
      AND (ls.last_sale_date IS NULL OR date(ls.last_sale_date) < date('now', 'localtime', '-60 days'))
    ORDER BY b.current_stock DESC LIMIT 10
  `).all();

  // Old battery stock summary
  const oldBatterySummary = db.prepare(`
    SELECT battery_type, brand, COUNT(*) AS count
    FROM old_battery_stock
    WHERE status = 'in_stock'
    GROUP BY battery_type, brand
    ORDER BY count DESC
  `).all();

  const totalOldBatteries = db.prepare("SELECT COUNT(*) AS count FROM old_battery_stock WHERE status = 'in_stock'").get().count;
  const scrapRevenue = db.prepare("SELECT COALESCE(SUM(amount_received), 0) AS total_scrap FROM scrap_sales").get().total_scrap;

  res.json({
    summary: {
      totalBatteriesInStock,
      totalStockValueCost,
      totalPotentialSalesValue,
      lowStockModelsCount,
      totalOldBatteries,
      scrapRevenue
    },
    inventory: reportRows,
    topSelling,
    slowMoving,
    oldBatterySummary
  });
});

module.exports = router;
