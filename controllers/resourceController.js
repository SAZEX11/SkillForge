const model = require('../models/resourceModel');
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const TYPES = ['Article', 'Video', 'Documentation', 'Tutorial', 'Practice', 'Project'];
const LIMIT = 9;

exports.list = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const skill = /^\d+$/.test(String(req.query.skill || '')) ? parseInt(req.query.skill, 10) : null;
    const difficulty = DIFFICULTIES.includes(req.query.difficulty) ? req.query.difficulty : null;
    const type = TYPES.includes(req.query.type) ? req.query.type : null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const [result, skills] = await Promise.all([
      model.search({ q, skillId: skill, difficulty, type, limit: LIMIT, offset: (page - 1) * LIMIT }),
      model.skills(),
    ]);
    const base = new URLSearchParams();
    if (q) base.set('q', q);
    if (skill) base.set('skill', skill);
    if (difficulty) base.set('difficulty', difficulty);
    if (type) base.set('type', type);
    res.render('user/resources', {
      title: 'Resources', resources: result.rows, skills, DIFFICULTIES, TYPES,
      filters: { q, skill, difficulty, type },
      pagination: { page, pages: Math.ceil(result.total / LIMIT), total: result.total, base: base.toString() },
    });
  } catch (err) { next(err); }
};

exports.detail = async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return next();
    const resource = await model.find(parseInt(req.params.id, 10));
    if (!resource) return next();
    res.render('user/resource-details', { title: resource.title, resource, related: await model.related(resource.skill_id, resource.id) });
  } catch (err) { next(err); }
};
