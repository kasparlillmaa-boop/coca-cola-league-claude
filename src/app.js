// Builds the Express app. It gets its dependencies passed in, so tests can use a fake store.
const express = require('express');

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Railway puts a proxy in front of the app

  // Railway can use this to check that the app is alive. It never touches the database.
  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  app.get('/', (req, res) => res.type('text').send('Coca-Cola League Assistant is starting up.'));

  return app;
}

module.exports = { createApp };
