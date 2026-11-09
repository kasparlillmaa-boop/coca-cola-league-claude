// Entry point: checks the settings, prepares the database, then starts listening.
const { createPool, runMigrations } = require('./db');
const { createApp } = require('./app');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. On Railway, add it to the app service as a reference to the Postgres service: ${{Postgres.DATABASE_URL}}');
    process.exit(1);
  }

  const pool = createPool(process.env.DATABASE_URL);
  await runMigrations(pool);

  const app = createApp();
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
