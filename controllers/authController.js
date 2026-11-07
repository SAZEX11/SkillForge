const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');
const GOALS = require('../config/goals');

exports.showLogin = (req, res) => res.render('auth/login', { title: 'Log in', values: {} });
exports.showRegister = (req, res) => res.render('auth/register', { title: 'Create account', values: {}, goals: GOALS });

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, career_goal } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    await userModel.create({ name, email, passwordHash, careerGoal: career_goal });
    req.session.flash = { type: 'success', message: 'Account created. Please log in.' };
    res.redirect('/login');
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).render('auth/register', {
        title: 'Create account', goals: GOALS, values: { name: req.body.name, email: req.body.email, career_goal: req.body.career_goal },
        errors: ['An account with that email already exists.'],
      });
    }
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findByEmail(email);
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid || user.status !== 'active') {
      return res.status(401).render('auth/login', {
        title: 'Log in', values: { email },
        errors: [valid ? 'This account is deactivated.' : 'Invalid email or password.'],
      });
    }
    await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
    req.session.user = { id: user.id, name: user.name, email: user.email, roles: user.roles };
    await userModel.touchLogin(user.id);
    const destination = user.roles.includes('admin')
      ? '/admin'
      : user.roles.includes('content_manager')
        ? '/content'
        : '/dashboard';
    req.session.save((err) => {
      if (err) return next(err);
      res.redirect(destination);
    });
  } catch (err) {
    next(err);
  }
};

exports.logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
};

const resetService = require('../services/passwordResetService');

exports.showForgot = (req, res) => res.render('auth/forgot-password', { title: 'Forgot password', values: {} });

exports.forgot = async (req, res, next) => {
  try {
    const token = await resetService.createForEmail(req.body.email);
    // No mail server is configured. In development the link is printed to the server console.
    if (token && process.env.NODE_ENV !== 'production') {
      console.log(`[dev] Password reset link: ${req.protocol}://${req.get('host')}/reset-password/${token}`);
    }
    req.session.flash = { type: 'success', message: 'If that email is registered, a password reset link has been generated.' };
    res.redirect('/login');
  } catch (err) { next(err); }
};

exports.showReset = async (req, res, next) => {
  try {
    if (!(await resetService.isValid(req.params.token))) {
      req.session.flash = { type: 'error', message: 'That reset link is invalid or has expired.' };
      return res.redirect('/forgot-password');
    }
    res.render('auth/reset-password', { title: 'Reset password', token: req.params.token });
  } catch (err) { next(err); }
};

exports.reset = async (req, res, next) => {
  try {
    const { password, confirm_password: confirm } = req.body;
    const errors = [];
    if (!password || password.length < 8) errors.push('Password must be at least 8 characters.');
    if (password !== confirm) errors.push('Passwords do not match.');
    if (errors.length) return res.status(422).render('auth/reset-password', { title: 'Reset password', token: req.params.token, errors });
    const ok = await resetService.consume(req.params.token, await bcrypt.hash(password, 12));
    req.session.flash = ok
      ? { type: 'success', message: 'Password updated. Please log in.' }
      : { type: 'error', message: 'That reset link is invalid or has expired.' };
    res.redirect(ok ? '/login' : '/forgot-password');
  } catch (err) { next(err); }
};
