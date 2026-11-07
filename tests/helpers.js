process.env.NODE_ENV = 'test';
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool, query } = require('../config/db');
const userModel = require('../models/userModel');

const created = [];

// Reads the CSRF token that the server embeds in a rendered form.
async function csrf(agent, path) {
  const res = await agent.get(path);
  const match = /name="_csrf" value="([a-f0-9]+)"/.exec(res.text);
  if (!match) throw new Error(`No CSRF token found on ${path} (status ${res.status})`);
  return match[1];
}

async function login(email, password) {
  const agent = request.agent(app);
  const token = await csrf(agent, '/login');
  const res = await agent.post('/login').type('form').send({ _csrf: token, email, password });
  return { agent, res };
}

// Throwaway learner, removed by cleanup(). Never touches seeded accounts.
async function createUser(label) {
  const email = `test-${label}-${Date.now()}-${Math.floor(Math.random() * 1e5)}@example.com`;
  const password = 'TestPass@123';
  const id = await userModel.create({ name: `Test ${label}`, email, passwordHash: await bcrypt.hash(password, 4), careerGoal: 'Full Stack Developer' });
  created.push(id);
  return { id, email, password };
}

async function cleanup() {
  if (created.length) await query('DELETE FROM users WHERE id = ANY($1::int[])', [created]);
  await pool.end();
}

module.exports = { app, request, csrf, login, createUser, cleanup, query };
