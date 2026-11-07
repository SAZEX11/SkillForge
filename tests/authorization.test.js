const { app, request, login, createUser, cleanup, query } = require('./helpers');

afterAll(cleanup);

describe('unauthenticated access', () => {
  test.each(['/dashboard', '/assessments', '/roadmap', '/content', '/admin'])('%s redirects to /login', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

describe('role-based access', () => {
  test('a learner gets 403 on admin and content pages', async () => {
    const user = await createUser('learner');
    const { agent } = await login(user.email, user.password);
    expect((await agent.get('/dashboard')).status).toBe(200);
    expect((await agent.get('/admin')).status).toBe(403);
    expect((await agent.get('/admin/users')).status).toBe(403);
    expect((await agent.get('/content')).status).toBe(403);
    expect((await agent.get('/content/questions')).status).toBe(403);
  });

  test('a content manager can use /content but not /admin', async () => {
    const user = await createUser('manager');
    await query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'content_manager'`, [user.id]);
    const { agent } = await login(user.email, user.password);
    expect((await agent.get('/content')).status).toBe(200);
    expect((await agent.get('/content/questions')).status).toBe(200);
    expect((await agent.get('/admin')).status).toBe(403);
  });

  test('an admin can open admin pages', async () => {
    const user = await createUser('admin');
    await query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name IN ('admin', 'content_manager')`, [user.id]);
    const { agent } = await login(user.email, user.password);
    for (const path of ['/admin', '/admin/users', '/admin/analytics', '/admin/audit-logs']) {
      expect((await agent.get(path)).status).toBe(200);
    }
  });

  test('role changes apply to a live session without logging in again', async () => {
    const user = await createUser('live');
    const { agent } = await login(user.email, user.password);
    expect((await agent.get('/content')).status).toBe(403);
    await query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'content_manager'`, [user.id]);
    expect((await agent.get('/content')).status).toBe(200);
  });

  test('deactivating a user ends their live session', async () => {
    const user = await createUser('deactivate');
    const { agent } = await login(user.email, user.password);
    await query(`UPDATE users SET status = 'inactive' WHERE id = $1`, [user.id]);
    const res = await agent.get('/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});
