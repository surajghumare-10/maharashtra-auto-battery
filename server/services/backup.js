const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const backupsDir = path.join(__dirname, '..', '..', 'backups');
const dbPath = path.join(dataDir, 'mab_battery.sqlite');

function createBackup() {
  try {
    if (!fs.existsSync(dbPath)) {
      return null;
    }
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const backupFileName = `backup-${dateStr}_${timeStr}.sqlite`;
    const destPath = path.join(backupsDir, backupFileName);

    fs.copyFileSync(dbPath, destPath);
    console.log(`✓ Database backup created: ${backupFileName}`);

    // Prune backups older than 14 days
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
  const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.sqlite'));
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
    const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.sqlite'));
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

// Start daily backup schedule (every 24 hours)
function initAutoBackup() {
  // Run on startup
  createBackup();
  // Schedule every 24 hours
  setInterval(() => {
    createBackup();
  }, 24 * 60 * 60 * 1000);
}

module.exports = {
  dbPath,
  createBackup,
  listBackups,
  initAutoBackup
};
