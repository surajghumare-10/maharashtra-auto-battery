const crypto = require('crypto');
const { getSetting } = require('../db');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

let tokenCache = null;

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

async function appendRows(sheetName, rows) {
  const config = getConfig();
  if (!config) return { skipped: true };

  try {
    const data = await sheetsRequest(
      config,
      `/values/${encodeURIComponent(`${sheetName}!A:ZZ`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        body: JSON.stringify({ values: rows })
      }
    );
    return { ok: true, range: data.updates && data.updates.updatedRange };
  } catch (err) {
    console.error('Google Sheets sync error:', err.message);
    return { ok: false, error: err.message };
  }
}

async function appendRow(sheetName, values) {
  return appendRows(sheetName, [values]);
}

const sheetIdCache = new Map();

async function getSheetId(config, sheetName) {
  const key = `${config.sheetId}:${sheetName}`;
  if (sheetIdCache.has(key)) return sheetIdCache.get(key);
  const data = await sheetsRequest(config, '?fields=sheets.properties(sheetId,title)');
  for (const sheet of data.sheets || []) {
    sheetIdCache.set(`${config.sheetId}:${sheet.properties.title}`, sheet.properties.sheetId);
  }
  return sheetIdCache.get(key);
}

const BILL_MERGED_COLUMNS = [1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15, 16, 17, 20, 21, 22];

async function mergeBillRows(config, sheetName, startRow, endRow) {
  if (!startRow || !endRow || endRow <= startRow) return;
  const sheetId = await getSheetId(config, sheetName);
  if (sheetId === undefined || sheetId === null) return;

  const requests = BILL_MERGED_COLUMNS.map((column) => ({
    mergeCells: {
      mergeType: 'MERGE_COLUMNS',
      range: {
        sheetId,
        startRowIndex: startRow - 1,
        endRowIndex: endRow,
        startColumnIndex: column - 1,
        endColumnIndex: column
      }
    }
  }));

  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: startRow - 1,
        endRowIndex: endRow,
        startColumnIndex: 0,
        endColumnIndex: 22
      },
      cell: { userEnteredFormat: { verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat.verticalAlignment'
    }
  });

  await sheetsRequest(config, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests })
  });
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
  'Item',
  'Qty',
  'Item Subtotal',
  'Item Exchange Discount',
  'Manual/Special Discount',
  'Grand Total',
  'Amount Paid',
  'Balance Due',
  'Payment Mode',
  'Status',
  'Serial Number',
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

async function syncBill(bill, items = []) {
  try {
    const config = getConfig();
    if (!config) return;
    await ensureHeaders(config.billsSheet, BILL_HEADERS);

    const created = bill.created_at || new Date().toISOString().replace('T', ' ').slice(0, 19);
    const [date, time] = created.split(' ');
    const syncedAt = new Date().toISOString();
    const rowItems = (items && items.length > 0) ? items : [null];

    const rows = rowItems.map((item, index) => {
      const isFirst = index === 0;
      let itemSummary;
      let qty;
      let subtotal;
      let exchange;
      let serial;
      let warranty;

      if (item) {
        const capacity = item.capacity_ah ? ` (${item.capacity_ah}Ah)` : '';
        itemSummary = `${item.brand || item.battery_brand || ''} ${item.model_name || item.battery_model || ''}${capacity}`.trim();
        qty = parseInt(item.quantity, 10) || 0;
        subtotal = item.subtotal || 0;
        exchange = item.exchange_discount || 0;
        serial = item.serial_number || '';
        warranty = item.warranty_months || '';
      } else {
        itemSummary = bill.battery_brand ? `${bill.battery_brand} ${bill.battery_model || ''}`.trim() : '';
        qty = parseInt(bill.quantity, 10) || 0;
        subtotal = bill.subtotal || 0;
        exchange = bill.exchange_discount || 0;
        serial = bill.serial_number || '';
        warranty = bill.warranty_months || '';
      }

      return [
        date || '',
        time || '',
        bill.bill_no || bill.id || '',
        bill.customer_name || '',
        bill.customer_mobile || '',
        bill.vehicle_number || '',
        bill.village_name || '',
        itemSummary,
        qty,
        subtotal,
        exchange,
        isFirst ? (bill.manual_discount || 0) : '',
        isFirst ? (bill.grand_total || 0) : '',
        isFirst ? (bill.amount_paid || 0) : '',
        isFirst ? (bill.balance_due || 0) : '',
        isFirst ? (bill.payment_mode || '') : '',
        isFirst ? (bill.status || 'completed') : '',
        serial,
        warranty,
        isFirst ? (bill.created_by_name || '') : '',
        isFirst ? (bill.notes || '') : '',
        isFirst ? syncedAt : ''
      ];
    });

    const appended = await appendRows(config.billsSheet, rows);
    if (rows.length > 1 && appended.ok && appended.range) {
      const match = /!.*?(\d+):[A-Z]+(\d+)$/.exec(appended.range);
      if (match) {
        await mergeBillRows(config, config.billsSheet, Number(match[1]), Number(match[2]));
      }
    }
  } catch (err) {
    console.error('syncBill error:', err.message);
  }
}

async function syncPayment(payment, customer = {}) {
  try {
    const config = getConfig();
    if (!config) return;
    await ensureHeaders(config.paymentsSheet, PAYMENT_HEADERS);

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

    await appendRow(config.paymentsSheet, values);
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
