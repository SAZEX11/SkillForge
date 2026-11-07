const { query } = require('../config/db');
exports.dashboard = async (req, res, next) => {
  try {
    const uid = req.session.user.id; // always from the session, never from the URL
    const [stats, skills, recent] = await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*) FROM assessment_attempts WHERE user_id = $1 AND status = 'completed') AS completed,
           (SELECT ROUND(AVG(score), 1) FROM assessment_attempts WHERE user_id = $1 AND status = 'completed') AS avg_score,
           (SELECT ROUND(AVG(score), 1) FROM user_skills WHERE user_id = $1) AS overall,
           (SELECT COUNT(*) FROM user_achievements WHERE user_id = $1) AS achievements,
           (SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND NOT is_read) AS unread`,
        [uid]
      ),
      query(
        `SELECT s.name, us.score FROM user_skills us JOIN skills s ON s.id = us.skill_id
          WHERE us.user_id = $1 ORDER BY us.score DESC`, [uid]
      ),
      query(
        `SELECT a.title, t.score, t.completed_at FROM assessment_attempts t
           JOIN assessments a ON a.id = t.assessment_id
          WHERE t.user_id = $1 AND t.status = 'completed' ORDER BY t.completed_at DESC LIMIT 5`, [uid]
      ),
    ]);
    const hour = new Date().getHours();
    res.render('user/dashboard', {
      title: 'Dashboard', stats: stats.rows[0], skills: skills.rows, recent: recent.rows,
      greeting: hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening',
    });
  } catch (err) { next(err); }
};

const { classify } = require('../services/scoringService');
exports.skillAnalysis = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.name AS category, s.name, s.threshold, us.score, us.previous_score
         FROM user_skills us
         JOIN skills s ON s.id = us.skill_id
         JOIN skill_categories c ON c.id = s.category_id
        WHERE us.user_id = $1 ORDER BY c.name, us.score DESC`, [req.session.user.id]);
    const round = (n) => Math.round(n * 10) / 10;
    const overall = rows.length ? round(rows.reduce((sum, r) => sum + r.score, 0) / rows.length) : null;
    const cats = new Map();
    rows.forEach((r) => {
      if (!cats.has(r.category)) cats.set(r.category, { name: r.category, total: 0, count: 0 });
      const c = cats.get(r.category);
      c.total += r.score; c.count += 1;
    });
    const categories = Array.from(cats.values()).map((c) => ({ name: c.name, score: round(c.total / c.count), count: c.count }));
    const groups = { Strong: 0, Developing: 0, 'Needs Improvement': 0, Weak: 0 };
    rows.forEach((r) => { groups[classify(r.score).label] += 1; });
    const weakest = rows.length ? rows.reduce((a, b) => (a.score <= b.score ? a : b)) : null;
    res.render('user/skill-analysis', { title: 'Skill Analysis', rows, overall, categories, groups, weakest, classify });
  } catch (err) { next(err); }
};

const bcrypt = require('bcrypt');
const GOALS = require('../config/goals');
const notificationModel = require('../models/notificationModel');
const achievementModel = require('../models/achievementModel');
const flash = (req, type, message) => { req.session.flash = { type, message }; };

