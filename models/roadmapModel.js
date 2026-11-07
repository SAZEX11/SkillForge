const { query } = require('../config/db');
// Latest roadmap that is not archived (active or completed), scoped to the owner.
exports.getCurrent = async (userId) => (await query(
  `SELECT id, career_goal, generated_at, status FROM roadmaps
    WHERE user_id = $1 AND status <> 'archived' ORDER BY generated_at DESC LIMIT 1`, [userId])).rows[0] || null;
exports.getItems = async (roadmapId) => (await query(
  `SELECT ri.id, ri.priority, ri.skill_gap, ri.status, ri.due_date,
          s.name AS skill, s.description AS skill_description,
          r.title, r.url, r.resource_type, r.difficulty
     FROM roadmap_items ri
     JOIN skills s ON s.id = ri.skill_id
     LEFT JOIN learning_resources r ON r.id = ri.resource_id
    WHERE ri.roadmap_id = $1 ORDER BY ri.priority, ri.id`, [roadmapId])).rows;
