// Tests the web app end to end (login, forms, errors) using a fake in-memory store.
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');
const { createFakeStore } = require('../test-support/fake-store');
const { safeNext, passwordMatches } = require('../src/auth');

const PASSWORD = 'secret-league-password';
const goodForm = { round: '7', points_Kaspar: '61', points_KJ: '92', points_MA: '55', points_ML: '88' };

// Starts the app on a random port and returns a tiny browser-like helper that remembers cookies.
async function startApp({ store = createFakeStore(), editPassword = PASSWORD } = {}) {
  const app = createApp({ store, config: { editPassword, sessionSecret: 'test-secret' } });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookies = new Map();

  async function request(path, { method = 'GET', form, rawBody } = {}) {
    const headers = {};
    if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    } else if (rawBody !== undefined) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = rawBody;
    }
    const res = await fetch(base + path, { method, headers, body, redirect: 'manual' });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      const [name, value] = [pair.slice(0, eq), pair.slice(eq + 1)];
      if (value === '') cookies.delete(name);
      else cookies.set(name, value);
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text(), headers: res.headers };
  }

  async function login() {
    const res = await request('/login', { method: 'POST', form: { password: PASSWORD, next: '/' } });
    assert.strictEqual(res.status, 303);
  }

  return { request, login, store, close: () => server.close(), cookies };
}

test('GET /healthz answers ok', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/healthz');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.text, 'ok');
  } finally {
    t.close();
  }
});

test('forms need a login: visitors are sent to the sign-in page', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/rounds/new');
    assert.strictEqual(res.status, 303);
    assert.strictEqual(res.location, '/login?next=%2Frounds%2Fnew');
    const post = await t.request('/rounds/new', { method: 'POST', form: goodForm });
    assert.strictEqual(post.status, 303);
    assert.match(post.location, /^\/login/);
    assert.deepStrictEqual(await t.store.getRounds(), []);
  } finally {
    t.close();
  }
});

test('wrong password is refused, right password signs in and returns to the wanted page', async () => {
  const t = await startApp();
  try {
    const wrong = await t.request('/login', { method: 'POST', form: { password: 'nope', next: '/rounds/new' } });
    assert.strictEqual(wrong.status, 401);
    assert.match(wrong.text, /Wrong password/);
    assert.strictEqual((await t.request('/rounds/new')).status, 303);

    const right = await t.request('/login', { method: 'POST', form: { password: PASSWORD, next: '/rounds/new' } });
    assert.strictEqual(right.status, 303);
    assert.strictEqual(right.location, '/rounds/new');
    const form = await t.request('/rounds/new');
    assert.strictEqual(form.status, 200);
    assert.match(form.text, /name="points_KJ"/);
    assert.match(form.text, /name="round" type="text"[^>]*value="1"/); // suggests round 1
  } finally {
    t.close();
  }
});

test('a forged session cookie does not sign anyone in', async () => {
  const t = await startApp();
  try {
    const forged = Buffer.from(JSON.stringify({ authAt: Date.now() })).toString('base64');
    t.cookies.set('session', forged);
    t.cookies.set('session.sig', 'AAAAAAAAAAAAAAAAAAAAAAAAAAA');
    assert.strictEqual((await t.request('/rounds/new')).status, 303);
  } finally {
    t.close();
  }
});

test('login redirects only to local pages', () => {
  assert.strictEqual(safeNext('/rounds'), '/rounds');
  for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '/a\r\nSet-Cookie: x=1', undefined, ['/a'], 'x'.repeat(500)]) {
    assert.strictEqual(safeNext(bad), '/');
  }
  assert.strictEqual(passwordMatches('abc', 'abc'), true);
  assert.strictEqual(passwordMatches('abd', 'abc'), false);
  assert.strictEqual(passwordMatches(undefined, 'abc'), false);
  assert.strictEqual(passwordMatches('', ''), false);
});

