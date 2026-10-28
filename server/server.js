require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { initSchema } = require('./db');
const { initAutoBackup } = require('./services/backup');

const authRoutes = require('./routes/auth');
const batteryRoutes = require('./routes/batteries');
const customerRoutes = require('./routes/customers');
const billRoutes = require('./routes/bills');
const paymentRoutes = require('./routes/payments');
const stockRoutes = require('./routes/stock');
const reportRoutes = require('./routes/reports');
const settingRoutes = require('./routes/settings');
const supplierRoutes = require('./routes/suppliers');
const backupRoutes = require('./routes/backup');

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    shop: 'Maharashtra Auto Battery',
    storage: process.env.DB_PATH ? 'persistent' : 'local',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/batteries', batteryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/backup', backupRoutes);

// Serve Client in production or when client/dist exists
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(path.join(clientDistPath, 'index.html'));
    }
    next();
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Initialize database schema and start server
initSchema();
initAutoBackup();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`⚡ Maharashtra Auto Battery Server is running`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🏪 Ready for counter operations`);
  console.log(`====================================================`);
});
