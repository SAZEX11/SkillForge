const { login, csrf, createUser, cleanup, query } = require('./helpers');

afterAll(cleanup);

describe('roadmap generation', () => {
  test('without skill scores the user is sent to take an assessment', async () => {
    const user = await createUser('noscores');
    const { agent } = await login(user.email, user.password);
    const token = await csrf(agent, '/roadmap');
    const res = await agent.post('/roadmap/generate').type('form').send({ _csrf: token });
    expect(res.headers.location).toBe('/assessments');
    expect((await query('SELECT COUNT(*) AS n FROM roadmaps WHERE user_id = $1', [user.id])).rows[0].n).toBe(0);
  });

  test('skills below threshold become steps ordered by the largest gap', async () => {
    const user = await createUser('roadmap');
    await query(`INSERT INTO user_skills (user_id, skill_id, score)
                 SELECT $1, id, CASE name WHEN 'JavaScript' THEN 30 WHEN 'SQL' THEN 60 ELSE 100 END FROM skills`, [user.id]);
    const { agent } = await login(user.email, user.password);
    const token = await csrf(agent, '/roadmap');
    const res = await agent.post('/roadmap/generate').type('form').send({ _csrf: token });
    expect(res.headers.location).toBe('/roadmap');
    const { rows } = await query(
      `SELECT DISTINCT ri.priority, s.name, ri.skill_gap FROM roadmap_items ri JOIN roadmaps r ON r.id = ri.roadmap_id
         JOIN skills s ON s.id = ri.skill_id WHERE r.user_id = $1 ORDER BY ri.priority`, [user.id]);
    expect(rows.map((r) => r.name)).toEqual(['JavaScript', 'SQL']); // gaps 45 and 15
    expect(rows[0].skill_gap).toBeGreaterThan(rows[1].skill_gap);
  });

  test('regenerating archives the previous roadmap (one active at a time)', async () => {
    const user = await createUser('regen');
    await query(`INSERT INTO user_skills (user_id, skill_id, score) SELECT $1, id, 20 FROM skills WHERE name = 'CSS'`, [user.id]);
    const { agent } = await login(user.email, user.password);
    const token = await csrf(agent, '/roadmap');
    await agent.post('/roadmap/generate').type('form').send({ _csrf: token });
    await agent.post('/roadmap/generate').type('form').send({ _csrf: token });
    const { rows } = await query('SELECT status FROM roadmaps WHERE user_id = $1 ORDER BY id', [user.id]);
    expect(rows.map((r) => r.status)).toEqual(['archived', 'active']);
  });

  test('a user cannot complete another user\'s roadmap item (ownership)', async () => {
    const owner = await createUser('owner');
    await query(`INSERT INTO user_skills (user_id, skill_id, score) SELECT $1, id, 10 FROM skills WHERE name = 'HTML'`, [owner.id]);
    const { agent: ownerAgent } = await login(owner.email, owner.password);
    const ownerToken = await csrf(ownerAgent, '/roadmap');
    await ownerAgent.post('/roadmap/generate').type('form').send({ _csrf: ownerToken });
    const item = (await query(`SELECT ri.id FROM roadmap_items ri JOIN roadmaps r ON r.id = ri.roadmap_id WHERE r.user_id = $1 LIMIT 1`, [owner.id])).rows[0];

    const thief = await createUser('thief');
    const { agent: thiefAgent } = await login(thief.email, thief.password);
    const thiefToken = await csrf(thiefAgent, '/roadmap');
    expect((await thiefAgent.post(`/roadmap/items/${item.id}/complete`).type('form').send({ _csrf: thiefToken })).status).toBe(404);
    expect((await query('SELECT status FROM roadmap_items WHERE id = $1', [item.id])).rows[0].status).toBe('pending');

    expect((await ownerAgent.post(`/roadmap/items/${item.id}/complete`).type('form').send({ _csrf: ownerToken })).status).toBe(302);
    expect((await query('SELECT status FROM roadmap_items WHERE id = $1', [item.id])).rows[0].status).toBe('completed');
  });
});
