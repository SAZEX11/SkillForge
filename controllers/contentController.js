const { query, withTransaction } = require('../config/db');
const questionModel = require('../models/questionModel');
const skillModel = require('../models/skillModel');
const audit = require('../models/auditModel');

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const TYPES = ['Article', 'Video', 'Documentation', 'Tutorial', 'Practice', 'Project'];
const LIMIT = 10;
const toId = (v) => (/^\d+$/.test(String(v)) ? parseInt(v, 10) : null);
const arr = (v) => [].concat(v === undefined ? [] : v);
const flash = (req, type, message) => { req.session.flash = { type, message }; };
const actor = (req) => req.session.user.id;
const pager = (page, total, params) => {
  const base = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) base.set(k, v); });
  return { page, pages: Math.ceil(total / LIMIT), total, base: base.toString() };
};
const pageOf = (req) => Math.max(1, parseInt(req.query.page, 10) || 1);

// ---------- dashboard ----------
exports.dashboard = async (req, res, next) => {
  try {
    const [counts, recent, stats] = await Promise.all([
      query(`SELECT (SELECT COUNT(*) FROM questions WHERE status = 'active') AS questions,
                    (SELECT COUNT(*) FROM assessments WHERE status = 'published') AS published,
                    (SELECT COUNT(*) FROM assessments WHERE status = 'draft') AS drafts,
                    (SELECT COUNT(*) FROM skills) AS skills,
                    (SELECT COUNT(*) FROM learning_resources WHERE status = 'active') AS resources`),
      query(`SELECT al.action, al.entity_type, al.entity_id, al.created_at, u.name
               FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id ORDER BY al.created_at DESC LIMIT 8`),
      query(`SELECT a.title, COUNT(t.id) AS attempts, ROUND(AVG(t.score), 1) AS avg_score
               FROM assessments a LEFT JOIN assessment_attempts t ON t.assessment_id = a.id AND t.status = 'completed'
              GROUP BY a.id ORDER BY a.id`),
    ]);
    res.render('content/dashboard', { title: 'Content', counts: counts.rows[0], recent: recent.rows, stats: stats.rows });
  } catch (err) { next(err); }
};

// ---------- skills ----------
exports.skills = async (req, res, next) => {
  try {
    const [skills, categories] = await Promise.all([skillModel.all(), skillModel.categories()]);
    res.render('content/skills', { title: 'Skills', skills, categories });
  } catch (err) { next(err); }
};
exports.saveSkill = async (req, res, next) => {
  try {
    const id = req.params.id ? toId(req.params.id) : null;
    const name = String(req.body.name || '').trim();
    const categoryId = toId(req.body.category_id);
    const threshold = parseInt(req.body.threshold, 10);
    if (!name || !categoryId || !(threshold >= 0 && threshold <= 100)) {
      flash(req, 'error', 'Skill name, category and a threshold between 0 and 100 are required.');
      return res.redirect('/content/skills');
    }
    await withTransaction(async (client) => {
      if (id) await client.query('UPDATE skills SET name = $1, category_id = $2, threshold = $3 WHERE id = $4', [name, categoryId, threshold, id]);
      else {
        const r = await client.query('INSERT INTO skills (name, category_id, description, threshold) VALUES ($1, $2, $3, $4) RETURNING id',
          [name, categoryId, String(req.body.description || '').trim() || null, threshold]);
        req.newId = r.rows[0].id;
      }
      await audit.log(client, actor(req), id ? 'SKILL_UPDATED' : 'SKILL_CREATED', 'skill', id || req.newId, null, { name, threshold });
    });
    flash(req, 'success', id ? 'Skill updated.' : 'Skill created.');
    res.redirect('/content/skills');
  } catch (err) {
    if (err.code === '23505') { flash(req, 'error', 'A skill with that name already exists.'); return res.redirect('/content/skills'); }
    next(err);
  }
};