test('after 5 wrong passwords even the right one is blocked for a while', async () => {
  const t = await startApp();
  try {
    for (let i = 0; i < 5; i++) await t.request('/login', { method: 'POST', form: { password: 'wrong' } });
    const res = await t.request('/login', { method: 'POST', form: { password: PASSWORD } });
    assert.strictEqual(res.status, 429);
  } finally {
    t.close();
  }
});

test('without EDIT_PASSWORD nobody can sign in and the page says why', async () => {
  const t = await startApp({ editPassword: '' });
  try {
    const page = await t.request('/login');
    assert.match(page.text, /EDIT_PASSWORD is not set/);
    const res = await t.request('/login', { method: 'POST', form: { password: '' } });
    assert.strictEqual(res.status, 503);
  } finally {
    t.close();
  }
});

test('adding a round saves all four scores and redirects', async () => {
  const t = await startApp();
  try {
    await t.login();
    const res = await t.request('/rounds/new', { method: 'POST', form: goodForm });
    assert.strictEqual(res.status, 303);
    assert.strictEqual(res.location, '/rounds');
    assert.deepStrictEqual(await t.store.getRounds(), [{ number: 7, scores: { Kaspar: 61, KJ: 92, MA: 55, ML: 88 } }]);
  } finally {
    t.close();
  }
});

test('bad input shows clear errors, keeps typed values, saves nothing and never crashes', async () => {
  const t = await startApp();
  try {
    await t.login();
    const cases = [
      { form: { ...goodForm, points_KJ: '' }, expect: /KJ: enter points/ },
      { form: { ...goodForm, points_MA: 'abc' }, expect: /MA: &quot;abc&quot; is not valid/ },
      { form: { ...goodForm, points_ML: '501' }, expect: /ML: 501 is too high/ },
      { form: { ...goodForm, points_ML: '-5' }, expect: /ML: &quot;-5&quot; is not valid/ },
      { form: { ...goodForm, points_Kaspar: '12.5' }, expect: /Kaspar: &quot;12.5&quot; is not valid/ },
      { form: { ...goodForm, round: '0' }, expect: /Round number must be a whole number from 1 to 100/ },
      { form: { ...goodForm, round: '' }, expect: /Enter a round number/ },
      { form: { ...goodForm, points_KJ: 'x'.repeat(10000) }, expect: /KJ: &quot;x{20}…&quot; is not valid/ },
      { form: { ...goodForm, points_KJ: '<script>alert(1)</script>' }, expect: /&lt;script&gt;/ },
    ];
    for (const c of cases) {
      const res = await t.request('/rounds/new', { method: 'POST', form: c.form });
      assert.strictEqual(res.status, 400, JSON.stringify(c.form).slice(0, 80));
      assert.match(res.text, c.expect);
      assert.doesNotMatch(res.text, /<script>alert/);
      assert.match(res.text, /role="alert"/);
    }
    // Other fields keep what was typed.
    const res = await t.request('/rounds/new', { method: 'POST', form: { ...goodForm, points_MA: 'abc' } });
    assert.match(res.text, /name="points_KJ"[^>]*value="92"/);
    assert.deepStrictEqual(await t.store.getRounds(), []);
  } finally {
    t.close();
  }
});

test('an empty or oversized form body gives a friendly error', async () => {
  const t = await startApp();
  try {
    await t.login();
    const empty = await t.request('/rounds/new', { method: 'POST', rawBody: '' });
    assert.strictEqual(empty.status, 400);
    assert.match(empty.text, /enter points/);
    const huge = await t.request('/rounds/new', { method: 'POST', rawBody: 'round=1&points_KJ=' + 'a'.repeat(100000) });
    assert.strictEqual(huge.status, 413);
    assert.match(huge.text, /Too much data/);
    const repeated = await t.request('/rounds/new', { method: 'POST', rawBody: 'round=1&round=2&points_KJ=1&points_KJ=2' });
    assert.strictEqual(repeated.status, 400);
  } finally {
    t.close();
  }
});

