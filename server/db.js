const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');

// PostgreSQL returns BIGINT/NUMERIC as strings by default. The client expects
// numbers throughout the app, so parse them once here.
types.setTypeParser(20, (value) => parseInt(value, 10));
types.setTypeParser(1700, (value) => parseFloat(value));

function cleanConnectionString(value) {
  if (!value) return '';
  let cleaned = String(value).trim();
  const quoted = (cleaned.startsWith('"') && cleaned.endsWith('"'))
    || (cleaned.startsWith("'") && cleaned.endsWith("'"));
  if (quoted) cleaned = cleaned.slice(1, -1).trim();
  return cleaned;
}

const connectionString = cleanConnectionString(process.env.DATABASE_URL);
if (!connectionString) {
  throw new Error('DATABASE_URL is required. Add your Supabase Postgres connection string to the environment.');
}

const useSsl = process.env.DATABASE_SSL !== 'false';

try {
  const target = new URL(connectionString);
  const decode = (value) => {
    try { return decodeURIComponent(value || ''); } catch { return value || ''; }
  };
  console.log(
    `DB target: host=${target.hostname} port=${target.port || '5432'} db=${target.pathname.replace(/^\//, '')} ` +
    `user=${decode(target.username)} passwordLength=${decode(target.password).length} ssl=${useSsl}`
  );
} catch {
  console.error('DB target: DATABASE_URL is not a valid connection URL');
}

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

function toPgSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function execute(client, sql, params = []) {
  return client.query(toPgSql(sql), params);
}

function createDb(client) {
  return {
    async get(sql, ...params) {
      const result = await execute(client, sql, params);
      return result.rows[0];
    },
    async all(sql, ...params) {
      const result = await execute(client, sql, params);
      return result.rows;
    },
    async run(sql, ...params) {
      let finalSql = sql.trim().replace(/;\s*$/, '');
      const needsId = /^\s*insert\s/i.test(finalSql)
        && !/\breturning\b/i.test(finalSql)
        && !/\bon\s+conflict\b/i.test(finalSql);
      if (needsId) finalSql += ' RETURNING id';
      const result = await execute(client, finalSql, params);
      return {
        changes: result.rowCount,
        lastInsertRowid: result.rows[0] ? result.rows[0].id : undefined
      };
    },
    query(sql, params = []) {
      return execute(client, sql, params);
    },
    exec(sql) {
      return client.query(sql);
    }
  };
}

const db = {
  ...createDb(pool),
  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(createDb(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // Preserve the original error.
      }
      throw err;
    } finally {
      client.release();
    }
  },
  async close() {
    await pool.end();
  }
};

let settingsCache = new Map();

async function refreshSettingsCache() {
  const rows = await db.all('SELECT key, value FROM settings');
  settingsCache = new Map(rows.map((row) => [row.key, row.value]));
  return settingsCache;
}

function getSetting(key) {
  return settingsCache.has(key) ? settingsCache.get(key) : null;
}

