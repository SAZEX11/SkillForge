const { withTransaction } = require('../config/db');
const achievements = require('./achievementService');
const notifications = require('./notificationService');

// Which skills matter for each career goal. Unknown goals use every skill.
const GOAL_SKILLS = {
  'Full Stack Developer': null,
  'Backend Developer': ['JavaScript', 'Node.js', 'Express.js', 'REST APIs', 'Authentication', 'SQL', 'PostgreSQL', 'Git'],
  'Frontend Developer': ['JavaScript', 'HTML', 'CSS', 'DOM Manipulation', 'Git'],
  'Software Engineer': ['JavaScript', 'Data Structures', 'Problem Solving', 'SQL', 'Git'],
  'Data Engineer': ['SQL', 'PostgreSQL', 'Data Structures', 'Problem Solving', 'Git'],
};
const MAX_STEPS = 7;
const levelFor = (score) => (score < 50 ? 1 : score < 75 ? 2 : 3); // beginner / intermediate / advanced

// Returns { status: 'ok' | 'no_scores' | 'all_good', steps? }
function generate(userId) {
  return withTransaction(async (client) => {
    const user = (await client.query('SELECT career_goal FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
    const all = (await client.query(
      `SELECT us.skill_id, us.score, s.name, s.threshold
         FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = $1`, [userId])).rows;
    if (!all.length) return { status: 'no_scores' };

    // Gap = threshold - score; only skills below their threshold qualify.
    let weak = all.filter((s) => s.score < s.threshold).map((s) => ({ ...s, gap: s.threshold - s.score }));
    const relevant = GOAL_SKILLS[user.career_goal];
    if (relevant) {
      const focused = weak.filter((s) => relevant.includes(s.name));
      if (focused.length) weak = focused;
    }
    if (!weak.length) return { status: 'all_good' };
    weak.sort((a, b) => b.gap - a.gap);
    weak = weak.slice(0, MAX_STEPS);

    await client.query(`UPDATE roadmaps SET status = 'archived' WHERE user_id = $1 AND status = 'active'`, [userId]);
    const roadmapId = (await client.query(
      'INSERT INTO roadmaps (user_id, career_goal) VALUES ($1, $2) RETURNING id', [userId, user.career_goal])).rows[0].id;

    for (let i = 0; i < weak.length; i += 1) {
      const skill = weak[i];
      const priority = i + 1; // 1 = biggest gap
      // Resources closest to the learner's current level come first.
      const resources = (await client.query(
        `SELECT id FROM learning_resources WHERE skill_id = $1 AND status = 'active'
          ORDER BY ABS(CASE difficulty WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 ELSE 3 END - $2), id
          LIMIT 2`, [skill.skill_id, levelFor(skill.score)])).rows;
      const ids = resources.length ? resources.map((r) => r.id) : [null];
      
for (const resourceId of ids) {
  
  await client.query(
  `INSERT INTO roadmap_items (roadmap_id, skill_id, resource_id, priority, skill_gap, due_date)
   VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + ($6::integer * 7))`,
  [roadmapId, skill.skill_id, resourceId, priority, skill.gap, priority]
);

}

    }

    await notifications.create(client, userId, 'New roadmap generated',
      `Your personalized roadmap has ${weak.length} steps.`, '/roadmap');
    for (const name of await achievements.award(client, userId, ['roadmap_starter'])) {
      await notifications.create(client, userId, 'You earned a new achievement', `You unlocked "${name}".`, '/achievements');
    }
    return { status: 'ok', steps: weak.length };
  });
}

// Returns false when the item does not exist or belongs to someone else.
function completeItem(itemId, userId) {
  return withTransaction(async (client) => {
    const found = await client.query(
      `SELECT ri.id, ri.roadmap_id FROM roadmap_items ri
         JOIN roadmaps r ON r.id = ri.roadmap_id
        WHERE ri.id = $1 AND r.user_id = $2 FOR UPDATE OF ri`, [itemId, userId]);
    if (!found.rows[0]) return false;
    const roadmapId = found.rows[0].roadmap_id;

    await client.query(`UPDATE roadmap_items SET status = 'completed' WHERE id = $1`, [itemId]);
    await client.query(
      `INSERT INTO progress (user_id, roadmap_item_id, progress_percent, completed_at)
       VALUES ($1, $2, 100, NOW())
       ON CONFLICT (user_id, roadmap_item_id)
       DO UPDATE SET progress_percent = 100, completed_at = NOW(), updated_at = NOW()`, [userId, itemId]);

    const done = (await client.query(
      `SELECT COUNT(*) AS n FROM roadmap_items ri JOIN roadmaps r ON r.id = ri.roadmap_id
        WHERE r.user_id = $1 AND ri.status = 'completed'`, [userId])).rows[0].n;
    const remaining = (await client.query(
      `SELECT COUNT(*) AS n FROM roadmap_items WHERE roadmap_id = $1 AND status <> 'completed'`, [roadmapId])).rows[0].n;

    const keys = [];
    if (done >= 5) keys.push('learning_explorer');
    if (remaining === 0) {
      await client.query(`UPDATE roadmaps SET status = 'completed' WHERE id = $1 AND status = 'active'`, [roadmapId]);
      keys.push('roadmap_finisher');
    }
    for (const name of await achievements.award(client, userId, keys)) {
      await notifications.create(client, userId, 'You earned a new achievement', `You unlocked "${name}".`, '/achievements');
    }
    return true;
  });
}

module.exports = { generate, completeItem };