test('a round number can only be used once', async () => {
  const t = await startApp();
  try {
    await t.login();
    await t.request('/rounds/new', { method: 'POST', form: goodForm });
    const again = await t.request('/rounds/new', { method: 'POST', form: { ...goodForm, points_KJ: '1' } });
    assert.strictEqual(again.status, 400);
    assert.match(again.text, /Round 7 already has scores/);
    assert.strictEqual((await t.store.getRounds())[0].scores.KJ, 92); // unchanged
  } finally {
    t.close();
  }
});

test('the suggested round number is the highest existing round plus one', async () => {
  const t = await startApp({ store: createFakeStore([{ number: 4, scores: { Kaspar: 1, KJ: 2, MA: 3, ML: 4 } }]) });
  try {
    await t.login();
    const res = await t.request('/rounds/new');
    assert.match(res.text, /name="round" type="text"[^>]*value="5"/);
  } finally {
    t.close();
  }
});

test('correcting a score: edit form is prefilled and saving replaces the scores', async () => {
  const t = await startApp({ store: createFakeStore([{ number: 3, scores: { Kaspar: 10, KJ: 20, MA: 30, ML: 40 } }]) });
  try {
    await t.login();
    const form = await t.request('/rounds/3/edit');
    assert.strictEqual(form.status, 200);
    assert.match(form.text, /name="points_MA"[^>]*value="30"/);

    const bad = await t.request('/rounds/3/edit', { method: 'POST', form: { points_Kaspar: '10', points_KJ: '20', points_MA: 'oops', points_ML: '40' } });
    assert.strictEqual(bad.status, 400);
    assert.match(bad.text, /MA: &quot;oops&quot;/);

    const ok = await t.request('/rounds/3/edit', { method: 'POST', form: { points_Kaspar: '10', points_KJ: '20', points_MA: '35', points_ML: '40' } });
    assert.strictEqual(ok.status, 303);
    assert.strictEqual((await t.store.getRounds())[0].scores.MA, 35);
  } finally {
    t.close();
  }
});

test('editing or deleting a round that does not exist gives a 404 page', async () => {
  const t = await startApp();
  try {
    await t.login();
    for (const path of ['/rounds/9/edit', '/rounds/abc/edit', '/rounds/9/delete', '/rounds/-1/delete', '/nowhere']) {
      assert.strictEqual((await t.request(path)).status, 404, path);
    }
    assert.strictEqual((await t.request('/rounds/9/edit', { method: 'POST', form: goodForm })).status, 404);
    assert.strictEqual((await t.request('/rounds/9/delete', { method: 'POST' })).status, 404);
  } finally {
    t.close();
  }
});

test('deleting asks first, then removes the round', async () => {
  const t = await startApp({ store: createFakeStore([{ number: 3, scores: { Kaspar: 10, KJ: 20, MA: 30, ML: 40 } }]) });
  try {
    await t.login();
    const confirm = await t.request('/rounds/3/delete');
    assert.match(confirm.text, /Delete round 3\?/);
    assert.strictEqual((await t.store.getRounds()).length, 1); // the confirm page deletes nothing
    const done = await t.request('/rounds/3/delete', { method: 'POST' });
    assert.strictEqual(done.status, 303);
    assert.strictEqual((await t.store.getRounds()).length, 0);
  } finally {
    t.close();
  }
});

test('a database failure shows an error page instead of crashing the app', async () => {
  const broken = { ...createFakeStore(), getRounds: async () => { throw new Error('database is down'); } };
  const t = await startApp({ store: broken });
  const originalError = console.error;
  console.error = () => {}; // keep the test output clean
  try {
    await t.login();
    const res = await t.request('/rounds/new');
    assert.strictEqual(res.status, 500);
    assert.match(res.text, /Something went wrong/);
    assert.doesNotMatch(res.text, /database is down/);
    assert.strictEqual((await t.request('/healthz')).status, 200); // still alive
  } finally {
    console.error = originalError;
    t.close();
  }
});

