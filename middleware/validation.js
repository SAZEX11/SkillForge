
const { body, validationResult } = require('express-validator');
const GOALS = require('../config/goals');

const registerRules = [
  body('name').trim().notEmpty().withMessage('Full name is required.').isLength({ max: 120 }),
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail({ gmail_remove_dots: false }),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('confirm_password')
    .custom((v, { req }) => v === req.body.password)
    .withMessage('Passwords do not match.'),
  body('career_goal').trim().notEmpty().withMessage('Select a career goal.').isLength({ max: 120 }),
];

const loginRules = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail({ gmail_remove_dots: false }),
  body('password').notEmpty().withMessage('Password is required.'),
];

// Re-renders the page with validation messages when a rule fails.
const handle = (view, title) => (req, res, next) => {
  const result = validationResult(req);

  if (result.isEmpty()) return next();

  const { password, confirm_password, ...values } = req.body;

  const pageData = {
    title,
    values,
    errors: result.array().map((e) => e.msg),
  };

  // The registration page requires the career-goal options.
  if (view === 'auth/register') {
    pageData.goals = GOALS;
  }

  return res.status(422).render(view, pageData);
};

module.exports = { registerRules, loginRules, handle };
