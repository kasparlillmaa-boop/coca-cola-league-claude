// Builds the Express app. It gets its dependencies passed in
// (the store and the config), so tests can use a fake store instead of a real database.
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const { PARTICIPANTS, MAX_ROUND, analyze } = require('./rules');
const { validateRoundForm, parseRoundNumber } = require('./validate');
const { RoundExistsError, RoundNotFoundError } = require('./store');
const { passwordMatches, safeNext, createLoginGuard } = require('./auth');
const views = require('./views');

const LOGIN_HOURS = 12;

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': "default-src 'self'; form-action 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
}

function createApp({ store, config }) {
  const app = express();
  app.set('trust proxy', 1); // Railway puts a proxy in front of the app
  app.disable('x-powered-by');
  const guard = createLoginGuard();

  app.use(securityHeaders);
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '5m' }));
  // The login is a cookie that only this server can create (it is signed with SESSION_SECRET).
  // It has no expiry date, so it ends when the browser closes; isAuthed() also ends it after 12 hours.
  app.use(cookieSession({ name: 'session', keys: [config.sessionSecret], httpOnly: true, sameSite: 'lax' }));
  // Small limits so huge forms are refused instead of eating memory.
  app.use(express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 50 }));

  function isAuthed(req) {
    const at = req.session && req.session.authAt;
    return typeof at === 'number' && Date.now() - at < LOGIN_HOURS * 60 * 60 * 1000;
  }

  // Sends a full page. Also shows (and then clears) a one-time message such as "Round 7 saved."
  function send(req, res, status, { title, active, body }) {
    const flash = req.session && req.session.flash;
    if (flash) req.session.flash = null;
    res.status(status).type('html').send(views.layout({ title, active, authed: isAuthed(req), flash, body }));
  }

  function notFound(req, res) {
    send(req, res, 404, { title: 'Not found', body: views.messagePage('Page not found', 'We could not find that page or round.') });
  }

  function requireAuth(req, res, next) {
    if (isAuthed(req)) return next();
    res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl)}`);
  }

  // Railway can use this to check that the app is alive. It never touches the database.
  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // ----- Read-only pages (everyone can see them) -----
  // Each request loads the rounds and calculates everything fresh with analyze().
  app.get('/', async (req, res) => {
    const analysis = analyze(await store.getRounds());
    send(req, res, 200, { title: 'League', active: 'league', body: views.leaguePage(analysis) });
  });

  app.get('/rounds', async (req, res) => {
    const analysis = analyze(await store.getRounds());
    send(req, res, 200, { title: 'Rounds', active: 'rounds', body: views.roundsPage(analysis) });
  });

  app.get('/periods', async (req, res) => {
    const analysis = analyze(await store.getRounds());
    send(req, res, 200, { title: 'Periods', active: 'periods', body: views.periodsPage(analysis) });
  });

  // ----- Login -----
  app.get('/login', (req, res) => {
    const body = views.loginPage({ next: safeNext(req.query.next), disabled: !config.editPassword });
    send(req, res, 200, { title: 'Sign in', active: 'login', body });
  });

  app.post('/login', (req, res) => {
    const input = req.body || {};
    const next = safeNext(input.next);
    const page = (status, error) => send(req, res, status, { title: 'Sign in', active: 'login', body: views.loginPage({ next, error, disabled: !config.editPassword }) });

    if (!config.editPassword) return page(503);
    if (guard.isBlocked(req.ip)) return page(429, 'Too many wrong attempts. Please wait 15 minutes and try again.');
    if (!passwordMatches(input.password, config.editPassword)) {
      guard.fail(req.ip);
      return page(401, 'Wrong password.');
    }
    guard.reset(req.ip);
    req.session.authAt = Date.now();
    res.redirect(303, next);
  });

  app.post('/logout', (req, res) => {
    req.session = null;
    res.redirect(303, '/');
  });

  // ----- Add a round -----
  async function nextRoundNumber() {
    const rounds = await store.getRounds();
    const next = rounds.length ? rounds[rounds.length - 1].number + 1 : 1;
    return next <= MAX_ROUND ? String(next) : '';
  }

  const emptyValues = (round) => ({ round, points: Object.fromEntries(PARTICIPANTS.map((n) => [n, ''])) });

  app.get('/rounds/new', requireAuth, async (req, res) => {
    const body = views.roundForm({ mode: 'create', values: emptyValues(await nextRoundNumber()) });
    send(req, res, 200, { title: 'Add round', active: 'add', body });
  });

  app.post('/rounds/new', requireAuth, async (req, res) => {
    const form = validateRoundForm(req.body);
    const showErrors = (errors) =>
      send(req, res, 400, {
        title: 'Add round',
        active: 'add',
        body: views.roundForm({ mode: 'create', values: { round: form.raw.round, points: form.raw.points }, errors }),
      });

    if (!form.ok) return showErrors(form.errors);
    try {
      await store.createRound(form.round, form.scores);
    } catch (err) {
      if (err instanceof RoundExistsError) {
        return showErrors([`Round ${form.round} already has scores. Use Edit on the Rounds page to change them.`]);
      }
      throw err;
    }
    req.session.flash = `Round ${form.round} saved.`;
    res.redirect(303, '/rounds');
  });

  // ----- Edit and delete a round -----
  async function findRound(req) {
    const parsed = parseRoundNumber(req.params.n);
    if (parsed.error) return undefined;
    return (await store.getRounds()).find((r) => r.number === parsed.value);
  }

  app.get('/rounds/:n/edit', requireAuth, async (req, res) => {
    const round = await findRound(req);
    if (!round) return notFound(req, res);
    const points = Object.fromEntries(PARTICIPANTS.map((n) => [n, String(round.scores[n] ?? '')]));
    send(req, res, 200, { title: `Edit round ${round.number}`, active: 'rounds', body: views.roundForm({ mode: 'edit', round: round.number, values: { points } }) });
  });

  app.post('/rounds/:n/edit', requireAuth, async (req, res) => {
    const parsed = parseRoundNumber(req.params.n);
    if (parsed.error) return notFound(req, res);
    const form = validateRoundForm(req.body, parsed.value);
    if (!form.ok) {
      const body = views.roundForm({ mode: 'edit', round: parsed.value, values: { points: form.raw.points }, errors: form.errors });
      return send(req, res, 400, { title: `Edit round ${parsed.value}`, active: 'rounds', body });
    }
    try {
      await store.updateRound(parsed.value, form.scores);
    } catch (err) {
      if (err instanceof RoundNotFoundError) return notFound(req, res);
      throw err;
    }
    req.session.flash = `Round ${parsed.value} updated.`;
    res.redirect(303, '/rounds');
  });

  app.get('/rounds/:n/delete', requireAuth, async (req, res) => {
    const round = await findRound(req);
    if (!round) return notFound(req, res);
    send(req, res, 200, { title: `Delete round ${round.number}`, active: 'rounds', body: views.deleteConfirmPage(round) });
  });

  app.post('/rounds/:n/delete', requireAuth, async (req, res) => {
    const parsed = parseRoundNumber(req.params.n);
    if (parsed.error) return notFound(req, res);
    try {
      await store.deleteRound(parsed.value);
    } catch (err) {
      if (err instanceof RoundNotFoundError) return notFound(req, res);
      throw err;
    }
    req.session.flash = `Round ${parsed.value} deleted.`;
    res.redirect(303, '/rounds');
  });

  // ----- Anything else -----
  app.use(notFound);

  // Last safety net: bad input and unexpected errors show a friendly page and never crash the app.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.too.large') {
      return send(req, res, 413, { title: 'Too much data', body: views.messagePage('Too much data', 'The form was too large. Please enter shorter values.') });
    }
    if (err.status && err.status < 500) {
      return send(req, res, 400, { title: 'Bad request', body: views.messagePage('Bad request', 'We could not read that form. Please try again.') });
    }
    console.error(err);
    send(req, res, 500, { title: 'Error', body: views.messagePage('Something went wrong', 'Please try again in a moment.') });
  });

  return app;
}

module.exports = { createApp };