// ---------- questions ----------
exports.questions = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const skill = toId(req.query.skill);
    const difficulty = DIFFICULTIES.includes(req.query.difficulty) ? req.query.difficulty : null;
    const status = ['active', 'inactive'].includes(req.query.status) ? req.query.status : null;
    const page = pageOf(req);
    const result = await questionModel.list({ q, skillId: skill, difficulty, status, limit: LIMIT, offset: (page - 1) * LIMIT });
    res.render('content/questions', {
      title: 'Questions', rows: result.rows, skills: await skillModel.simple(), DIFFICULTIES,
      filters: { q, skill, difficulty, status }, pagination: pager(page, result.total, { q, skill, difficulty, status }),
    });
  } catch (err) { next(err); }
};
const pad = (options) => { const rows = options.slice(); while (rows.length < 4) rows.push({ id: null, option_text: '', is_correct: false }); return rows; };
exports.newQuestion = async (req, res, next) => {
  try {
    res.render('content/question-form', { title: 'New question', q: { id: null, text: '', difficulty: 'beginner', explanation: '', options: pad([]), skill_ids: [] },
      skills: await skillModel.simple(), DIFFICULTIES });
  } catch (err) { next(err); }
};
exports.editQuestion = async (req, res, next) => {
  try {
    const q = toId(req.params.id) && await questionModel.find(toId(req.params.id));
    if (!q) return next();
    q.options = pad(q.options);
    res.render('content/question-form', { title: 'Edit question', q, skills: await skillModel.simple(), DIFFICULTIES });
  } catch (err) { next(err); }
};
exports.saveQuestion = async (req, res, next) => {
  try {
    const id = req.params.id ? toId(req.params.id) : null;
    if (req.params.id && !id) return next();
    const texts = arr(req.body.option_text);
    const ids = arr(req.body.option_id);
    const correct = parseInt(req.body.correct, 10);
    const rows = texts.map((t, i) => ({ id: toId(ids[i]), option_text: String(t).trim(), is_correct: i === correct }));
    const options = rows.filter((o) => o.option_text).map((o) => ({ id: o.id, text: o.option_text, correct: o.is_correct }));
    const data = {
      text: String(req.body.text || '').trim(), difficulty: req.body.difficulty, explanation: String(req.body.explanation || '').trim() || null,
      skillIds: arr(req.body.skill_ids).map(toId).filter(Boolean), options,
    };
    const errors = [];
    if (!data.text) errors.push('Question text is required.');
    if (!DIFFICULTIES.includes(data.difficulty)) errors.push('Choose a difficulty.');
    if (options.length < 2) errors.push('Provide at least two answer options.');
    if (!options.some((o) => o.correct)) errors.push('Mark one filled-in option as the correct answer.');
    if (!data.skillIds.length) errors.push('Assign at least one skill.');
    if (errors.length) {
      return res.status(422).render('content/question-form', {
        title: id ? 'Edit question' : 'New question', errors, skills: await skillModel.simple(), DIFFICULTIES,
        q: { id, text: data.text, difficulty: data.difficulty, explanation: data.explanation || '', options: pad(rows), skill_ids: data.skillIds },
      });
    }
    if (id && !(await questionModel.find(id))) return next();
    await withTransaction((client) => questionModel.save(client, id, data, actor(req)));
    flash(req, 'success', id ? 'Question updated.' : 'Question created.');
    res.redirect('/content/questions');
  } catch (err) { next(err); }
};
exports.toggleQuestion = async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const row = id && (await query(`UPDATE questions SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END
                                     WHERE id = $1 RETURNING status`, [id])).rows[0];
    if (!row) return next();
    await audit.log(null, actor(req), 'QUESTION_UPDATED', 'question', id, null, { status: row.status });
    flash(req, 'success', `Question is now ${row.status}.`);
    res.redirect('/content/questions');
  } catch (err) { next(err); }
};

// ---------- assessments ----------
exports.assessments = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const { rows } = await query(
      `SELECT a.id, a.title, a.time_limit, a.status, (SELECT COUNT(*) FROM assessment_questions WHERE assessment_id = a.id) AS questions
         FROM assessments a WHERE $1::text = '' OR a.title ILIKE '%' || $1 || '%' ORDER BY a.id`, [q]);
    res.render('content/assessments', { title: 'Assessments', rows, q });
  } catch (err) { next(err); }
};
const loadAssessment = async (id) => {
  const a = (await query('SELECT id, title, description, time_limit, status FROM assessments WHERE id = $1', [id])).rows[0];
  if (!a) return null;
  const [items, available] = await Promise.all([
    query(`SELECT aq.question_id, aq.question_order, aq.marks, q.text, q.difficulty FROM assessment_questions aq
             JOIN questions q ON q.id = aq.question_id WHERE aq.assessment_id = $1 ORDER BY aq.question_order`, [id]),
    query(`SELECT id, text FROM questions WHERE status = 'active'
              AND id NOT IN (SELECT question_id FROM assessment_questions WHERE assessment_id = $1) ORDER BY id DESC LIMIT 300`, [id]),
  ]);
  return { a, items: items.rows, available: available.rows };
};
exports.newAssessment = (req, res) => res.render('content/assessment-form', {
  title: 'New assessment', a: { id: null, title: '', description: '', time_limit: 30, status: 'draft' }, items: [], available: [] });
