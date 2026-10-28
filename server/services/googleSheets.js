const crypto = require('crypto');
const { db } = require('../db');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

let tokenCache = null;

function getSetting(key) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  } catch (e) {
    return null;
  }
}

function getConfig() {
  const enabled = getSetting('gsheets_enabled');
  if (enabled !== 'true') return null;

  const sheetId = getSetting('gsheets_sheet_id') || process.env.GOOGLE_SHEET_ID;
  const clientEmail = getSetting('gsheets_client_email') || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = getSetting('gsheets_private_key') || process.env.GOOGLE_PRIVATE_KEY;

  if (!sheetId || !clientEmail || !privateKey) return null;

  if (typeof privateKey === 'string') {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  return {
    sheetId,
    clientEmail,
    privateKey,
    billsSheet: getSetting('gsheets_bills_sheet') || process.env.GOOGLE_SHEET_NAME || 'Bills',
    paymentsSheet: getSetting('gsheets_payments_sheet') || 'Payments'
  };
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function getAccessToken(config) {
  const cacheKey = `${config.clientEmail}:${config.sheetId}`;
  if (tokenCache && tokenCache.key === cacheKey && tokenCache.expiresAt > Date.now() + 60000) {
    return tokenCache.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: config.clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(config.privateKey, 'base64url');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `Token request failed (${response.status})`);
  }

  tokenCache = {
    key: cacheKey,
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000
  };
  return data.access_token;
}

async function sheetsRequest(config, path, options = {}) {
  const token = await getAccessToken(config);
  const response = await fetch(`${SHEETS_URL}/${encodeURIComponent(config.sheetId)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `Sheets request failed (${response.status})`);
  }
  return data;
}

async function appendRow(sheetName, values) {
  const config = getConfig();
  if (!config) return { skipped: true };

  try {
    await sheetsRequest(
      config,
      `/values/${encodeURIComponent(`${sheetName}!A:ZZ`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        body: JSON.stringify({ values: [values] })
      }
    );
    return { ok: true };
  } catch (err) {
    console.error('Google Sheets sync error:', err.message);
    return { ok: false, error: err.message };
  }
}

async function ensureHeaders(sheetName, headers) {
  const config = getConfig();
  if (!config) return { skipped: true };

  try {
    const data = await sheetsRequest(
      config,
      `/values/${encodeURIComponent(`${sheetName}!A1:ZZ1`)}`
    );
    const existing = data.values && data.values[0] ? data.values[0] : [];
    if (existing.length === 0 || existing.join('|').toLowerCase() !== headers.join('|').toLowerCase()) {
      await sheetsRequest(
        config,
        `/values/${encodeURIComponent(`${sheetName}!A1`)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          body: JSON.stringify({ values: [headers] })
        }
      );
    }
    return { ok: true };
  } catch (err) {
    console.error('Google Sheets header error:', err.message);
    return { ok: false, error: err.message };
  }
}

const BILL_HEADERS = [
  'Date',
  'Time',
  'Bill No',
  'Customer Name',
  'Customer Mobile',
  'Vehicle Number',
  'Village',
  'Items (Summary)',
  'Quantity (Total)',
  'Subtotal',
  'Exchange Discount',
  'Manual/Special Discount',
  'Grand Total',
  'Amount Paid',
  'Balance Due',
  'Payment Mode',
  'Status',
  'Serial Numbers',
  'Warranty (Months)',
  'Staff',
  'Notes',
  'Synced At'
];

const PAYMENT_HEADERS = [
  'Date',
  'Time',
  'Receipt No',
  'Customer Name',
  'Customer Mobile',
  'Bill No(s)',
  'Amount Received',
  'Payment Mode',
  'Notes',
  'Received By',
  'Synced At'
];

function syncBill(bill, items = []) {
  try {
    const config = getConfig();
    if (!config) return;
    ensureHeaders(config.billsSheet, BILL_HEADERS).catch(() => {});

    const created = bill.created_at || new Date().toISOString().replace('T', ' ').slice(0, 19);
    const [date, time] = created.split(' ');
    const itemSummary = (items && items.length > 0)
      ? items.map(i => `${i.brand || i.battery_brand} ${i.model_name || i.battery_model} x${i.quantity}`).join(' | ')
      : (bill.battery_brand ? `${bill.battery_brand} ${bill.battery_model} x${bill.quantity || 1}` : '');
    const qtyTotal = (items && items.length > 0)
      ? items.reduce((s, i) => s + (parseInt(i.quantity, 10) || 0), 0)
      : (parseInt(bill.quantity, 10) || 0);
    const serials = (items && items.length > 0)
      ? items.map(i => i.serial_number).filter(Boolean).join(', ')
      : (bill.serial_number || '');
    const warranties = (items && items.length > 0)
      ? items.map(i => i.warranty_months).filter(Boolean).join(', ')
      : (bill.warranty_months || '');

    const values = [
      date || '',
      time || '',
      bill.bill_no || bill.id || '',
      bill.customer_name || '',
      bill.customer_mobile || '',
      bill.vehicle_number || '',
      bill.village_name || '',
      itemSummary,
      qtyTotal,
      bill.subtotal || 0,
      bill.exchange_discount || 0,
      bill.manual_discount || 0,
      bill.grand_total || 0,
      bill.amount_paid || 0,
      bill.balance_due || 0,
      bill.payment_mode || '',
      bill.status || 'completed',
      serials,
      warranties,
      bill.created_by_name || '',
      bill.notes || '',
      new Date().toISOString()
    ];

    appendRow(config.billsSheet, values).catch(() => {});
  } catch (err) {
    console.error('syncBill error:', err.message);
  }
}

function syncPayment(payment, customer = {}) {
  try {
    const config = getConfig();
    if (!config) return;
    ensureHeaders(config.billsSheet, BILL_HEADERS).catch(() => {});

    const created = payment.created_at || new Date().toISOString().replace('T', ' ').slice(0, 19);
    const [date, time] = created.split(' ');
    const values = [
      date || '',
      time || '',
      payment.receipt_no || `REC-${payment.id}`,
      customer.name || payment.customer_name || '',
      customer.mobile || payment.customer_mobile || '',
      payment.bill_no || '',
      payment.amount || 0,
      payment.payment_mode || '',
      payment.notes || '',
      payment.received_by_name || '',
      new Date().toISOString()
    ];

    appendRow(config.billsSheet, values).catch(() => {});
  } catch (err) {
    console.error('syncPayment error:', err.message);
  }
}

module.exports = {
  syncBill,
  syncPayment,
  getConfig,
  ensureHeaders
};
