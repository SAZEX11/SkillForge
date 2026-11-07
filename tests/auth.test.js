const bcrypt = require('bcrypt');
const { app, request, csrf, login, createUser, cleanup, query } = require('./helpers');

afterAll(cleanup);

describe('registration', () => {
  const email = `test-reg-${Date.now()}@example.com`;

  test('creates a user with a bcrypt hash and the user role', async () => {
    const agent = request.agent(app);
    const token = await csrf(agent, '/register');
    const res = await agent.post('/register').type('form').send({
      _csrf: token, name: 'Reg Test', email, password: 'Secret@1234', confirm_password: 'Secret@1234', career_goal: 'Backend Developer' });
    expect(res.status).toBe(302);
    const { rows } = await query(
      `SELECT u.password_hash, array_agg(r.name) AS roles FROM users u JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id WHERE u.email = $1 GROUP BY u.id`, [email]);
    expect(rows[0].password_hash).not.toBe('Secret@1234');
    expect(await bcrypt.compare('Secret@1234', rows[0].password_hash)).toBe(true);
    expect(rows[0].roles).toEqual(['user']);
    await query('DELETE FROM users WHERE email = $1', [email]);
  });

  test('rejects a short password and mismatched confirmation', async () => {
    const agent = request.agent(app);
    const token = await csrf(agent, '/register');
    const res = await agent.post('/register').type('form').send({
      _csrf: token, name: 'X', email: 'x@example.com', password: 'short', confirm_password: 'different', career_goal: 'Backend Developer' });
    expect(res.status).toBe(422);
    expect(res.text).toMatch(/at least 8 characters/);
    expect(res.text).toMatch(/do not match/);
  });

  test('rejects a duplicate email', async () => {
    const user = await createUser('dup');
    const agent = request.agent(app);
    const token = await csrf(agent, '/register');
    const res = await agent.post('/register').type('form').send({
      _csrf: token, name: 'Dup', email: user.email, password: 'Secret@1234', confirm_password: 'Secret@1234', career_goal: 'Backend Developer' });
    expect(res.status).toBe(409);
  });

  test('rejects a POST without a CSRF token', async () => {
    const res = await request(app).post('/register').type('form').send({ email: 'a@b.com' });
    expect(res.status).toBe(403);
  });
});

describe('login and logout', () => {
  test('valid credentials redirect to the dashboard', async () => {
    const user = await createUser('login');
    const { res } = await login(user.email, user.password);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  test('wrong password is rejected with a generic message', async () => {
    const user = await createUser('wrongpw');
    const { res } = await login(user.email, 'not-the-password');
    expect(res.status).toBe(401);
    expect(res.text).toMatch(/Invalid email or password/);
  });

  test('deactivated users cannot log in', async () => {
    const user = await createUser('inactive');
    await query(`UPDATE users SET status = 'inactive' WHERE id = $1`, [user.id]);
    const { res } = await login(user.email, user.password);
    expect(res.status).toBe(401);
  });

  test('logout destroys the session', async () => {
    const user = await createUser('logout');
    const { agent } = await login(user.email, user.password);
    const token = await csrf(agent, '/dashboard');
    await agent.post('/logout').type('form').send({ _csrf: token });
    const after = await agent.get('/dashboard');
    expect(after.status).toBe(302);
    expect(after.headers.location).toBe('/login');
  });
});
