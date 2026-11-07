
const { query, withTransaction } = require('../config/db');

async function findByEmail(email) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.status, u.career_goal,
            COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.email = $1
      GROUP BY u.id`,
    [email]
  );

  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.status,
            COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = $1
      GROUP BY u.id`,
    [id]
  );

  return rows[0] || null;
}

function create({ name, email, passwordHash, careerGoal }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, career_goal)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, email, passwordHash, careerGoal]
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE name = 'user'`,
      [rows[0].id]
    );

    return rows[0].id;
  });
}

const touchLogin = (id) =>
  query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [id]);

module.exports = {
  findByEmail,
  findById,
  create,
  touchLogin
};
