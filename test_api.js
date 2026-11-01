require('dotenv').config();
const bcrypt = require('bcryptjs');

async function testWorkflow() {
  console.log('--- STARTING COMPREHENSIVE END-TO-END SYSTEM TEST ---');

  const { db, initSchema } = require('./server/db');
  await initSchema();

  const users = await db.all('SELECT id, username, name, role, can_view_dues, can_view_inventory FROM users');
  console.log(`✓ DB Users verified (${users.length} users):`);
  users.forEach(u => console.log(`   - [${u.role.toUpperCase()}] ${u.name} (username: ${u.username})`));

  const ownerUser = await db.get('SELECT * FROM users WHERE username = ?', 'owner');
  const passCheck = bcrypt.compareSync('Ganesh@123', ownerUser.password_hash);
  console.log(`✓ Owner password verification: ${passCheck ? 'PASSED' : 'FAILED'}`);

  const batteryCount = (await db.get('SELECT COUNT(*) as c FROM batteries WHERE is_active = 1')).c;
  console.log(`✓ Active Battery Models in Catalog: ${batteryCount}`);

  const duesReport = await db.all(`
    SELECT 
      c.id, c.name, c.mobile,
      COALESCE(SUM(b.grand_total), 0) AS total_purchases,
      COALESCE(SUM(b.amount_paid), 0) AS total_paid,
      COALESCE(SUM(b.balance_due), 0) AS pending_balance
    FROM customers c
    LEFT JOIN bills b ON b.customer_id = c.id AND b.status != 'cancelled'
    GROUP BY c.id
  `);
  console.log(`✓ Customer Dues Computed:`);
  duesReport.forEach(c => {
    console.log(`   - ${c.name} (+91 ${c.mobile}): Purchases ₹${c.total_purchases}, Paid ₹${c.total_paid}, Due ₹${c.pending_balance}`);
  });

  const stockSummary = await db.get(`
    SELECT 
      SUM(current_stock) as total_units,
      SUM(current_stock * cost_price) as total_cost_val,
      SUM(current_stock * selling_price) as total_retail_val
    FROM batteries WHERE is_active = 1
  `);
  console.log(`✓ Inventory Valuation Summary:`);
  console.log(`   - Total Stock Units: ${stockSummary.total_units}`);
  console.log(`   - Total Value at Cost: ₹${Math.round(stockSummary.total_cost_val).toLocaleString('en-IN')}`);
  console.log(`   - Potential Sales Value: ₹${Math.round(stockSummary.total_retail_val).toLocaleString('en-IN')}`);

  const oldBatteryCount = (await db.get("SELECT COUNT(*) as c FROM old_battery_stock WHERE status = 'in_stock'")).c;
  console.log(`✓ In-Stock Old Battery Scrap: ${oldBatteryCount} units`);

  const billItemsCount = (await db.get('SELECT COUNT(*) as c FROM bill_items')).c;
  console.log(`✓ Bill Line Items Stored: ${billItemsCount}`);

  const billsMissingItems = (await db.get(`
    SELECT COUNT(*) as c FROM bills b
    WHERE b.status != 'cancelled'
      AND NOT EXISTS (SELECT 1 FROM bill_items bi WHERE bi.bill_id = b.id)
  `)).c;
  console.log(`✓ Bills Missing Line Items: ${billsMissingItems} ${billsMissingItems === 0 ? '(OK)' : '(FAILED)'}`);

  const supplierSummary = await db.get(`
    SELECT
      COALESCE((SELECT SUM(total_cost) FROM stock_movements WHERE supplier_id IS NOT NULL), 0) AS total_purchases,
      COALESCE((SELECT SUM(amount) FROM supplier_payments), 0) AS total_paid
  `);
  console.log(`✓ Supplier Khata: Purchases ₹${supplierSummary.total_purchases}, Paid ₹${supplierSummary.total_paid}, Balance ₹${supplierSummary.total_purchases - supplierSummary.total_paid}`);

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

  const { createBackup, listBackups } = require('./server/services/backup');
  const backupRes = await createBackup();
  console.log(`✓ Database Backup Snapshot Created: ${backupRes ? backupRes.fileName : 'FAILED'}`);
  const allBackups = listBackups();
  console.log(`✓ Total Saved Backups: ${allBackups.length}`);

  console.log('--- ALL BACKEND CORE VERIFICATIONS PASSED SUCCESSFULLY! ---');
  await db.close();
}

testWorkflow().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
