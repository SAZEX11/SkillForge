const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const FILES = { schema: 'schema.sql', seed: 'seed.sql' };

async function main() {
  const target = process.argv[2];
  if (!FILES[target]) {
    console.error('Usage: node db/run.js <schema|seed>');
    process.exitCode = 1;
    return;
  }
  const file = path.join(__dirname, FILES[target]);
  if (!fs.existsSync(file)) {
    console.error(`Missing ${FILES[target]} in the db folder.`);
    process.exitCode = 1;
    return;
  }
  const client = await pool.connect();
  try {
    console.log(`Running ${FILES[target]} ...`);
    await client.query(fs.readFileSync(file, 'utf8'));
    console.log('Done.');
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    if (/pgcrypto|permission denied/i.test(err.message)) console.error('Hint: run "CREATE EXTENSION IF NOT EXISTS pgcrypto;" in pgAdmin as a superuser.');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Could not connect to PostgreSQL:', err.message);
  process.exitCode = 1;
});