const nowSql = "to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')";
const todaySql = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727272)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner', 'manager', 'worker')),
        can_view_dues INTEGER DEFAULT 0,
        can_view_inventory INTEGER DEFAULT 0,
        created_at TEXT DEFAULT ${nowSql}
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS batteries (
        id SERIAL PRIMARY KEY,
        brand TEXT NOT NULL,
        model_name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('Car', 'Bike', 'Inverter', 'Tractor', 'Truck', 'E-rickshaw')),
        capacity_ah REAL NOT NULL,
        warranty_months INTEGER NOT NULL,
        selling_price REAL NOT NULL,
        cost_price REAL NOT NULL DEFAULT 0,
        exchange_discount REAL NOT NULL DEFAULT 0,
        current_stock INTEGER NOT NULL DEFAULT 0,
        low_stock_alert INTEGER NOT NULL DEFAULT 2,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT ${nowSql}
      );

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        mobile TEXT UNIQUE NOT NULL,
        address TEXT,
        village TEXT,
        last_vehicle_number TEXT,
        created_at TEXT DEFAULT ${nowSql},
        updated_at TEXT DEFAULT ${nowSql}
      );

      CREATE TABLE IF NOT EXISTS bills (
        id SERIAL PRIMARY KEY,
        bill_no TEXT UNIQUE NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        customer_name TEXT NOT NULL,
        customer_mobile TEXT NOT NULL,
        vehicle_number TEXT,
        village_name TEXT,
        battery_id INTEGER REFERENCES batteries(id),
        battery_brand TEXT NOT NULL,
        battery_model TEXT NOT NULL,
        battery_type TEXT NOT NULL,
        battery_capacity REAL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL,
        subtotal REAL NOT NULL,
        old_battery_returned INTEGER NOT NULL DEFAULT 0,
        old_battery_type TEXT,
        old_battery_brand TEXT,
        old_battery_condition TEXT,
        exchange_discount REAL NOT NULL DEFAULT 0,
        manual_discount REAL NOT NULL DEFAULT 0,
        grand_total REAL NOT NULL,
        payment_mode TEXT NOT NULL CHECK(payment_mode IN ('Cash', 'UPI', 'Card', 'Credit')),
        amount_paid REAL NOT NULL DEFAULT 0,
        balance_due REAL NOT NULL DEFAULT 0,
        warranty_months INTEGER NOT NULL,
        serial_number TEXT,
        notes TEXT,
        status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'cancelled')),
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_by_name TEXT NOT NULL,
        whatsapp_status TEXT DEFAULT 'pending',
        whatsapp_error TEXT,
        created_at TEXT DEFAULT ${nowSql},
        updated_at TEXT DEFAULT ${nowSql}
      );

      CREATE TABLE IF NOT EXISTS bill_items (
        id SERIAL PRIMARY KEY,
        bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
        battery_id INTEGER REFERENCES batteries(id),
        brand TEXT NOT NULL,
        model_name TEXT NOT NULL,
        type TEXT NOT NULL,
        capacity_ah REAL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL,
        subtotal REAL NOT NULL,
        exchange_discount REAL NOT NULL DEFAULT 0,
        warranty_months INTEGER NOT NULL,
        serial_number TEXT,
        old_battery_returned INTEGER NOT NULL DEFAULT 0,
        old_battery_type TEXT,
        old_battery_brand TEXT,
        old_battery_condition TEXT,
        created_at TEXT DEFAULT ${nowSql}
      );

      CREATE TABLE IF NOT EXISTS bill_edits (
        id SERIAL PRIMARY KEY,
        bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
        edited_by INTEGER NOT NULL REFERENCES users(id),
        edited_by_name TEXT NOT NULL,
        changes_summary TEXT NOT NULL,
        previous_data TEXT,
        new_data TEXT,
        created_at TEXT DEFAULT ${nowSql}
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        receipt_no TEXT UNIQUE,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        bill_id INTEGER REFERENCES bills(id),
        amount REAL NOT NULL,
        payment_mode TEXT NOT NULL CHECK(payment_mode IN ('Cash', 'UPI', 'Card')),
        notes TEXT,
        received_by INTEGER NOT NULL REFERENCES users(id),
        received_by_name TEXT NOT NULL,
        whatsapp_status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT ${nowSql}
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id SERIAL PRIMARY KEY,
        battery_id INTEGER NOT NULL REFERENCES batteries(id),
        type TEXT NOT NULL CHECK(type IN ('in', 'sale', 'adjustment', 'return', 'cancel_reversal')),
        quantity INTEGER NOT NULL,
        cost_price REAL,
        supplier_name TEXT,
        supplier_id INTEGER,
        reference_id TEXT,
        reason TEXT,
        total_cost REAL DEFAULT 0,
        amount_paid REAL DEFAULT 0,
        balance_due REAL DEFAULT 0,
        user_id INTEGER NOT NULL REFERENCES users(id),
        user_name TEXT NOT NULL,
        created_at TEXT DEFAULT ${nowSql}
      );

      CREATE TABLE IF NOT EXISTS old_battery_stock (
        id SERIAL PRIMARY KEY,
        battery_type TEXT NOT NULL,
        brand TEXT,
        condition TEXT,
        source_bill_id INTEGER REFERENCES bills(id),
        status TEXT DEFAULT 'in_stock' CHECK(status IN ('in_stock', 'sold_as_scrap')),
        scrap_sale_id INTEGER,
        created_at TEXT DEFAULT ${nowSql}
      );

      CREATE TABLE IF NOT EXISTS scrap_sales (
        id SERIAL PRIMARY KEY,
        scrap_dealer_name TEXT NOT NULL,
        total_batteries_count INTEGER NOT NULL,
        amount_received REAL NOT NULL,
        payment_mode TEXT NOT NULL,
        notes TEXT,
        sold_by INTEGER NOT NULL REFERENCES users(id),
        sold_by_name TEXT NOT NULL,
        created_at TEXT DEFAULT ${nowSql}
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        contact_person TEXT,
        mobile TEXT,
        city TEXT,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT ${nowSql}
      );

      CREATE TABLE IF NOT EXISTS supplier_payments (
        id SERIAL PRIMARY KEY,
        supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
        amount REAL NOT NULL,
        payment_mode TEXT NOT NULL CHECK(payment_mode IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque')),
        reference_no TEXT,
        notes TEXT,
        paid_by INTEGER NOT NULL REFERENCES users(id),
        paid_by_name TEXT NOT NULL,
        created_at TEXT DEFAULT ${nowSql}
      );

      CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
      CREATE INDEX IF NOT EXISTS idx_bill_items_battery ON bill_items(battery_id);
      CREATE INDEX IF NOT EXISTS idx_bills_customer ON bills(customer_id);
      CREATE INDEX IF NOT EXISTS idx_bills_created ON bills(created_at);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_battery ON stock_movements(battery_id);
      CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
    `);

    await seedInitialData();
    await backfillBillItems();
    await refreshSettingsCache();
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(727272)');
    } finally {
      client.release();
    }
  }
}

async function backfillBillItems() {
  const legacyBills = await db.all(`
    SELECT b.* FROM bills b
    WHERE NOT EXISTS (SELECT 1 FROM bill_items bi WHERE bi.bill_id = b.id)
  `);

  if (legacyBills.length === 0) return;

  await db.transaction(async (tx) => {
    for (const b of legacyBills) {
      await tx.run(`
        INSERT INTO bill_items (
          bill_id, battery_id, brand, model_name, type, capacity_ah,
          quantity, unit_price, subtotal, exchange_discount, warranty_months,
          serial_number, old_battery_returned, old_battery_type, old_battery_brand,
          old_battery_condition, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        b.id,
        b.battery_id,
        b.battery_brand || 'Battery',
        b.battery_model || '',
        b.battery_type || 'Car',
        b.battery_capacity,
        b.quantity || 1,
        b.unit_price || 0,
        b.subtotal || b.grand_total || 0,
        b.exchange_discount || 0,
        b.warranty_months || 12,
        b.serial_number,
        b.old_battery_returned || 0,
        b.old_battery_type,
        b.old_battery_brand,
        b.old_battery_condition,
        b.created_at
      );
    }
  });
  console.log(`✓ Backfilled ${legacyBills.length} legacy bills into bill_items`);
}

