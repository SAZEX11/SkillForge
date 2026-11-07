const crypto = require('crypto');
const { query, withTransaction } = require('../config/db');

// Only the SHA-256 hash of a token is stored; the raw token exists only in the emailed link.
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const TOKEN_FORMAT = /^[a-f0-9]{64}$/;

// Returns a raw token, or null when no active account has that email (callers must not reveal which).
exports.createForEmail = async (email) => {
  const { rows } = await query(`SELECT id FROM users WHERE email = $1 AND status = 'active'`, [email]);
  if (!rows[0]) return null;
  const token = crypto.randomBytes(32).toString('hex');
  await query(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [rows[0].id, hash(token)]);
  return token;
};

exports.isValid = async (token) => TOKEN_FORMAT.test(token) && (await query(
  'SELECT 1 FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()', [hash(token)])).rowCount === 1;

// Sets the new password, burns every outstanding token for the user, and signs them out everywhere.
exports.consume = (token, passwordHash) => withTransaction(async (client) => {
  if (!TOKEN_FORMAT.test(token)) return false;
  const row = (await client.query(
    `SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE`,
    [hash(token)])).rows[0];
  if (!row) return false;
  await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, row.user_id]);
  await client.query('UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [row.user_id]);
  await client.query(`DELETE FROM "session" WHERE sess->'user'->>'id' = $1`, [String(row.user_id)]);
  return true;
});
