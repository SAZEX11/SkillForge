const { query } = require('../config/db');
const audit = require('./auditModel');

exports.list = async ({ q, skillId, difficulty, status, limit, offset }) => {
  const { rows } = await query(
    `SELECT q.id, q.text, q.difficulty, q.status,
            COALESCE((SELECT string_agg(s.name, ', ' ORDER BY s.name) FROM question_skills qs
                        JOIN skills s ON s.id = qs.skill_id WHERE qs.question_id = q.id), '') AS skills,
            COUNT(*) OVER() AS total
       FROM questions q
      WHERE ($1::text = '' OR q.text ILIKE '%' || $1 || '%')
        AND ($2::int IS NULL OR EXISTS (SELECT 1 FROM question_skills qs WHERE qs.question_id = q.id AND qs.skill_id = $2))
        AND ($3::text IS NULL OR q.difficulty = $3)
        AND ($4::text IS NULL OR q.status = $4)
      ORDER BY q.id DESC LIMIT $5 OFFSET $6`, [q, skillId, difficulty, status, limit, offset]);
  return { rows, total: rows.length ? rows[0].total : 0 };
};

exports.find = async (id) => {
  const { rows } = await query(
    `SELECT q.id, q.text, q.difficulty, q.explanation, q.status,
            COALESCE((SELECT json_agg(json_build_object('id', o.id, 'option_text', o.option_text, 'is_correct', o.is_correct) ORDER BY o.id)
                        FROM question_options o WHERE o.question_id = q.id), '[]') AS options,
            COALESCE((SELECT array_agg(skill_id) FROM question_skills WHERE question_id = q.id), '{}') AS skill_ids
       FROM questions q WHERE q.id = $1`, [id]);
  return rows[0] || null;
};

// Creates or updates a question with its options and skill mappings. Call inside withTransaction.
exports.save = async (client, id, d, userId) => {
  let qid = id;
  if (id) {
    await client.query('UPDATE questions SET text = $1, difficulty = $2, explanation = $3 WHERE id = $4',
      [d.text, d.difficulty, d.explanation, id]);
  } else {
    qid = (await client.query(
      `INSERT INTO questions (text, difficulty, explanation, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
      [d.text, d.difficulty, d.explanation, userId])).rows[0].id;
  }
  const existing = id ? (await client.query('SELECT id FROM question_options WHERE question_id = $1', [qid])).rows.map((r) => r.id) : [];
  await client.query('DELETE FROM question_options WHERE question_id = $1 AND NOT (id = ANY($2::int[]))',
    [qid, d.options.filter((o) => o.id).map((o) => o.id)]);
  // Clear first so the "one correct option" unique index is never violated mid-update.
  await client.query('UPDATE question_options SET is_correct = FALSE WHERE question_id = $1', [qid]);
  for (const o of d.options) {
    if (o.id && existing.includes(o.id)) {
      await client.query('UPDATE question_options SET option_text = $1, is_correct = $2 WHERE id = $3 AND question_id = $4',
        [o.text, o.correct, o.id, qid]);
    } else {
      await client.query('INSERT INTO question_options (question_id, option_text, is_correct) VALUES ($1, $2, $3)',
        [qid, o.text, o.correct]);
    }
  }
  await client.query('DELETE FROM question_skills WHERE question_id = $1', [qid]);
  await client.query('INSERT INTO question_skills (question_id, skill_id) SELECT $1, UNNEST($2::int[])', [qid, d.skillIds]);
  await audit.log(client, userId, id ? 'QUESTION_UPDATED' : 'QUESTION_CREATED', 'question', qid, null,
    { text: d.text, difficulty: d.difficulty, skills: d.skillIds });
  return qid;
};
