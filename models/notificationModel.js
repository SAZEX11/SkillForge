const { query } = require('../config/db');
exports.list = async (userId) => (await query(
  `SELECT id, title, message, is_read, link, created_at FROM notifications
    WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [userId])).rows;
// Ownership is part of the WHERE clause.
exports.markRead = async (id, userId) => (await query(
  'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [id, userId])).rowCount;
exports.markAllRead = (userId) => query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND NOT is_read', [userId]);
