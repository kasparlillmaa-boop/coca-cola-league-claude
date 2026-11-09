// Entry point: checks the settings, prepares the database, then starts listening.
const crypto = require('crypto');
const { createPool, runMigrations } = require('./db');
const { createPgStore } = require('./store');
const { createApp } = require('./app');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. On Railway, add it to the app service as a reference to the Postgres service: ${{Postgres.DATABASE_URL}}');
    process.exit(1);
  }

  const editPassword = process.env.EDIT_PASSWORD || '';
  if (!editPassword) console.warn('EDIT_PASSWORD is not set: nobody can sign in, so scores cannot be changed.');

  let sessionSecret = process.env.SESSION_SECRET || '';
  if (!sessionSecret) {
    // Works, but everybody is signed out whenever the app restarts.
    console.warn('SESSION_SECRET is not set: using a temporary random secret. Set it on Railway.');
    sessionSecret = crypto.randomBytes(32).toString('hex');
  }

  const pool = createPool(process.env.DATABASE_URL);
  await runMigrations(pool);

  const app = createApp({ store: createPgStore(pool), config: { editPassword, sessionSecret } });
  const port = Number(process.env.PORT) || 3000; // Railway provides PORT
  const server = app.listen(port, '0.0.0.0', () => console.log(`Listening on port ${port}`));

  // Railway stops the old instance with SIGTERM during a redeploy.
  process.on('SIGTERM', () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}

main().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
