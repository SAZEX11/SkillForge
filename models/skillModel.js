const { query } = require('../config/db');
exports.all = async () => (await query(
  `SELECT s.id, s.name, s.threshold, s.category_id, c.name AS category FROM skills s
     JOIN skill_categories c ON c.id = s.category_id ORDER BY c.name, s.name`)).rows;
exports.categories = async () => (await query('SELECT id, name FROM skill_categories ORDER BY name')).rows;
exports.simple = async () => (await query('SELECT id, name FROM skills ORDER BY name')).rows;
