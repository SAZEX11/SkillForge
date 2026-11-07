// Runs inside the caller's transaction (client). Returns names of newly earned achievements.
exports.evaluateAfterAssessment = async (client, userId) => {
  const { rows } = await client.query(
    `SELECT COUNT(*) AS completed, COALESCE(BOOL_OR(score = 100), FALSE) AS perfect
       FROM assessment_attempts WHERE user_id = $1 AND status = 'completed'`, [userId]);
  const keys = [];
  if (rows[0].completed >= 1) keys.push('first_assessment');
  if (rows[0].completed >= 5) keys.push('assessment_master');
  if (rows[0].perfect) keys.push('perfect_score');
  const earned = await client.query(
    `INSERT INTO user_achievements (user_id, achievement_id)
     SELECT $1, id FROM achievements WHERE rule_key = ANY($2::text[])
     ON CONFLICT DO NOTHING
     RETURNING achievement_id`, [userId, keys]);
  if (!earned.rowCount) return [];
  const names = await client.query('SELECT name FROM achievements WHERE id = ANY($1::int[])',
    [earned.rows.map((r) => r.achievement_id)]);
  return names.rows.map((r) => r.name);
};

// Awards the given rule keys (inside the caller's transaction). Returns names of NEW achievements only.
exports.award = async (client, userId, keys) => {
  if (!keys.length) return [];
  const earned = await client.query(
    `INSERT INTO user_achievements (user_id, achievement_id)
     SELECT $1, id FROM achievements WHERE rule_key = ANY($2::text[])
     ON CONFLICT DO NOTHING RETURNING achievement_id`, [userId, keys]);
  if (!earned.rowCount) return [];
  const names = await client.query('SELECT name FROM achievements WHERE id = ANY($1::int[])',
    [earned.rows.map((r) => r.achievement_id)]);
  return names.rows.map((r) => r.name);
};
