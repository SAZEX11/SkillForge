const { query } = require('../config/db');
exports.listForUser = async (userId) => (await query(
  `SELECT a.id, a.name, a.description, a.icon, ua.earned_at
     FROM achievements a
     LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
    ORDER BY (ua.earned_at IS NULL), ua.earned_at DESC, a.id`, [userId])).rows;
