const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');

test('GET /healthz answers ok', async () => {
  const server = createApp().listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/healthz`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'ok');
  } finally {
    server.close();
  }
});
