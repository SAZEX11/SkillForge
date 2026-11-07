require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const morgan = require('morgan');
const methodOverride = require('method-override');
const { pool } = require('./config/db');
const csrf = require('./middleware/csrf');
const { refreshSession } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const isProd = process.env.NODE_ENV === 'production';
if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set.');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (isProd) app.set('trust proxy', 1);

app.use(helmet());
if (!isProd && process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new pgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

app.use(csrf);
app.use(refreshSession);
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  res.locals.errors = [];
  res.locals.path = req.path;
  delete req.session.flash;
  next();
});

app.get('/', (req, res) => res.render('public/landing', { title: 'SkillForge' }));
app.get('/403', (req, res) => res.status(403).render('errors/403', { title: 'Access denied' }));
app.use(require('./routes/publicRoutes'));
app.use(require('./routes/authRoutes'));
app.use(require('./routes/userRoutes'));
app.use(require('./routes/assessmentRoutes'));
app.use(require('./routes/roadmapRoutes'));
app.use(require('./routes/resourceRoutes'));
app.use(require('./routes/contentRoutes'));
app.use(require('./routes/adminRoutes'));

app.use(notFound);
app.use(errorHandler);

const port = process.env.PORT || 3000;
if (require.main === module) app.listen(port, () => console.log(`SkillForge running at http://localhost:${port}`));
module.exports = app;
