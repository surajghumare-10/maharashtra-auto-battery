const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { authenticateToken, requireRole } = require('../auth');
const { dbPath, createBackup, listBackups } = require('../services/backup');

// GET /backup/download - Download database backup file (Owner only)
router.get('/download', authenticateToken, requireRole(['owner']), (req, res) => {
  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ error: 'Database file not found' });
  }

  // Create immediate fresh snapshot to guarantee flush
  const snapshot = createBackup();
  const fileToDownload = snapshot ? snapshot.filePath : dbPath;

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const downloadName = `maharashtra_auto_battery_backup_${dateStr}.sqlite`;

  res.download(fileToDownload, downloadName, (err) => {
    if (err) {
      console.error('Download error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download backup' });
      }
    }
  });
});

// POST /backup/create - Trigger manual backup (Owner only)
router.post('/create', authenticateToken, requireRole(['owner']), (req, res) => {
  const result = createBackup();
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
