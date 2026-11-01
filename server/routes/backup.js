const express = require('express');
const router = express.Router();
const fs = require('fs');
const { authenticateToken, requireRole } = require('../auth');
const { createBackup, listBackups } = require('../services/backup');

// GET /backup/download - Download database backup file (Owner only)
router.get('/download', authenticateToken, requireRole(['owner']), async (req, res) => {
  const snapshot = await createBackup();
  if (!snapshot || !fs.existsSync(snapshot.filePath)) {
    return res.status(500).json({ error: 'Failed to create backup snapshot' });
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const downloadName = `maharashtra_auto_battery_backup_${dateStr}.json`;

  res.download(snapshot.filePath, downloadName, (err) => {
    if (err) {
      console.error('Download error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download backup' });
      }
    }
  });
});

// POST /backup/create - Trigger manual backup (Owner only)
router.post('/create', authenticateToken, requireRole(['owner']), async (req, res) => {
  const result = await createBackup();
  if (!result) {
    return res.status(500).json({ error: 'Failed to create backup' });
  }
  res.json({ message: 'Backup created successfully', backup: result });
});

// GET /backup/list - List existing backups (Owner only)
router.get('/list', authenticateToken, requireRole(['owner']), (req, res) => {
  const backups = listBackups();
  res.json({ backups });
});

module.exports = router;