exports.progress = async (req, res, next) => {
  try {
    const uid = req.session.user.id;
    const [roadmap, week, days, attempts, skills] = await Promise.all([
      query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE ri.status = 'completed') AS done
               FROM roadmap_items ri WHERE ri.roadmap_id = (SELECT id FROM roadmaps WHERE user_id = $1 AND status <> 'archived'
                                                              ORDER BY generated_at DESC LIMIT 1)`, [uid]),
      query(`SELECT to_char(g.day, 'Dy') AS label, COUNT(a.d) AS n
               FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, interval '1 day') AS g(day)
               LEFT JOIN (SELECT completed_at::date AS d FROM assessment_attempts WHERE user_id = $1 AND status = 'completed'
                          UNION ALL SELECT completed_at::date FROM progress WHERE user_id = $1 AND completed_at IS NOT NULL) a
                      ON a.d = g.day::date
              GROUP BY g.day ORDER BY g.day`, [uid]),
      query(`SELECT DISTINCT to_char(d, 'YYYY-MM-DD') AS day FROM (
               SELECT completed_at::date AS d FROM assessment_attempts WHERE user_id = $1 AND status = 'completed'
               UNION SELECT completed_at::date FROM progress WHERE user_id = $1 AND completed_at IS NOT NULL) x
              ORDER BY day DESC`, [uid]),
      query(`SELECT a.title, t.score, t.completed_at FROM assessment_attempts t JOIN assessments a ON a.id = t.assessment_id
              WHERE t.user_id = $1 AND t.status = 'completed' ORDER BY t.completed_at`, [uid]),
      query(`SELECT s.name, us.score, us.previous_score FROM user_skills us JOIN skills s ON s.id = us.skill_id
              WHERE us.user_id = $1 AND us.previous_score IS NOT NULL ORDER BY us.score - us.previous_score DESC`, [uid]),
    ]);
    // Streak = consecutive active days ending today (or yesterday).
    const active = new Set(days.rows.map((r) => r.day));
    const fmt = (d) => d.toISOString().slice(0, 10);
    const cursor = new Date();
    if (!active.has(fmt(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (active.has(fmt(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
    const { total, done } = roadmap.rows[0];
    res.render('user/progress', {
      title: 'Progress', total, done, percent: total ? Math.round((done / total) * 100) : 0,
      week: week.rows, maxWeek: Math.max(1, ...week.rows.map((r) => r.n)), streak, attempts: attempts.rows, skills: skills.rows,
    });
  } catch (err) { next(err); }
};

exports.achievements = async (req, res, next) => {
  try {
    const list = await achievementModel.listForUser(req.session.user.id);
    res.render('user/achievements', { title: 'Achievements', list, earned: list.filter((a) => a.earned_at).length });
  } catch (err) { next(err); }
};

exports.notifications = async (req, res, next) => {
  try { res.render('user/notifications', { title: 'Notifications', items: await notificationModel.list(req.session.user.id) }); }
  catch (err) { next(err); }
};
exports.markRead = async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return next();
    if (!(await notificationModel.markRead(parseInt(req.params.id, 10), req.session.user.id))) return next();
    res.redirect('/notifications');
  } catch (err) { next(err); }
};
exports.readAll = async (req, res, next) => {
  try { await notificationModel.markAllRead(req.session.user.id); flash(req, 'success', 'All notifications marked as read.'); res.redirect('/notifications'); }
  catch (err) { next(err); }
};

exports.profile = async (req, res, next) => {
  try {
    const { rows } = await query('SELECT name, email, career_goal, bio, created_at FROM users WHERE id = $1', [req.session.user.id]);
    res.render('user/profile', { title: 'Profile', profile: rows[0], goals: GOALS });
  } catch (err) { next(err); }
};
exports.updateProfile = async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const goal = String(req.body.career_goal || '');
    const bio = String(req.body.bio || '').trim().slice(0, 500);
    if (!name || name.length > 120 || !GOALS.includes(goal)) {
      flash(req, 'error', 'Enter your name and choose a valid career goal.');
      return res.redirect('/profile');
    }
    await query('UPDATE users SET name = $1, career_goal = $2, bio = $3 WHERE id = $4', [name, goal, bio || null, req.session.user.id]);
    req.session.user.name = name;
    flash(req, 'success', 'Profile updated successfully.');
    res.redirect('/profile');
  } catch (err) { next(err); }
};

exports.settings = async (req, res, next) => {
  try {
    const { rows } = await query('SELECT email_notifications FROM users WHERE id = $1', [req.session.user.id]);
    res.render('user/settings', { title: 'Settings', emailNotifications: rows[0].email_notifications });
  } catch (err) { next(err); }
};
exports.updateSettings = async (req, res, next) => {
  try {
    await query('UPDATE users SET email_notifications = $1 WHERE id = $2', [req.body.email_notifications === 'on', req.session.user.id]);
    flash(req, 'success', 'Settings saved.');
    res.redirect('/settings');
  } catch (err) { next(err); }
};
exports.changePassword = async (req, res, next) => {
  try {
    const { current_password: current, new_password: next1, confirm_password: confirm } = req.body;
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.session.user.id]);
    if (!current || !(await bcrypt.compare(current, rows[0].password_hash))) flash(req, 'error', 'Your current password is incorrect.');
    else if (!next1 || next1.length < 8) flash(req, 'error', 'New password must be at least 8 characters.');
    else if (next1 !== confirm) flash(req, 'error', 'New passwords do not match.');
    else {
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(next1, 12), req.session.user.id]);
      flash(req, 'success', 'Password changed successfully.');
    }
    res.redirect('/settings');
  } catch (err) { next(err); }
};
