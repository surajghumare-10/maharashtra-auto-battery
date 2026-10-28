const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../auth');
const { getConfig } = require('../services/googleSheets');

// GET /settings (all authenticated staff can read shop details; secrets masked if not owner)
router.get('/', authenticateToken, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const r of rows) {
    settings[r.key] = r.value;
  }

  // If worker, mask sensitive WhatsApp token / Twilio auth token
  if (req.user.role === 'worker') {
    delete settings.whatsapp_access_token;
    delete settings.twilio_auth_token;
    delete settings.fast2sms_api_key;
    if (settings.gsheets_private_key) settings.gsheets_private_key = '***MASKED***';
  }

  if (req.user.role !== 'owner' && settings.gsheets_private_key) {
    settings.gsheets_private_key = settings.gsheets_private_key ? '***MASKED***' : '';
  }

  res.json({ settings, gsheetsConfigured: !!getConfig() });
});

// PUT /settings (Owner only)
router.put('/', authenticateToken, requireRole(['owner']), (req, res) => {
  const updates = req.body; // { key: value, ... }

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Settings object is required' });
  }

  const upsert = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const updateTx = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      upsert.run(key, String(value != null ? value : ''));
    }
  });

  updateTx();

  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const r of rows) {
    settings[r.key] = r.value;
  }
  if (settings.gsheets_private_key) {
    settings.gsheets_private_key = '***MASKED***';
  }

  res.json({ message: 'Settings updated successfully', settings, gsheetsConfigured: !!getConfig() });
});

module.exports = router;
