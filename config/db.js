require('dotenv').config();
const { Pool, types } = require('pg');
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1700, (v) => parseFloat(v));
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
pool.on('error', (err) => console.error('PostgreSQL pool error:', err.message));
const query = (text, params) => pool.query(text, params);
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
module.exports = { pool, query, withTransaction };
