const { classify } = require('../services/scoringService');
const { app, request, csrf, login, createUser, cleanup, query } = require('./helpers');

afterAll(cleanup);

describe('classification thresholds', () => {
  test.each([[100, 'Strong'], [80, 'Strong'], [79.9, 'Developing'], [60, 'Developing'], [59, 'Needs Improvement'], [40, 'Needs Improvement'], [39, 'Weak'], [0, 'Weak']])(
    '%s is %s', (score, label) => expect(classify(score).label).toBe(label));
});

async function startAttempt(agent) {
  const { rows } = await query(`SELECT id FROM assessments WHERE status = 'published' ORDER BY id LIMIT 1`);
  const token = await csrf(agent, `/assessments/${rows[0].id}`);
  const res = await agent.post(`/assessments/${rows[0].id}/start`).type('form').send({ _csrf: token });
  expect(res.status).toBe(302);
  return { assessmentId: rows[0].id, attemptId: parseInt(res.headers.location.split('/').pop(), 10) };
}

describe('taking and scoring an assessment', () => {
  let user; let agent; let attemptId; let assessmentId; let token;

  beforeAll(async () => {
    user = await createUser('assess');
    ({ agent } = await login(user.email, user.password));
    ({ attemptId, assessmentId } = await startAttempt(agent));
    token = await csrf(agent, `/attempts/${attemptId}`);
  });

  test('the exam page never exposes correct answers', async () => {
    const res = await agent.get(`/attempts/${attemptId}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/is_correct|isCorrect/);
  });

  test('another user cannot read this attempt or its result (IDOR)', async () => {
    const other = await createUser('other');
    const { agent: otherAgent } = await login(other.email, other.password);
    expect((await otherAgent.get(`/attempts/${attemptId}`)).status).toBe(404);
    expect((await otherAgent.get(`/attempts/${attemptId}/result`)).status).toBe(404);
  });

  test('answering every question correctly scores 100% and updates skills', async () => {
    const { rows } = await query(
      `SELECT aq.question_id, o.id AS option_id FROM assessment_questions aq
         JOIN question_options o ON o.question_id = aq.question_id AND o.is_correct WHERE aq.assessment_id = $1`, [assessmentId]);
    for (const r of rows) {
      const res = await agent.post(`/attempts/${attemptId}/answer`).send({ _csrf: token, question_id: r.question_id, option_id: r.option_id });
      expect(res.status).toBe(200);
    }
    const submit = await agent.post(`/attempts/${attemptId}/submit`).type('form').send({ _csrf: token });
    expect(submit.headers.location).toBe(`/attempts/${attemptId}/result`);
    const attempt = (await query('SELECT status, score FROM assessment_attempts WHERE id = $1', [attemptId])).rows[0];
    expect(attempt.status).toBe('completed');
    expect(attempt.score).toBe(100);
    const skills = (await query('SELECT score FROM user_skills WHERE user_id = $1', [user.id])).rows;
    expect(skills.length).toBeGreaterThan(0);
    skills.forEach((s) => expect(s.score).toBe(100));
    const earned = (await query(
      `SELECT a.rule_key FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = $1`, [user.id])).rows.map((r) => r.rule_key);
    expect(earned).toEqual(expect.arrayContaining(['first_assessment', 'perfect_score']));
  });

  test('answers cannot be changed after submission', async () => {
    const q = (await query('SELECT question_id FROM assessment_questions WHERE assessment_id = $1 LIMIT 1', [assessmentId])).rows[0];
    const res = await agent.post(`/attempts/${attemptId}/answer`).send({ _csrf: token, question_id: q.question_id, option_id: 1 });
    expect(res.status).toBe(409);
  });
});

describe('server-side deadline', () => {
  test('an expired attempt is graded on open, counting only saved answers', async () => {
    const user = await createUser('expired');
    const { agent } = await login(user.email, user.password);
    const { attemptId } = await startAttempt(agent);
    await query(`UPDATE assessment_attempts SET expires_at = NOW() - INTERVAL '5 minutes' WHERE id = $1`, [attemptId]);
    const res = await agent.get(`/attempts/${attemptId}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/attempts/${attemptId}/result`);
    expect((await query('SELECT score FROM assessment_attempts WHERE id = $1', [attemptId])).rows[0].score).toBe(0);
  });
});
