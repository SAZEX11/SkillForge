const { withTransaction } = require('../config/db');
const achievements = require('./achievementService');
const notifications = require('./notificationService');

function classify(score) {
  if (score >= 80) return { label: 'Strong', tone: 'success' };
  if (score >= 60) return { label: 'Developing', tone: 'info' };
  if (score >= 40) return { label: 'Needs Improvement', tone: 'warning' };
  return { label: 'Weak', tone: 'danger' };
}

// Grades an attempt atomically. Safe to call twice: a finished attempt is returned untouched.
function gradeAttempt(attemptId, userId) {
  return withTransaction(async (client) => {
    const found = await client.query(
      `SELECT id, assessment_id, status FROM assessment_attempts WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [attemptId, userId]);
    const attempt = found.rows[0];
    if (!attempt) return null;
    if (attempt.status !== 'in_progress') return attempt;

    // Unanswered questions become incorrect answers (selected_option_id stays NULL).
    await client.query(
      `INSERT INTO attempt_answers (attempt_id, question_id)
       SELECT $1, question_id FROM assessment_questions WHERE assessment_id = $2
       ON CONFLICT DO NOTHING`, [attemptId, attempt.assessment_id]);

    await client.query(
      `UPDATE attempt_answers aa
          SET is_correct = COALESCE((SELECT o.is_correct FROM question_options o WHERE o.id = aa.selected_option_id), FALSE),
              marks_awarded = CASE WHEN COALESCE((SELECT o.is_correct FROM question_options o WHERE o.id = aa.selected_option_id), FALSE)
                                   THEN aq.marks ELSE 0 END
         FROM assessment_questions aq
        WHERE aa.attempt_id = $1 AND aq.assessment_id = $2 AND aq.question_id = aa.question_id`,
      [attemptId, attempt.assessment_id]);

    const totals = await client.query(
      `SELECT SUM(aq.marks) AS total, SUM(aa.marks_awarded) AS earned
         FROM attempt_answers aa
         JOIN assessment_questions aq ON aq.assessment_id = $2 AND aq.question_id = aa.question_id
        WHERE aa.attempt_id = $1`, [attemptId, attempt.assessment_id]);
    const { total, earned } = totals.rows[0];
    const score = Math.round((earned / total) * 10000) / 100; // earned / total * 100

    await client.query(
      `UPDATE assessment_attempts
          SET status = 'completed', completed_at = NOW(), total_marks = $2, earned_marks = $3, score = $4
        WHERE id = $1`, [attemptId, total, earned, score]);

    // Weighted skill score per skill; keep the previous score for improvement tracking.
    await client.query(
      `INSERT INTO user_skills (user_id, skill_id, score, last_assessed_at)
       SELECT $1, qs.skill_id, ROUND(SUM(aa.marks_awarded) / SUM(aq.marks) * 100, 2), NOW()
         FROM attempt_answers aa
         JOIN assessment_questions aq ON aq.assessment_id = $2 AND aq.question_id = aa.question_id
         JOIN question_skills qs ON qs.question_id = aa.question_id
        WHERE aa.attempt_id = $3 GROUP BY qs.skill_id
       ON CONFLICT (user_id, skill_id)
       DO UPDATE SET previous_score = user_skills.score, score = EXCLUDED.score, last_assessed_at = NOW()`,
      [userId, attempt.assessment_id, attemptId]);

    await notifications.create(client, userId, 'Your assessment result is ready',
      `You scored ${score}%. See the full breakdown.`, `/attempts/${attemptId}/result`);
    for (const name of await achievements.evaluateAfterAssessment(client, userId)) {
      await notifications.create(client, userId, 'You earned a new achievement', `You unlocked "${name}".`, '/achievements');
    }
    return { ...attempt, status: 'completed', score };
  });
}

module.exports = { classify, gradeAttempt };
