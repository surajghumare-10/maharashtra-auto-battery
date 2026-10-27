const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'maharashtra-auto-battery-super-secret-key-2026';

function generateToken(user, rememberMe = false) {
  const expiresIn = rememberMe ? '30d' : '12h';
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      can_view_dues: user.can_view_dues,
      can_view_inventory: user.can_view_inventory
    },
    JWT_SECRET,
    { expiresIn }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Session expired or invalid token. Please log in again.' });
    }

    // Refresh user permissions from DB in case they were updated
    const freshUser = db.prepare('SELECT id, username, name, role, can_view_dues, can_view_inventory FROM users WHERE id = ?').get(decoded.id);
    if (!freshUser) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    req.user = freshUser;
    next();
  });
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Requires one of: ${allowedRoles.join(', ')}` });
    }
    next();
  };
}

function requireDuesAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role === 'owner' || (req.user.role === 'manager' && req.user.can_view_dues === 1)) {
    return next();
  }
  return res.status(403).json({ error: 'Access denied: Customer Dues report is restricted to Owner/Authorized Managers.' });
}

function requireInventoryAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role === 'owner' || (req.user.role === 'manager' && req.user.can_view_inventory === 1)) {
    return next();
  }
  return res.status(403).json({ error: 'Access denied: Inventory report is restricted to Owner/Authorized Managers.' });
}

module.exports = {
  JWT_SECRET,
  generateToken,
  authenticateToken,
  requireRole,
  requireDuesAccess,
  requireInventoryAccess
};