exports.editAssessment = async (req, res, next) => {
  try {
    const data = toId(req.params.id) && await loadAssessment(toId(req.params.id));
    if (!data) return next();
    res.render('content/assessment-form', { title: 'Edit assessment', ...data });
  } catch (err) { next(err); }
};
exports.saveAssessment = async (req, res, next) => {
  try {
    const id = req.params.id ? toId(req.params.id) : null;
    if (req.params.id && !id) return next();
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim() || null;
    const timeLimit = parseInt(req.body.time_limit, 10);
    if (!title || !(timeLimit >= 1 && timeLimit <= 300)) {
      flash(req, 'error', 'A title and a time limit between 1 and 300 minutes are required.');
      return res.redirect(id ? `/content/assessments/${id}/edit` : '/content/assessments/new');
    }
    const savedId = await withTransaction(async (client) => {
      let aid = id;
      if (id) {
        const r = await client.query('UPDATE assessments SET title = $1, description = $2, time_limit = $3 WHERE id = $4 RETURNING id', [title, description, timeLimit, id]);
        if (!r.rowCount) return null;
      } else {
        aid = (await client.query('INSERT INTO assessments (title, description, time_limit, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
          [title, description, timeLimit, actor(req)])).rows[0].id;
      }
      await audit.log(client, actor(req), id ? 'ASSESSMENT_UPDATED' : 'ASSESSMENT_CREATED', 'assessment', aid, null, { title, time_limit: timeLimit });
      return aid;
    });
    if (!savedId) return next();
    flash(req, 'success', id ? 'Assessment updated.' : 'Assessment created. Now add questions.');
    res.redirect(`/content/assessments/${savedId}/edit`);
  } catch (err) { next(err); }
};
exports.setAssessmentStatus = async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const status = req.body.status;
    if (!id || !['draft', 'published', 'archived'].includes(status)) return next();
    const count = (await query('SELECT COUNT(*) AS n FROM assessment_questions WHERE assessment_id = $1', [id])).rows[0].n;
    if (status === 'published' && count === 0) {
      flash(req, 'error', 'Add at least one question before publishing.');
      return res.redirect(`/content/assessments/${id}/edit`);
    }
    const ok = await withTransaction(async (client) => {
      const r = await client.query('UPDATE assessments SET status = $1 WHERE id = $2 RETURNING id', [status, id]);
      if (r.rowCount) await audit.log(client, actor(req), 'ASSESSMENT_UPDATED', 'assessment', id, null, { status });
      return r.rowCount;
    });
    if (!ok) return next();
    flash(req, 'success', `Assessment is now ${status}.`);
    res.redirect(`/content/assessments/${id}/edit`);
  } catch (err) { next(err); }
};
// Rewrites question_order as 1..n; safe because the unique constraint is deferred.
const renumber = async (client, aid, orderedIds) => {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await client.query('UPDATE assessment_questions SET question_order = $3 WHERE assessment_id = $1 AND question_id = $2', [aid, orderedIds[i], i + 1]);
  }
};
exports.assessmentQuestion = async (req, res, next) => {
  try {
    const aid = toId(req.params.id);
    const qid = toId(req.params.qid || req.body.question_id);
    const action = req.params.action || 'add';
    if (!aid || !qid) return next();
    const ok = await withTransaction(async (client) => {
      if (!(await client.query('SELECT 1 FROM assessments WHERE id = $1 FOR UPDATE', [aid])).rowCount) return false;
      const ids = (await client.query('SELECT question_id FROM assessment_questions WHERE assessment_id = $1 ORDER BY question_order', [aid])).rows.map((r) => r.question_id);
      if (action === 'add') {
        const marks = Math.max(0.5, parseFloat(req.body.marks) || 1);
        if (!(await client.query(`SELECT 1 FROM questions WHERE id = $1 AND status = 'active'`, [qid])).rowCount || ids.includes(qid)) return true;
        await client.query('INSERT INTO assessment_questions (assessment_id, question_id, question_order, marks) VALUES ($1, $2, $3, $4)', [aid, qid, ids.length + 1, marks]);
      } else if (action === 'remove') {
        await client.query('DELETE FROM assessment_questions WHERE assessment_id = $1 AND question_id = $2', [aid, qid]);
        await renumber(client, aid, ids.filter((x) => x !== qid));
      } else if (action === 'up' || action === 'down') {
        const i = ids.indexOf(qid);
        const j = action === 'up' ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= ids.length) return true;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await renumber(client, aid, ids);
      } else if (action === 'marks') {
        await client.query('UPDATE assessment_questions SET marks = $3 WHERE assessment_id = $1 AND question_id = $2', [aid, qid, Math.max(0.5, parseFloat(req.body.marks) || 1)]);
      } else return false;
      await audit.log(client, actor(req), 'ASSESSMENT_UPDATED', 'assessment', aid, null, { question_id: qid, action });
      return true;
    });
    if (!ok) return next();
    res.redirect(`/content/assessments/${aid}/edit`);
  } catch (err) { next(err); }
};

