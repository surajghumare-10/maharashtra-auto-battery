const fs = require('fs');
const path = require('path');
const { db } = require('../db');

const backupsDir = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');
const TABLES = [
  'users',
  'settings',
  'batteries',
  'customers',
  'bills',
  'bill_items',
  'bill_edits',
  'payments',
  'stock_movements',
  'old_battery_stock',
  'scrap_sales',
  'suppliers',
  'supplier_payments',
  'warranty_replacements',
  'battery_loans'
];

function ensureBackupsDir() {
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
}

async function createBackup() {
  try {
    ensureBackupsDir();

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const backupFileName = `backup-${dateStr}_${timeStr}.json`;
    const destPath = path.join(backupsDir, backupFileName);

    const tables = {};
    for (const table of TABLES) {
      tables[table] = await db.all(`SELECT * FROM ${table}`);
    }

    const payload = {
      app: 'maharashtra-auto-battery',
      storage: 'supabase-postgres',
      createdAt: now.toISOString(),
      tables
    };

    fs.writeFileSync(destPath, JSON.stringify(payload, null, 2));
    console.log(`✓ Database backup created: ${backupFileName}`);
    cleanOldBackups();

    return {
      fileName: backupFileName,
      filePath: destPath,
      sizeBytes: fs.statSync(destPath).size,
      createdAt: now.toISOString()
    };
  } catch (err) {
    console.error('Error creating database backup:', err);
    return null;
  }
}

function listBackups() {
  if (!fs.existsSync(backupsDir)) return [];
  const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.json') || f.endsWith('.sqlite'));
  return files.map(file => {
    const fullPath = path.join(backupsDir, file);
    const stat = fs.statSync(fullPath);
    return {
      fileName: file,
      sizeBytes: stat.size,
      createdAt: stat.mtime
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function cleanOldBackups(keepDays = 14) {
  try {
    if (!fs.existsSync(backupsDir)) return;
    const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.json') || f.endsWith('.sqlite'));
    const now = Date.now();
    const maxAgeMs = keepDays * 24 * 60 * 60 * 1000;

    for (const file of files) {
      const fullPath = path.join(backupsDir, file);
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (err) {
    console.error('Error cleaning old backups:', err);
  }
}

function initAutoBackup() {
  createBackup();
  setInterval(() => {
    createBackup();
  }, 24 * 60 * 60 * 1000);
}

module.exports = {
  createBackup,
  listBackups,
  initAutoBackup
};
