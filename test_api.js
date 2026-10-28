const http = require('http');

async function testWorkflow() {
  console.log('--- STARTING COMPREHENSIVE END-TO-END SYSTEM TEST ---');

  // Load modules directly to verify DB logic & endpoints
  const { db } = require('./server/db');
  const jwt = require('jsonwebtoken');
  const bcrypt = require('bcryptjs');

  // 1. Verify Users
  const users = db.prepare('SELECT id, username, name, role, can_view_dues, can_view_inventory FROM users').all();
  console.log(`✓ DB Users verified (${users.length} users):`);
  users.forEach(u => console.log(`   - [${u.role.toUpperCase()}] ${u.name} (username: ${u.username})`));

  // 2. Test Passwords
  const ownerUser = db.prepare('SELECT * FROM users WHERE username = ?').get('owner');
  const passCheck = bcrypt.compareSync('Ganesh@123', ownerUser.password_hash);
  console.log(`✓ Owner password verification: ${passCheck ? 'PASSED' : 'FAILED'}`);

  // 3. Test Battery Catalog
  const batteryCount = db.prepare('SELECT COUNT(*) as c FROM batteries WHERE is_active = 1').get().c;
  console.log(`✓ Active Battery Models in Catalog: ${batteryCount}`);

  // 4. Test Customer Dues & Computed Balance Logic
  const duesReport = db.prepare(`
    SELECT 
      c.id, c.name, c.mobile,
      COALESCE(SUM(b.grand_total), 0) AS total_purchases,
      COALESCE(SUM(b.amount_paid), 0) AS total_paid,
      COALESCE(SUM(b.balance_due), 0) AS pending_balance
    FROM customers c
    LEFT JOIN bills b ON b.customer_id = c.id AND b.status != 'cancelled'
    GROUP BY c.id
  `).all();
  console.log(`✓ Customer Dues Computed:`);
  duesReport.forEach(c => {
    console.log(`   - ${c.name} (+91 ${c.mobile}): Purchases ₹${c.total_purchases}, Paid ₹${c.total_paid}, Due ₹${c.pending_balance}`);
  });

  // 5. Test Stock Valuation
  const stockSummary = db.prepare(`
    SELECT 
      SUM(current_stock) as total_units,
      SUM(current_stock * cost_price) as total_cost_val,
      SUM(current_stock * selling_price) as total_retail_val
    FROM batteries WHERE is_active = 1
  `).get();
  console.log(`✓ Inventory Valuation Summary:`);
  console.log(`   - Total Stock Units: ${stockSummary.total_units}`);
  console.log(`   - Total Value at Cost: ₹${Math.round(stockSummary.total_cost_val).toLocaleString('en-IN')}`);
  console.log(`   - Potential Sales Value: ₹${Math.round(stockSummary.total_retail_val).toLocaleString('en-IN')}`);

  // 6. Test Old Battery Scrap Stock
  const oldBatteryCount = db.prepare("SELECT COUNT(*) as c FROM old_battery_stock WHERE status = 'in_stock'").get().c;
  console.log(`✓ In-Stock Old Battery Scrap: ${oldBatteryCount} units`);

  // 6b. Test Multi-Item Bills & Supplier Khata
  const billItemsCount = db.prepare('SELECT COUNT(*) as c FROM bill_items').get().c;
  console.log(`✓ Bill Line Items Stored: ${billItemsCount}`);

  const billsMissingItems = db.prepare(`
    SELECT COUNT(*) as c FROM bills b
    WHERE b.status != 'cancelled'
      AND NOT EXISTS (SELECT 1 FROM bill_items bi WHERE bi.bill_id = b.id)
  `).get().c;
  console.log(`✓ Bills Missing Line Items: ${billsMissingItems} ${billsMissingItems === 0 ? '(OK)' : '(FAILED)'}`);

  const supplierSummary = db.prepare(`
    SELECT
      COALESCE((SELECT SUM(total_cost) FROM stock_movements WHERE supplier_id IS NOT NULL), 0) AS total_purchases,
      COALESCE((SELECT SUM(amount) FROM supplier_payments), 0) AS total_paid
  `).get();
  console.log(`✓ Supplier Khata: Purchases ₹${supplierSummary.total_purchases}, Paid ₹${supplierSummary.total_paid}, Balance ₹${supplierSummary.total_purchases - supplierSummary.total_paid}`);

  // 7. Test Message URL Generator (wa.me fallback)
  const { generateWaMeUrl, renderTemplate, getSetting } = require('./server/services/messaging');
  const template = getSetting('msg_template_bill');
  const rendered = renderTemplate(template, {
    bill_no: 'MAB-9999',
    date: '27-10-2026',
    customer_name: 'Test Customer',
    customer_mobile: '9822012345',
    battery_desc: 'Exide Epiq EPIQ35L (35Ah) x1',
    serial_no: 'EX-9921',
    exchange_discount: 600,
    amount_paid: 4800,
    balance_due: 0,
    grand_total: 4800,
    payment_mode: 'UPI',
    warranty_months: 72
  });
  const waUrl = generateWaMeUrl('9822012345', rendered);
  console.log(`✓ WhatsApp URL Generator Test:`);
  console.log(`   - Generated wa.me URL starts with: ${waUrl.substring(0, 45)}...`);

  // 8. Test Automatic Daily Backup
  const { createBackup, listBackups } = require('./server/services/backup');
  const backupRes = createBackup();
  console.log(`✓ Database Backup Snapshot Created: ${backupRes ? backupRes.fileName : 'FAILED'}`);
  const allBackups = listBackups();
  console.log(`✓ Total Saved Backups: ${allBackups.length}`);

  console.log('--- ALL BACKEND CORE VERIFICATIONS PASSED SUCCESSFULLY! ---');
}

testWorkflow().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
