const { query } = require('../config/db');
exports.search = async ({ q, skillId, difficulty, type, limit, offset }) => {
  const { rows } = await query(
    `SELECT r.id, r.title, r.description, r.resource_type, r.difficulty, s.name AS skill, COUNT(*) OVER() AS total
       FROM learning_resources r JOIN skills s ON s.id = r.skill_id
      WHERE r.status = 'active'
        AND ($1::text = '' OR r.title ILIKE '%' || $1 || '%' OR r.description ILIKE '%' || $1 || '%')
        AND ($2::int IS NULL OR r.skill_id = $2)
        AND ($3::text IS NULL OR r.difficulty = $3)
        AND ($4::text IS NULL OR r.resource_type = $4)
      ORDER BY s.name, r.id LIMIT $5 OFFSET $6`, [q, skillId, difficulty, type, limit, offset]);
  return { rows, total: rows.length ? rows[0].total : 0 };
};
exports.find = async (id) => (await query(
  `SELECT r.*, s.name AS skill FROM learning_resources r JOIN skills s ON s.id = r.skill_id
    WHERE r.id = $1 AND r.status = 'active'`, [id])).rows[0] || null;
exports.related = async (skillId, excludeId) => (await query(
  `SELECT id, title, resource_type, difficulty FROM learning_resources
    WHERE skill_id = $1 AND id <> $2 AND status = 'active' ORDER BY id LIMIT 3`, [skillId, excludeId])).rows;
exports.skills = async () => (await query('SELECT id, name FROM skills ORDER BY name')).rows;