// ---------- resources ----------
const resourceForm = async (res, title, r, errors) => res.status(errors ? 422 : 200).render('content/resource-form', {
  title, r, errors, skills: await skillModel.simple(), TYPES, DIFFICULTIES });
exports.resources = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const skill = toId(req.query.skill);
    const page = pageOf(req);
    const { rows } = await query(
      `SELECT r.id, r.title, r.resource_type, r.difficulty, r.status, s.name AS skill, COUNT(*) OVER() AS total
         FROM learning_resources r JOIN skills s ON s.id = r.skill_id
        WHERE ($1::text = '' OR r.title ILIKE '%' || $1 || '%') AND ($2::int IS NULL OR r.skill_id = $2)
        ORDER BY r.id DESC LIMIT $3 OFFSET $4`, [q, skill, LIMIT, (page - 1) * LIMIT]);
    res.render('content/resources', { title: 'Resources', rows, skills: await skillModel.simple(), filters: { q, skill },
      pagination: pager(page, rows.length ? rows[0].total : 0, { q, skill }) });
  } catch (err) { next(err); }
};
exports.newResource = (req, res, next) => resourceForm(res, 'New resource',
  { id: null, skill_id: '', title: '', description: '', resource_type: 'Article', url: '', difficulty: 'beginner' }).catch(next);
exports.editResource = async (req, res, next) => {
  try {
    const r = toId(req.params.id) && (await query('SELECT * FROM learning_resources WHERE id = $1', [toId(req.params.id)])).rows[0];
    if (!r) return next();
    await resourceForm(res, 'Edit resource', r);
  } catch (err) { next(err); }
};
exports.saveResource = async (req, res, next) => {
  try {
    const id = req.params.id ? toId(req.params.id) : null;
    if (req.params.id && !id) return next();
    const r = { id, skill_id: toId(req.body.skill_id), title: String(req.body.title || '').trim(), description: String(req.body.description || '').trim(),
      resource_type: req.body.resource_type, url: String(req.body.url || '').trim(), difficulty: req.body.difficulty };
    const errors = [];
    if (!r.title) errors.push('Title is required.');
    if (!r.skill_id) errors.push('Choose a skill.');
    if (!TYPES.includes(r.resource_type)) errors.push('Choose a resource type.');
    if (!DIFFICULTIES.includes(r.difficulty)) errors.push('Choose a difficulty.');
    if (!/^https?:\/\/\S+$/i.test(r.url)) errors.push('Enter a valid http(s) URL.');
    if (errors.length) return resourceForm(res, id ? 'Edit resource' : 'New resource', r, errors);
    const savedId = await withTransaction(async (client) => {
      let rid = id;
      if (id) {
        const u = await client.query(`UPDATE learning_resources SET skill_id = $1, title = $2, description = $3, resource_type = $4, url = $5, difficulty = $6
                                       WHERE id = $7 RETURNING id`, [r.skill_id, r.title, r.description, r.resource_type, r.url, r.difficulty, id]);
        if (!u.rowCount) return null;
      } else {
        rid = (await client.query(`INSERT INTO learning_resources (skill_id, title, description, resource_type, url, difficulty)
                                    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [r.skill_id, r.title, r.description, r.resource_type, r.url, r.difficulty])).rows[0].id;
      }
      await audit.log(client, actor(req), id ? 'RESOURCE_UPDATED' : 'RESOURCE_CREATED', 'resource', rid, null, { title: r.title, resource_type: r.resource_type });
      return rid;
    });
    if (!savedId) return next();
    flash(req, 'success', id ? 'Resource updated.' : 'Resource added successfully.');
    res.redirect('/content/resources');
  } catch (err) { next(err); }
};
exports.toggleResource = async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const row = id && (await query(`UPDATE learning_resources SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END
                                     WHERE id = $1 RETURNING status`, [id])).rows[0];
    if (!row) return next();
    await audit.log(null, actor(req), 'RESOURCE_UPDATED', 'resource', id, null, { status: row.status });
    flash(req, 'success', `Resource is now ${row.status}.`);
    res.redirect('/content/resources');
  } catch (err) { next(err); }
};
