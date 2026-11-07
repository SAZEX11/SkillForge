const { query, withTransaction } = require('../config/db');
const audit = require('../models/auditModel');
const userModel = require('../models/userModel');

const ROLES = ['user', 'content_manager', 'admin'];
const LIMIT = 12;
const toId = (v) => (/^\d+$/.test(String(v)) ? parseInt(v, 10) : null);
const flash = (req, type, message) => { req.session.flash = { type, message }; };
const actor = (req) => req.session.user.id;
const pageOf = (req) => Math.max(1, parseInt(req.query.page, 10) || 1);
const pager = (page, total, params) => {
  const base = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) base.set(k, v); });
  return { page, pages: Math.ceil(total / LIMIT), total, base: base.toString() };
};
const bars = (rows) => rows.map((r) => ({ label: r.label, value: r.value }));

exports.dashboard = async (req, res, next) => {
  try {
    const [totals, regs, attempts, recent] = await Promise.all([
      query(`SELECT (SELECT COUNT(*) FROM users) AS users,
                    (SELECT COUNT(*) FROM users WHERE status = 'active') AS active_users,
                    (SELECT COUNT(*) FROM assessments) AS assessments,
                    (SELECT COUNT(*) FROM questions) AS questions,
                    (SELECT COUNT(*) FROM learning_resources) AS resources,
                    (SELECT ROUND(AVG(score), 1) FROM assessment_attempts WHERE status = 'completed') AS avg_score`),
      query(`SELECT to_char(g.day, 'DD Mon') AS label, COUNT(u.id) AS value
               FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') AS g(day)
               LEFT JOIN users u ON u.created_at::date = g.day::date GROUP BY g.day ORDER BY g.day`),
      query(`SELECT to_char(g.day, 'DD Mon') AS label, COUNT(t.id) AS value
               FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') AS g(day)
               LEFT JOIN assessment_attempts t ON t.started_at::date = g.day::date GROUP BY g.day ORDER BY g.day`),
      query(`SELECT al.action, al.entity_type, al.entity_id, al.created_at, u.name
               FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id ORDER BY al.created_at DESC LIMIT 6`),
    ]);
    res.render('admin/dashboard', { title: 'Admin', t: totals.rows[0], regs: bars(regs.rows), attempts: bars(attempts.rows), recent: recent.rows });
  } catch (err) { next(err); }
};

exports.users = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const status = ['active', 'inactive'].includes(req.query.status) ? req.query.status : null;
    const role = ROLES.includes(req.query.role) ? req.query.role : null;
    const page = pageOf(req);
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.status, u.created_at,
              COALESCE((SELECT string_agg(r.name, ', ' ORDER BY r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '') AS roles,
              COUNT(*) OVER() AS total
         FROM users u
        WHERE ($1::text = '' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR u.status = $2)
          AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.name = $3))
        ORDER BY u.id LIMIT $4 OFFSET $5`, [q, status, role, LIMIT, (page - 1) * LIMIT]);
    res.render('admin/users', { title: 'Users', rows, ROLES, filters: { q, status, role }, pagination: pager(page, rows.length ? rows[0].total : 0, { q, status, role }) });
  } catch (err) { next(err); }
};

exports.userDetails = async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const user = id && (await query('SELECT id, name, email, status, career_goal, created_at, last_login_at FROM users WHERE id = $1', [id])).rows[0];
    if (!user) return next();
    const [roles, attempts, skills] = await Promise.all([
      userModel.findById(id),
      query(`SELECT a.title, t.score, t.status, t.started_at FROM assessment_attempts t JOIN assessments a ON a.id = t.assessment_id
              WHERE t.user_id = $1 ORDER BY t.started_at DESC LIMIT 20`, [id]),
      query(`SELECT s.name, us.score FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = $1 ORDER BY us.score DESC`, [id]),
    ]);
    res.render('admin/user-details', { title: user.name, u: user, userRoles: roles.roles, ROLES, attempts: attempts.rows, skills: skills.rows, isSelf: id === actor(req) });
  } catch (err) { next(err); }
};

exports.setStatus = async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const status = req.body.status;
    if (!id || !['active', 'inactive'].includes(status)) return next();
    if (id === actor(req)) { flash(req, 'error', 'You cannot change your own status.'); return res.redirect(`/admin/users/${id}`); }
    const ok = await withTransaction(async (client) => {
      const old = (await client.query('SELECT status FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!old) return false;
      await client.query('UPDATE users SET status = $1 WHERE id = $2', [status, id]);
      await audit.log(client, actor(req), status === 'inactive' ? 'USER_DEACTIVATED' : 'USER_UPDATED', 'user', id, { status: old.status }, { status });
      return true;
    });
    if (!ok) return next();
    flash(req, 'success', 'User status updated.');
    res.redirect(`/admin/users/${id}`);
  } catch (err) { next(err); }
};

exports.setRoles = async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return next();
    const wanted = new Set([].concat(req.body.roles || []).filter((r) => ROLES.includes(r)));
    wanted.add('user'); // every account keeps learner access
    if (id === actor(req)) wanted.add('admin'); // prevents locking yourself out
    const ok = await withTransaction(async (client) => {
      const exists = await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [id]);
      if (!exists.rowCount) return false;
      const before = (await client.query('SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.name', [id])).rows.map((r) => r.name);
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
      await client.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = ANY($2::text[])', [id, Array.from(wanted)]);
      await audit.log(client, actor(req), 'ROLE_CHANGED', 'user', id, { roles: before }, { roles: Array.from(wanted).sort() });
      return true;
    });
    if (!ok) return next();
    flash(req, 'success', 'Roles updated.');
    res.redirect(`/admin/users/${id}`);
  } catch (err) { next(err); }
};

exports.roles = async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT r.name, COUNT(ur.user_id) AS users FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id GROUP BY r.id ORDER BY r.id`);
    res.render('admin/roles', { title: 'Roles', rows });
  } catch (err) { next(err); }
};

