const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { generateToken, authenticateToken, requireRole } = require('../auth');

// POST /login
router.post('/login', (req, res) => {
  const { username, password, rememberMe } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = generateToken(user, !!rememberMe);
  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      can_view_dues: user.can_view_dues,
      can_view_inventory: user.can_view_inventory
    }
  });
});

// GET /me
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// GET /users (Owner only)
router.get('/users', authenticateToken, requireRole(['owner']), (req, res) => {
  const users = db.prepare(`
    SELECT id, username, name, role, can_view_dues, can_view_inventory, created_at
    FROM users
    ORDER BY id ASC
  `).all();
  res.json({ users });
});

// POST /users (Owner only)
router.post('/users', authenticateToken, requireRole(['owner']), (req, res) => {
  const { username, password, name, role, can_view_dues, can_view_inventory } = req.body;

  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'Username, password, name, and role are required' });
  }

  if (!['owner', 'manager', 'worker'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be owner, manager, or worker.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  if (existing) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  const duesVal = role === 'owner' ? 1 : (can_view_dues ? 1 : 0);
  const invVal = role === 'owner' ? 1 : (can_view_inventory ? 1 : 0);

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, name, role, can_view_dues, can_view_inventory)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(username.trim().toLowerCase(), passwordHash, name.trim(), role, duesVal, invVal);

  const newUser = db.prepare('SELECT id, username, name, role, can_view_dues, can_view_inventory, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ user: newUser });
});

// PUT /users/:id (Owner only)
router.put('/users/:id', authenticateToken, requireRole(['owner']), (req, res) => {
  const userId = Number(req.params.id);
  const { name, role, can_view_dues, can_view_inventory } = req.body;

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }

  const updatedName = name ? name.trim() : target.name;
  const updatedRole = role || target.role;
  const duesVal = updatedRole === 'owner' ? 1 : (can_view_dues !== undefined ? (can_view_dues ? 1 : 0) : target.can_view_dues);
  const invVal = updatedRole === 'owner' ? 1 : (can_view_inventory !== undefined ? (can_view_inventory ? 1 : 0) : target.can_view_inventory);

  db.prepare(`
    UPDATE users
    SET name = ?, role = ?, can_view_dues = ?, can_view_inventory = ?
    WHERE id = ?
  `).run(updatedName, updatedRole, duesVal, invVal, userId);

  const updatedUser = db.prepare('SELECT id, username, name, role, can_view_dues, can_view_inventory, created_at FROM users WHERE id = ?').get(userId);
  res.json({ user: updatedUser });
});

// PUT /users/:id/reset-password (Owner only)
router.put('/users/:id/reset-password', authenticateToken, requireRole(['owner']), (req, res) => {
  const userId = Number(req.params.id);
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long' });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(newPassword, salt);

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  res.json({ message: 'Password reset successfully' });
});

// DELETE /users/:id (Owner only)
router.delete('/users/:id', authenticateToken, requireRole(['owner']), (req, res) => {
  const userId = Number(req.params.id);

  if (req.user.id === userId) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ message: 'User deleted successfully' });
});

module.exports = router;
