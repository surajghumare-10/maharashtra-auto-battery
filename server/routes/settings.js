const express = require('express');
const router = express.Router();
const { db, refreshSettingsCache } = require('../db');
const { authenticateToken, requireRole } = require('../auth');
const { getConfig } = require('../services/googleSheets');

// GET /settings (all authenticated staff can read shop details; secrets masked if not owner)
router.get('/', authenticateToken, async (req, res) => {
  const rows = await db.all('SELECT key, value FROM settings');
  const settings = {};
  for (const r of rows) {
    settings[r.key] = r.value;
  }

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
router.put('/', authenticateToken, requireRole(['owner']), async (req, res) => {
  const updates = req.body;

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Settings object is required' });
  }

  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(updates)) {
      await tx.run(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, key, String(value != null ? value : ''));
    }
  });
  await refreshSettingsCache();

  const rows = await db.all('SELECT key, value FROM settings');
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