async function seedInitialData() {
  const userCount = (await db.get('SELECT COUNT(*) AS count FROM users')).count;
  if (userCount === 0) {
    const salt = bcrypt.genSaltSync(10);
    await db.run(
      `INSERT INTO users (username, password_hash, name, role, can_view_dues, can_view_inventory)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'owner', bcrypt.hashSync('Ganesh@123', salt), 'Ganesh Ghumare', 'owner', 1, 1
    );
    await db.run(
      `INSERT INTO users (username, password_hash, name, role, can_view_dues, can_view_inventory)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'manager', bcrypt.hashSync('Om@123', salt), 'Om Ghumare', 'manager', 1, 1
    );
    await db.run(
      `INSERT INTO users (username, password_hash, name, role, can_view_dues, can_view_inventory)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'worker', bcrypt.hashSync('worker123', salt), 'Ramesh Shinde (Counter Worker)', 'worker', 0, 0
    );
    console.log('✓ Seeded default users: owner, manager, worker');
  }

  const defaultSettings = {
    shop_name: 'Maharashtra Auto Battery',
    tagline: 'All Types of Auto & Inverter Batteries | Sales & Service',
    address: 'Shop No. 4, Old Pune-Mumbai Highway, Near ST Bus Stand, Maharashtra',
    phone: '+91 98220 12345',
    alt_phone: '+91 94220 54321',
    gst_number: '27ABCDE1234F1Z5',
    upi_id: 'mahabattery@okhdfcbank',
    upi_payee_name: 'Maharashtra Auto Battery',
    owner_mobile: '9822012345',
    shop_logo: '',
    invoice_note: 'Thank you for your business! Visit again!',
    terms: '1. Warranty claims as per manufacturer policy. 2. Please keep this bill & warranty card safely. 3. Battery replacement requires original bill and physical warranty card.',
    whatsapp_api_url: 'https://graph.facebook.com/v19.0',
    whatsapp_phone_number_id: '',
    whatsapp_access_token: '',
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_phone_number: '',
    fast2sms_api_key: '',
    msg_template_bill: `Thank you for shopping at Maharashtra Auto Battery!
Bill No: {bill_no}
Date: {date}
Customer: {customer_name}
Battery: {battery_desc}
Serial No: {serial_no}
Old Battery Exchange: -₹{exchange_discount}
Total Paid: ₹{amount_paid}
Balance Due: ₹{balance_due}
Payment Mode: {payment_mode}
Warranty: {warranty_months} months
Visit again!`,
    msg_template_owner: `[NEW BILL] Maharashtra Auto Battery
Bill: {bill_no} | Date: {date}
Billed By: {created_by_name} ({created_by_role})
Customer: {customer_name} ({customer_mobile})
Item: {battery_desc}
Total: ₹{grand_total} | Paid: ₹{amount_paid} | Mode: {payment_mode} | Due: ₹{balance_due}`,
    msg_template_payment: `Payment Received - Maharashtra Auto Battery
Receipt No: {receipt_no}
Date: {date}
Customer: {customer_name}
Received: ₹{amount} ({payment_mode})
Remaining Balance: {remaining_balance}
Thank you!`,
    msg_template_reminder: `Dear {customer_name}, greetings from Maharashtra Auto Battery.
A friendly reminder that a pending balance of ₹{balance_due} is outstanding on your account.
Kindly clear it at your earliest convenience via UPI ({upi_id}) or cash at our shop.
Thank you! Ph: {shop_phone}`
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', key, value);
  }

  const batteryCount = (await db.get('SELECT COUNT(*) AS count FROM batteries')).count;
  if (batteryCount === 0) {
    const batteries = [
      ['Exide', 'Epiq EPIQ35L', 'Car', 35, 72, 5400, 4200, 600, 10, 2],
      ['Exide', 'Matrix MT35L', 'Car', 35, 66, 4900, 3800, 600, 8, 2],
      ['Exide', 'Mileage FML0-ML38B20L', 'Car', 35, 48, 4300, 3350, 550, 14, 3],
      ['Exide', 'Drive DRIVE40L', 'Car', 40, 36, 3850, 2950, 500, 6, 2],
      ['Amaron', 'Pro AAM-PR-00042B20L', 'Car', 35, 66, 5100, 3950, 600, 12, 3],
      ['Amaron', 'Flo AAM-FL-0BH42B20L', 'Car', 35, 55, 4650, 3550, 550, 9, 2],
      ['Amaron', 'Black AAM-BL-0BL40B20L', 'Car', 35, 48, 4150, 3150, 500, 5, 2],
      ['Amaron', 'Current CR-00042B20L', 'Car', 35, 36, 3750, 2850, 450, 7, 2],
      ['Tata Green', 'Silver GS40L', 'Car', 35, 48, 3950, 3050, 500, 4, 2],
      ['Exide', 'Xplore 12XL5L-B', 'Bike', 5, 48, 1450, 1050, 150, 18, 4],
      ['Exide', 'Xplore 12XL2.5L-C', 'Bike', 2.5, 48, 1100, 800, 100, 12, 3],
      ['Amaron', 'Pro Rider AP-BTZ4L', 'Bike', 4, 48, 1250, 900, 120, 15, 4],
      ['Amaron', 'Pro Rider AP-BTZ5L', 'Bike', 5, 48, 1500, 1100, 150, 16, 4],
      ['Amaron', 'Pro Rider AP-BTZ9', 'Bike', 9, 48, 1950, 1450, 200, 8, 2],
      ['Luminous', 'Red Charge RC18000', 'Inverter', 150, 36, 13500, 10800, 2200, 8, 2],
      ['Luminous', 'Inverlast ILTT26060', 'Inverter', 220, 60, 19500, 15600, 3000, 4, 1],
      ['Exide', 'Inva Tubular IT500', 'Inverter', 150, 66, 15800, 12600, 2500, 6, 2],
      ['Exide', 'Inva Plus IP1500', 'Inverter', 150, 36, 12900, 10200, 2000, 5, 2],
      ['Livguard', 'Invertuff IT1560ST', 'Inverter', 150, 60, 14200, 11300, 2200, 5, 2],
      ['Exide', 'Jai Kisan JK1000', 'Tractor', 88, 36, 7800, 6100, 1200, 5, 2],
      ['Amaron', 'Harvest AAM-HV-100D26R', 'Tractor', 85, 36, 7600, 5950, 1200, 4, 2],
      ['Exide', 'Express XP1300', 'Truck', 130, 36, 12200, 9800, 1800, 4, 2],
      ['Amaron', 'Hi-Life Professional 150D31R', 'Truck', 120, 36, 11500, 9100, 1700, 3, 1],
      ['Exide', 'E-Ride Tubular ER100T', 'E-rickshaw', 100, 18, 8900, 7200, 1400, 10, 3],
      ['Amaron', 'E-Rickshaw ER1000', 'E-rickshaw', 100, 18, 8700, 7050, 1400, 8, 3]
    ];

    const batteryIds = [];
    for (const b of batteries) {
      const res = await db.run(
        `INSERT INTO batteries (brand, model_name, type, capacity_ah, warranty_months, selling_price, cost_price, exchange_discount, current_stock, low_stock_alert)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ...b
      );
      batteryIds.push(res.lastInsertRowid);
      await db.run(
        `INSERT INTO stock_movements (battery_id, type, quantity, cost_price, supplier_name, reason, user_id, user_name)
         VALUES (?, 'in', ?, ?, 'Opening Stock', 'Initial Inventory Setup', 1, 'Ganesh Ghumare')`,
        res.lastInsertRowid, b[8], b[6]
      );
    }
    console.log(`✓ Seeded ${batteries.length} battery models with opening stock`);

    const seedDemo = process.env.SEED_DEMO_DATA === 'true';
    const custCount = seedDemo ? (await db.get('SELECT COUNT(*) AS count FROM customers')).count : -1;
    if (seedDemo && custCount === 0) {
      const cust1 = await db.run(
        `INSERT INTO customers (name, mobile, address) VALUES ('Santosh Jadhav', '9890123456', 'Khadki, Pune')`
      );
      const cust2 = await db.run(
        `INSERT INTO customers (name, mobile, address) VALUES ('Ganesh Shinde', '9823456789', 'Talegaon Dabhade')`
      );

      const bill1 = await db.run(`
        INSERT INTO bills (
          bill_no, customer_id, customer_name, customer_mobile,
          battery_id, battery_brand, battery_model, battery_type, battery_capacity,
          quantity, unit_price, subtotal, old_battery_returned, old_battery_type,
          old_battery_brand, exchange_discount, manual_discount, grand_total,
          payment_mode, amount_paid, balance_due, warranty_months, serial_number,
          notes, status, created_by, created_by_name, whatsapp_status
        ) VALUES (
          'MAB-0001', ?, 'Santosh Jadhav', '9890123456',
          ?, 'Exide', 'Epiq EPIQ35L', 'Car', 35,
          1, 5400, 5400, 1, 'Car',
          'Old Exide 35Ah', 600, 100, 4700,
          'UPI', 4700, 0, 72, 'EX-EP-992819',
          'Swift Dzire fitment done', 'completed', 1, 'Ganesh Ghumare', 'sent'
        )`,
        cust1.lastInsertRowid, batteryIds[0]
      );

      await db.run(
        `INSERT INTO old_battery_stock (battery_type, brand, condition, source_bill_id, status)
         VALUES ('Car', 'Old Exide', 'Used / Scrap', ?, 'in_stock')`,
        bill1.lastInsertRowid
      );

      const bill2 = await db.run(`
        INSERT INTO bills (
          bill_no, customer_id, customer_name, customer_mobile,
          battery_id, battery_brand, battery_model, battery_type, battery_capacity,
          quantity, unit_price, subtotal, old_battery_returned, old_battery_type,
          old_battery_brand, exchange_discount, manual_discount, grand_total,
          payment_mode, amount_paid, balance_due, warranty_months, serial_number,
          notes, status, created_by, created_by_name, whatsapp_status
        ) VALUES (
          'MAB-0002', ?, 'Ganesh Shinde', '9823456789',
          ?, 'Luminous', 'Red Charge RC18000', 'Inverter', 150,
          1, 13500, 13500, 1, 'Inverter',
          'Local Inverter 150Ah', 2200, 300, 11000,
          'Credit', 6000, 5000, 36, 'LUM-RC-881290',
          'Will pay remaining ₹5,000 next Saturday', 'completed', 2, 'Om Ghumare', 'sent'
        )`,
        cust2.lastInsertRowid, batteryIds[14]
      );

      await db.run(
        `INSERT INTO old_battery_stock (battery_type, brand, condition, source_bill_id, status)
         VALUES ('Inverter', 'Local Inverter', 'Damaged plate', ?, 'in_stock')`,
        bill2.lastInsertRowid
      );

      console.log('✓ Seeded sample customers and bills');
    }
  }
}

module.exports = {
  db,
  pool,
  initSchema,
  refreshSettingsCache,
  getSetting,
  todaySql,
  nowSql
};
