const crypto = require('crypto');
module.exports = function csrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = Buffer.from(String((req.body && req.body._csrf) || ''));
  const real = Buffer.from(req.session.csrfToken);
  if (sent.length !== real.length || !crypto.timingSafeEqual(sent, real)) {
    const err = new Error('Invalid CSRF token');
    err.status = 403;
    return next(err);
  }
  next();
};
