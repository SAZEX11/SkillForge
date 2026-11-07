const { query } = require('../config/db');
const SUMMARY = `
  SELECT a.id, a.title, a.description, a.time_limit,
    (SELECT COUNT(*) FROM assessment_questions WHERE assessment_id = a.id) AS question_count,
    COALESCE((SELECT array_agg(DISTINCT s.name ORDER BY s.name)
                FROM assessment_questions aq
                JOIN question_skills qs ON qs.question_id = aq.question_id
                JOIN skills s ON s.id = qs.skill_id
               WHERE aq.assessment_id = a.id), '{}') AS skills
  FROM assessments a WHERE a.status = 'published'`;
exports.listPublished = async () => (await query(SUMMARY + ' ORDER BY a.id')).rows;
exports.findPublished = async (id) => (await query(SUMMARY + ' AND a.id = $1', [id])).rows[0] || null;
exports.findActiveAttempt = async (userId, assessmentId) => (await query(
  `SELECT id FROM assessment_attempts WHERE user_id = $1 AND assessment_id = $2 AND status = 'in_progress'`,
  [userId, assessmentId])).rows[0] || null;
exports.createAttempt = async (userId, assessment) => (await query(
  `INSERT INTO assessment_attempts (assessment_id, user_id, expires_at)
   VALUES ($1, $2, NOW() + make_interval(mins => $3)) RETURNING id`,
  [assessment.id, userId, assessment.time_limit])).rows[0].id;
// Ownership is enforced here: the attempt must belong to the logged-in user.
exports.getAttempt = async (id, userId) => (await query(
  `SELECT t.id, t.assessment_id, t.status, t.score, t.total_marks, t.earned_marks, t.started_at, t.completed_at,
          a.title, a.time_limit,
          EXTRACT(EPOCH FROM (t.expires_at - NOW())) AS seconds_left,
          EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) AS seconds_taken
     FROM assessment_attempts t JOIN assessments a ON a.id = t.assessment_id
    WHERE t.id = $1 AND t.user_id = $2`, [id, userId])).rows[0] || null;
// Options are returned WITHOUT is_correct.
exports.getQuestions = async (attemptId, assessmentId) => (await query(
  `SELECT q.id, q.text, aq.marks, aa.selected_option_id,
          (SELECT json_agg(json_build_object('id', o.id, 'text', o.option_text) ORDER BY o.id)
             FROM question_options o WHERE o.question_id = q.id) AS options
     FROM assessment_questions aq
     JOIN questions q ON q.id = aq.question_id
     LEFT JOIN attempt_answers aa ON aa.attempt_id = $1 AND aa.question_id = q.id
    WHERE aq.assessment_id = $2 ORDER BY aq.question_order`, [attemptId, assessmentId])).rows;
// Only stores the answer if the option really belongs to a question of this assessment.
exports.saveAnswer = async (attemptId, assessmentId, questionId, optionId) => (await query(
  `INSERT INTO attempt_answers (attempt_id, question_id, selected_option_id)
   SELECT $1, $3, o.id FROM assessment_questions aq
     JOIN question_options o ON o.question_id = aq.question_id
    WHERE aq.assessment_id = $2 AND aq.question_id = $3 AND o.id = $4
   ON CONFLICT (attempt_id, question_id)
   DO UPDATE SET selected_option_id = EXCLUDED.selected_option_id, answered_at = NOW()`,
  [attemptId, assessmentId, questionId, optionId])).rowCount === 1;
exports.getBreakdown = async (attemptId) => (await query(
  `SELECT s.name, ROUND(SUM(aa.marks_awarded) / SUM(aq.marks) * 100, 0) AS score
     FROM attempt_answers aa
     JOIN assessment_attempts t ON t.id = aa.attempt_id
     JOIN assessment_questions aq ON aq.assessment_id = t.assessment_id AND aq.question_id = aa.question_id
     JOIN question_skills qs ON qs.question_id = aa.question_id
     JOIN skills s ON s.id = qs.skill_id
    WHERE aa.attempt_id = $1 GROUP BY s.name ORDER BY score DESC, s.name`, [attemptId])).rows;
exports.getReview = async (attemptId) => (await query(
  `SELECT q.text, q.explanation, aa.is_correct, so.option_text AS selected, co.option_text AS correct
     FROM attempt_answers aa
     JOIN assessment_attempts t ON t.id = aa.attempt_id
     JOIN assessment_questions aq ON aq.assessment_id = t.assessment_id AND aq.question_id = aa.question_id
     JOIN questions q ON q.id = aa.question_id
     LEFT JOIN question_options so ON so.id = aa.selected_option_id
     JOIN question_options co ON co.question_id = q.id AND co.is_correct
    WHERE aa.attempt_id = $1 ORDER BY aq.question_order`, [attemptId])).rows;
