const roadmapModel = require('../models/roadmapModel');
const roadmapService = require('../services/roadmapService');

exports.show = async (req, res, next) => {
  try {
    const roadmap = await roadmapModel.getCurrent(req.session.user.id);
    let steps = [];
    let percent = 0;
    if (roadmap) {
      const items = await roadmapModel.getItems(roadmap.id);
      const byPriority = new Map();
      items.forEach((it) => {
        if (!byPriority.has(it.priority)) {
          byPriority.set(it.priority, { priority: it.priority, skill: it.skill, description: it.skill_description,
            gap: it.skill_gap, due_date: it.due_date, items: [] });
        }
        byPriority.get(it.priority).items.push(it);
      });
      steps = Array.from(byPriority.values());
      steps.forEach((s) => {
        s.done = s.items.filter((i) => i.status === 'completed').length;
        s.complete = s.done === s.items.length;
      });
      const current = steps.find((s) => !s.complete);
      steps.forEach((s) => { s.state = s.complete ? 'completed' : s === current ? 'current' : 'pending'; });
      percent = items.length ? Math.round((items.filter((i) => i.status === 'completed').length / items.length) * 100) : 0;
    }
    res.render('user/roadmap', { title: 'Roadmap', roadmap, steps, percent });
  } catch (err) { next(err); }
};

exports.generate = async (req, res, next) => {
  try {
    const result = await roadmapService.generate(req.session.user.id);
    const messages = {
      ok: ['success', 'Roadmap generated successfully.'],
      no_scores: ['info', 'Complete an assessment first so we can measure your skills.'],
      all_good: ['success', 'All your skills meet their targets. Nothing to improve right now!'],
    };
    const [type, message] = messages[result.status];
    req.session.flash = { type, message };
    res.redirect(result.status === 'no_scores' ? '/assessments' : '/roadmap');
  } catch (err) { next(err); }
};

exports.completeItem = async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return next();
    const ok = await roadmapService.completeItem(parseInt(req.params.id, 10), req.session.user.id);
    if (!ok) return next();
    req.session.flash = { type: 'success', message: 'Roadmap item completed.' };
    res.redirect('/roadmap');
  } catch (err) { next(err); }
};
