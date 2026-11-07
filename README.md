# SkillForge

**Assess. Understand. Improve.**
An intelligent skill assessment and personalized learning platform built with Node.js, Express, PostgreSQL and server-rendered EJS.

## Features

- **Learners:** register, log in, edit profile and career goal, take timed assessments, see scores and skill breakdowns, generate a personalized roadmap, browse resources, track progress and streaks, earn achievements, read notifications.
- **Content managers:** manage skills, questions (with options and skill mapping), assessments (add, remove, reorder, set marks, publish), and learning resources. Content dashboard with statistics.
- **Admins:** everything above plus user management (search, filter, activate/deactivate, change roles), skill categories, platform analytics and audit logs.
- **Security:** bcrypt, PostgreSQL-backed sessions, CSRF tokens, Helmet, rate limiting, parameterized SQL, server-side role checks, ownership checks on every user-specific record.

## Tech stack

HTML5, CSS3, vanilla JavaScript, EJS, Node.js, Express.js, PostgreSQL (`pg`), pgAdmin.
Packages: bcrypt, express-session, connect-pg-simple, dotenv, express-validator, helmet, express-rate-limit, method-override, morgan. Dev: nodemon, jest, supertest.

## Requirements

Node.js 18+, PostgreSQL 13+ (the `pgcrypto` extension is used for seed password hashes), pgAdmin (optional, for inspection).

## Setup

1. **Create the database.** In pgAdmin: right-click Databases, Create, Database, name it `skillforge`.
2. **Install packages:** `npm install`
3. **Configure environment:** copy `.env.example` to `.env` and set:

   ```
   PORT=3000
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/skillforge
   SESSION_SECRET=<long random string>
   NODE_ENV=development
   ```
   Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
4. **Create tables and load sample data:** `npm run db:reset`
   (or run `db/schema.sql` then `db/seed.sql` in pgAdmin's Query Tool, or `npm run db:setup` and `npm run db:seed` separately).
5. **Start:** `npm run dev`, then open http://localhost:3000

`db:setup` drops and recreates all SkillForge tables. Never run it against data you want to keep.

## Development credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@skillforge.dev | Admin@12345 |
| Content manager | manager@skillforge.dev | Manager@12345 |
| Learner (has data) | alice@skillforge.dev | User@12345 |
| Learner (empty) | bob@skillforge.dev | User@12345 |
| Learner (empty) | carol@skillforge.dev | User@12345 |

For development only. Never use them in production.

## Roles

- `user`: every account has it.
- `content_manager`: access to `/content`.
- `admin`: access to `/admin` (admins also hold `content_manager`).

Roles and status are re-read on every request, so deactivation and role changes take effect immediately.

## Testing

`npm test` runs Jest and Supertest against the database in `DATABASE_URL`. Tests create throwaway users (emails starting `test-`) and delete them afterwards, but they do write to the database, so use a development database. Run `npm run db:reset` first so assessments exist.

## Password reset

There is no mail server. In development the reset link is printed to the terminal running the app. Before deploying, send it by email in `controllers/authController.js` (`forgot`).

## Folder structure

```
app.js            Express setup
config/           db pool, career goals
middleware/       auth, role, csrf, validation, error handler
models/           SQL queries
services/         scoring, roadmap, achievements, notifications, password reset
controllers/      request handlers
routes/           route definitions
db/               schema.sql, seed.sql, run.js
views/            EJS templates (partials, public, auth, user, assessment, content, admin, errors)
public/           css and js
tests/            jest tests
```

## Troubleshooting

- **`DATABASE_URL is not set`:** create `.env` from `.env.example`.
- **pgcrypto / permission error on seed:** run `CREATE EXTENSION IF NOT EXISTS pgcrypto;` in pgAdmin as a superuser.
- **Login fails after seeding:** check that `npm run db:seed` finished without errors.
- **Port in use:** change `PORT` in `.env`.

## Known limitations and future improvements

- Charts are CSS bars; Chart.js is not wired in yet.
- Pages use a top navigation bar, not a sidebar drawer.
- Not built: admin settings page, roadmap detail page, assessment history page, question and skill hard-delete (items are deactivated instead).
- No email sending, no multiple-answer or free-text question types.

## Author

Your name here.
