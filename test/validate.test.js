const test = require('node:test');
const assert = require('node:assert');
const { validateRoundForm } = require('../src/validate');

const good = { round: '7', points_Kaspar: '61', points_KJ: '92', points_MA: '55', points_ML: '88' };

test('valid form is accepted and converted to numbers', () => {
  const result = validateRoundForm(good);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.round, 7);
  assert.deepStrictEqual(result.scores, { Kaspar: 61, KJ: 92, MA: 55, ML: 88 });
});

test('spaces around values are ignored; 0 and 500 are allowed', () => {
  const result = validateRoundForm({ ...good, round: ' 100 ', points_Kaspar: ' 0 ', points_KJ: '500' });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.round, 100);
  assert.strictEqual(result.scores.Kaspar, 0);
  assert.strictEqual(result.scores.KJ, 500);
});

test('bad round numbers are rejected', () => {
  for (const bad of ['', '0', '-1', '101', '1.5', 'abc', '3e2', '１２', 'x'.repeat(5000)]) {
    const result = validateRoundForm({ ...good, round: bad });
    assert.strictEqual(result.ok, false, `round "${bad.slice(0, 10)}" should fail`);
    assert.strictEqual(result.errors.length, 1);
  }
});

test('bad points are rejected with a message naming the participant', () => {
  for (const bad of ['', '   ', '-1', '501', '87.5', '87,5', 'abc', '1e2', '99999999999999999999999', 'y'.repeat(100000)]) {
    const result = validateRoundForm({ ...good, points_MA: bad });
    assert.strictEqual(result.ok, false, `points "${bad.slice(0, 10)}" should fail`);
    assert.match(result.errors[0], /^MA:/);
  }
});

test('long text is shortened in messages and in the values shown back', () => {
  const result = validateRoundForm({ ...good, points_KJ: 'z'.repeat(100000) });
  assert.ok(result.errors[0].length < 200);
  assert.ok(result.raw.points.KJ.length <= 21);
});

test('all problems are reported at once', () => {
  const result = validateRoundForm({ round: 'x', points_Kaspar: '', points_KJ: 'a', points_MA: '1', points_ML: '2' });
  assert.strictEqual(result.errors.length, 3);
});

test('missing body, repeated fields and other odd shapes never crash', () => {
  assert.strictEqual(validateRoundForm(undefined).ok, false);
  assert.strictEqual(validateRoundForm(null).ok, false);
  assert.strictEqual(validateRoundForm({}).ok, false);
  assert.strictEqual(validateRoundForm({ ...good, points_KJ: ['1', '2'] }).ok, false);
  assert.strictEqual(validateRoundForm({ ...good, round: { a: 1 } }).ok, false);
});

test('when editing, the round number is fixed and not read from the form', () => {
  const result = validateRoundForm({ ...good, round: 'garbage' }, 3);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.round, 3);
});

test('unknown participants in the form are ignored', () => {
  const result = validateRoundForm({ ...good, points_Hacker: '999' });
  assert.deepStrictEqual(Object.keys(result.scores), ['Kaspar', 'KJ', 'MA', 'ML']);
});
