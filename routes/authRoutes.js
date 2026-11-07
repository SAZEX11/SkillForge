const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const auth = require('../controllers/authController');
const v = require('../middleware/validation');
const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const forgotRules = [body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail({ gmail_remove_dots: false })];

router.get('/login', auth.showLogin);
router.post('/login', limiter, v.loginRules, v.handle('auth/login', 'Log in'), auth.login);
router.get('/register', auth.showRegister);
router.post('/register', limiter, v.registerRules, v.handle('auth/register', 'Create account'), auth.register);
router.post('/logout', auth.logout);
router.get('/forgot-password', auth.showForgot);
router.post('/forgot-password', limiter, forgotRules, v.handle('auth/forgot-password', 'Forgot password'), auth.forgot);
router.get('/reset-password/:token', auth.showReset);
router.post('/reset-password/:token', limiter, auth.reset);
module.exports = router;
