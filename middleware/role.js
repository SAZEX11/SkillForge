function requireRole(...allowed) {
  return (req, res, next) => {
    const roles = (req.session.user && req.session.user.roles) || [];
    if (allowed.some((r) => roles.includes(r))) return next();
    return res.status(403).render('errors/403', { title: 'Access denied' });
  };
}
module.exports = { requireRole };
