// Database connection and migrations.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function createPool(databaseUrl) {
  return new Pool({
    connectionString: databaseUrl,
    // Railway's private DATABASE_URL needs no SSL. Set DATABASE_SSL=true only if
    // you use a public database URL that requires it.
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
}

// Runs every .sql file in /migrations (in name order) that has not run yet.
// The names of finished files are remembered in the table schema_migrations.
async function runMigrations(pool, dir = path.join(__dirname, '..', 'migrations')) {
  const client = await pool.connect();
  try {
    // The lock stops two instances (for example during a redeploy) from migrating at once.
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Migration applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    client.release();
  }
}

module.exports = { createPool, runMigrations };