exports.categories = async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT c.id, c.name, c.description, COUNT(s.id) AS skills FROM skill_categories c LEFT JOIN skills s ON s.category_id = c.id GROUP BY c.id ORDER BY c.name`);
    res.render('admin/categories', { title: 'Skill Categories', rows });
  } catch (err) { next(err); }
};
exports.saveCategory = async (req, res, next) => {
  try {
    const id = req.params.id ? toId(req.params.id) : null;
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim() || null;
    if (!name || name.length > 100) { flash(req, 'error', 'Category name is required.'); return res.redirect('/admin/categories'); }
    await withTransaction(async (client) => {
      const saved = id
        ? await client.query('UPDATE skill_categories SET name = $1, description = $2 WHERE id = $3 RETURNING id', [name, description, id])
        : await client.query('INSERT INTO skill_categories (name, description) VALUES ($1, $2) RETURNING id', [name, description]);
      await audit.log(client, actor(req), id ? 'CATEGORY_UPDATED' : 'CATEGORY_CREATED', 'skill_category', saved.rows[0] && saved.rows[0].id, null, { name });
    });
    flash(req, 'success', id ? 'Category updated.' : 'Category created.');
    res.redirect('/admin/categories');
  } catch (err) {
    if (err.code === '23505') { flash(req, 'error', 'A category with that name already exists.'); return res.redirect('/admin/categories'); }
    next(err);
  }
};

exports.analytics = async (req, res, next) => {
  try {
    const [totals, tested, weakest, resources, byAssessment, regs] = await Promise.all([
      query(`SELECT (SELECT COUNT(*) FROM users) AS users,
                    (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days') AS new_users,
                    (SELECT COUNT(*) FROM users WHERE last_login_at > NOW() - INTERVAL '30 days') AS active_users,
                    (SELECT COUNT(*) FROM assessment_attempts) AS attempts,
                    (SELECT COUNT(*) FROM assessment_attempts WHERE status = 'completed') AS completed,
                    (SELECT ROUND(AVG(score), 1) FROM assessment_attempts WHERE status = 'completed') AS avg_score,
                    (SELECT COUNT(*) FROM roadmap_items) AS items,
                    (SELECT COUNT(*) FROM roadmap_items WHERE status = 'completed') AS items_done`),
      query(`SELECT s.name AS label, COUNT(*) AS value FROM attempt_answers aa JOIN question_skills qs ON qs.question_id = aa.question_id
               JOIN skills s ON s.id = qs.skill_id GROUP BY s.name ORDER BY value DESC, s.name LIMIT 8`),
      query(`SELECT s.name AS label, ROUND(AVG(us.score), 0) AS value FROM user_skills us JOIN skills s ON s.id = us.skill_id
              GROUP BY s.name ORDER BY value, s.name LIMIT 8`),
      query(`SELECT r.title AS label, COUNT(*) AS value FROM roadmap_items ri JOIN learning_resources r ON r.id = ri.resource_id
              GROUP BY r.id ORDER BY value DESC, r.title LIMIT 6`),
      query(`SELECT a.title AS label, COALESCE(ROUND(AVG(t.score), 0), 0) AS value FROM assessments a
               LEFT JOIN assessment_attempts t ON t.assessment_id = a.id AND t.status = 'completed' GROUP BY a.id ORDER BY a.id`),
      query(`SELECT to_char(g.day, 'DD Mon') AS label, COUNT(u.id) AS value FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') AS g(day)
               LEFT JOIN users u ON u.created_at::date = g.day::date GROUP BY g.day ORDER BY g.day`),
    ]);
    const t = totals.rows[0];
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    res.render('admin/analytics', { title: 'Analytics', t, tested: tested.rows, weakest: weakest.rows, resources: resources.rows,
      byAssessment: byAssessment.rows, regs: regs.rows, attemptRate: pct(t.completed, t.attempts), roadmapRate: pct(t.items_done, t.items) });
  } catch (err) { next(err); }
};

exports.auditLogs = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const action = String(req.query.action || '').slice(0, 60) || null;
    const page = pageOf(req);
    const [logs, actions] = await Promise.all([
      query(`SELECT al.created_at, al.action, al.entity_type, al.entity_id, al.new_data, u.name AS actor, COUNT(*) OVER() AS total
               FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id
              WHERE ($1::text = '' OR u.name ILIKE '%' || $1 || '%' OR al.entity_type ILIKE '%' || $1 || '%' OR al.action ILIKE '%' || $1 || '%')
                AND ($2::text IS NULL OR al.action = $2)
              ORDER BY al.created_at DESC, al.id DESC LIMIT $3 OFFSET $4`, [q, action, LIMIT, (page - 1) * LIMIT]),
      query('SELECT DISTINCT action FROM audit_logs ORDER BY action'),
    ]);
    res.render('admin/audit-logs', { title: 'Audit Logs', rows: logs.rows, actions: actions.rows.map((r) => r.action), filters: { q, action },
      pagination: pager(page, logs.rows.length ? logs.rows[0].total : 0, { q, action }) });
  } catch (err) { next(err); }
};