test('pages send security headers', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/login');
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  } finally {
    t.close();
  }
});

// ----- Read-only pages -----
const r = (number, Kaspar, KJ, MA, ML) => ({ number, scores: { Kaspar, KJ, MA, ML } });

test('empty league shows the table with zeros and a link to add the first round', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/');
    assert.strictEqual(res.status, 200);
    assert.match(res.text, /No rounds yet/);
    assert.match(res.text, /<th scope="row">Kaspar<\/th>/);
    for (const path of ['/rounds', '/periods']) assert.match((await t.request(path)).text, /No rounds yet/);
  } finally {
    t.close();
  }
});

test('league page shows the table in order, the latest summary and the tie rule (no login needed)', async () => {
  const t = await startApp({ store: createFakeStore([r(1, 61, 92, 55, 88), r(2, 100, 50, 60, 70)]) });
  try {
    const res = await t.request('/');
    assert.strictEqual(res.status, 200);
    const order = [...res.text.matchAll(/<th scope="row">(\w+)<\/th><td class="num">(\d+)</g)].map((m) => `${m[1]}:${m[2]}`);
    assert.deepStrictEqual(order, ['Kaspar:161', 'ML:158', 'KJ:142', 'MA:115']);
    assert.match(res.text, /Round 2: Kaspar \(100\) and ML \(70\) win\./);
    assert.match(res.text, /Ties: if two participants have the same score/);
    assert.match(res.text, /name="viewport"/);
  } finally {
    t.close();
  }
});

test('rounds page lists newest first with win/coke labels and edit links', async () => {
  const t = await startApp({ store: createFakeStore([r(1, 61, 92, 55, 88), r(2, 100, 50, 60, 70)]) });
  try {
    const res = await t.request('/rounds');
    assert.ok(res.text.indexOf('Round 2') < res.text.indexOf('Round 1'));
    assert.match(res.text, /class="tag win">Wins</);
    assert.match(res.text, /class="tag coke">Coke</);
    assert.match(res.text, /href="\/rounds\/2\/edit"/);
    assert.match(res.text, /Ties: if two participants/);
  } finally {
    t.close();
  }
});

test('periods page: unfinished period has no marks, finished period does', async () => {
  const five = [1, 2, 3, 4, 5].map((n) => r(n, 10, 90, 80, 70));
  const t = await startApp({ store: createFakeStore([...five, r(6, 50, 60, 70, 80)]) });
  try {
    const res = await t.request('/periods');
    const [inProgress, finished] = res.text.split('Period 1');
    assert.match(inProgress, /In progress \(1 of 5 rounds\)/);
    assert.doesNotMatch(inProgress, /class="tag/);
    assert.match(finished, /Finished/);
    assert.strictEqual((finished.match(/class="tag win"/g) || []).length, 2);
    assert.strictEqual((finished.match(/class="tag coke"/g) || []).length, 2);
  } finally {
    t.close();
  }
});

test('the saved round shows up on the pages and a correction changes the table', async () => {
  const t = await startApp();
  try {
    await t.login();
    await t.request('/rounds/new', { method: 'POST', form: goodForm });
    const flash = await t.request('/rounds');
    assert.match(flash.text, /Round 7 saved\./);
    assert.doesNotMatch((await t.request('/rounds')).text, /Round 7 saved\./); // shown only once
    await t.request('/rounds/7/edit', { method: 'POST', form: { points_Kaspar: '61', points_KJ: '92', points_MA: '95', points_ML: '88' } });
    const league = await t.request('/');
    assert.match(league.text, /<th scope="row">MA<\/th><td class="num">95</);
  } finally {
    t.close();
  }
});
