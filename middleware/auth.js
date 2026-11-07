const userModel = require('../models/userModel');

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  req.session.flash = { type: 'info', message: 'Please log in to continue.' };
  return res.redirect('/login');
}

// Re-reads status and roles on every request so deactivation and role changes apply immediately.
async function refreshSession(req, res, next) {
  const current = req.session.user;
  if (!current) return next();
  try {
    const fresh = await userModel.findById(current.id);
    if (!fresh || fresh.status !== 'active') {
      return req.session.destroy(() => { res.clearCookie('connect.sid'); res.redirect('/login'); });
    }
    current.roles = fresh.roles;
    current.name = fresh.name;
    return next();
  } catch (err) { return next(err); }
}

module.exports = { requireAuth, refreshSession };
