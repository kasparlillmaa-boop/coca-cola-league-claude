const test = require('node:test');
const assert = require('node:assert');
const { analyze } = require('../src/rules');

// Short helper: round(1, 61, 92, 55, 88) = Kaspar 61, KJ 92, MA 55, ML 88
const round = (number, Kaspar, KJ, MA, ML) => ({ number, scores: { Kaspar, KJ, MA, ML } });
const namesWith = (ranking, result) => ranking.filter((e) => e.result === result).map((e) => e.name);

test('two best win, two lowest bring the Coca-Cola', () => {
  const { rounds } = analyze([round(7, 61, 92, 55, 88)]);
  assert.deepStrictEqual(namesWith(rounds[0].ranking, 'win'), ['KJ', 'ML']);
  assert.deepStrictEqual(namesWith(rounds[0].ranking, 'coke'), ['Kaspar', 'MA']);
});

test('tie on the 2nd/3rd line: higher period total wins', () => {
  const { rounds } = analyze([round(1, 60, 90, 80, 50), round(2, 70, 90, 70, 40)]);
  const r2 = rounds[1];
  assert.deepStrictEqual(namesWith(r2.ranking, 'win'), ['KJ', 'MA']);
  assert.deepStrictEqual(namesWith(r2.ranking, 'coke'), ['Kaspar', 'ML']);
  assert.match(r2.summary, /MA and Kaspar both scored 70; MA ranks higher on period total \(150 vs 130\)\./);
});

test('tie in the first round of a period falls back to alphabetical order', () => {
  const { rounds } = analyze([round(1, 70, 90, 70, 50)]);
  assert.deepStrictEqual(namesWith(rounds[0].ranking, 'win'), ['KJ', 'Kaspar']);
  assert.match(rounds[0].summary, /same period total \(70\), so alphabetical order puts Kaspar first\./);
});

test('period total only counts the current period, not earlier periods', () => {
  // Round 6 starts period 2. Kaspar was far ahead in period 1, but that must not count.
  const earlier = [1, 2, 3, 4, 5].map((n) => round(n, 200, 10, 10, 10));
  const { rounds } = analyze([...earlier, round(6, 70, 90, 70, 50)]);
  const r6 = rounds[5];
  assert.deepStrictEqual(namesWith(r6.ranking, 'win'), ['KJ', 'Kaspar']); // alphabetical, not by old totals
  assert.strictEqual(r6.ranking.find((e) => e.name === 'Kaspar').periodTotal, 70);
});

test('three-way tie across the line is explained', () => {
  const { rounds } = analyze([round(1, 70, 90, 70, 70)]);
  assert.deepStrictEqual(namesWith(rounds[0].ranking, 'win'), ['KJ', 'Kaspar']);
  assert.match(rounds[0].summary, /Kaspar, MA and ML all scored 70\./);
});

test('a tie that does not change the winners gets no tie note', () => {
  const { rounds } = analyze([round(1, 90, 90, 40, 30)]);
  assert.doesNotMatch(rounds[0].summary, /both scored/);
});

test('margin sentence: close one under 10 points, otherwise "led by"', () => {
  const close = analyze([round(1, 50, 90, 60, 86)]).rounds[0].summary;
  assert.match(close, /A close one: KJ led ML by only 4 points\./);
  const wide = analyze([round(1, 50, 90, 60, 70)]).rounds[0].summary;
  assert.match(wide, /KJ led ML by 20 points\./);
  const exactly10 = analyze([round(1, 50, 90, 60, 80)]).rounds[0].summary;
  assert.match(exactly10, /KJ led ML by 10 points\./);
  const one = analyze([round(1, 50, 90, 60, 89)]).rounds[0].summary;
  assert.match(one, /by only 1 point\./);
});

test('summary names winners and Coca-Cola bringers with their points', () => {
  const { rounds } = analyze([round(7, 61, 92, 55, 88)]);
  assert.match(rounds[0].summary, /^Round 7: KJ \(92\) and ML \(88\) win\. Kaspar \(61\) and MA \(55\) bring the Coca-Cola\./);
});

test('Coca-Cola streak of 3 is mentioned, 2 is not', () => {
  const { rounds } = analyze([round(1, 10, 90, 80, 70), round(2, 10, 90, 80, 70), round(3, 10, 90, 80, 70)]);
  assert.doesNotMatch(rounds[1].summary, /in a row/);
  assert.match(rounds[2].summary, /Kaspar has now brought the Coca-Cola 3 rounds in a row\./);
});

test('streak is broken by a win', () => {
  const { rounds } = analyze([
    round(1, 10, 90, 80, 70),
    round(2, 10, 90, 80, 70),
    round(3, 99, 90, 80, 70), // Kaspar wins
    round(4, 10, 90, 80, 70),
  ]);
  assert.doesNotMatch(rounds[3].summary, /Kaspar has now brought/);
  assert.strictEqual(rounds[3].cokeStreaks.Kaspar, 1); // restarted from 0 after the win in round 3
});

test('league table ranks by total points and counts wins and cokes', () => {
  const { table } = analyze([round(1, 61, 92, 55, 88), round(2, 100, 50, 60, 70)]);
  assert.deepStrictEqual(
    table.map((t) => [t.rank, t.name, t.total, t.wins, t.cokes]),
    [
      [1, 'Kaspar', 161, 1, 1],
      [2, 'ML', 158, 2, 0],
      [3, 'KJ', 142, 1, 1],
      [4, 'MA', 115, 0, 2],
    ]
  );
});

test('league table ties are alphabetical', () => {
  const { table } = analyze([round(1, 50, 50, 50, 50)]);
  assert.deepStrictEqual(table.map((t) => t.name), ['Kaspar', 'KJ', 'MA', 'ML']);
});

test('an incomplete round is ignored', () => {
  const { rounds, table } = analyze([{ number: 1, scores: { Kaspar: 10, KJ: 20, MA: 30 } }]);
  assert.strictEqual(rounds.length, 0);
  assert.strictEqual(table[0].total, 0);
});

test('period is "in progress" without marks until all 5 rounds are complete', () => {
  const { periods } = analyze([1, 2, 3].map((n) => round(n, 10, 90, 80, 70)));
  assert.strictEqual(periods.length, 1);
  assert.strictEqual(periods[0].finished, false);
  assert.strictEqual(periods[0].roundsDone, 3);
  assert.ok(periods[0].standings.every((s) => s.result === null));
});

test('finished period marks top 2 and bottom 2 and adds the period sentence to round 5', () => {
  const { periods, rounds } = analyze([1, 2, 3, 4, 5].map((n) => round(n, 10, 90, 80, 70)));
  assert.strictEqual(periods[0].finished, true);
  assert.deepStrictEqual(namesWith(periods[0].standings, 'win'), ['KJ', 'MA']);
  assert.deepStrictEqual(namesWith(periods[0].standings, 'coke'), ['ML', 'Kaspar']);
  assert.match(rounds[4].summary, /Period 1 is complete: KJ and MA win the period, ML and Kaspar bring the Coca-Cola\./);
  assert.doesNotMatch(rounds[3].summary, /Period 1 is complete/);
});

test('period ties are alphabetical', () => {
  const { periods } = analyze([1, 2, 3, 4, 5].map((n) => round(n, 50, 50, 50, 50)));
  assert.deepStrictEqual(periods[0].standings.map((s) => s.name), ['Kaspar', 'KJ', 'MA', 'ML']);
});

test('a gap keeps the period unfinished and rounds go to the right period', () => {
  const { periods } = analyze([round(1, 1, 2, 3, 4), round(2, 1, 2, 3, 4), round(4, 1, 2, 3, 4), round(5, 1, 2, 3, 4), round(6, 1, 2, 3, 4)]);
  assert.strictEqual(periods[0].finished, false);
  assert.strictEqual(periods[0].roundsDone, 4);
  assert.strictEqual(periods[1].number, 2);
  assert.strictEqual(periods[1].firstRound, 6);
});

test('correcting a score changes everything that depends on it', () => {
  const before = analyze([round(1, 61, 92, 55, 88)]);
  const after = analyze([round(1, 61, 92, 95, 88)]); // MA was really 95
  assert.deepStrictEqual(namesWith(before.rounds[0].ranking, 'win'), ['KJ', 'ML']);
  assert.deepStrictEqual(namesWith(after.rounds[0].ranking, 'win'), ['MA', 'KJ']);
  assert.strictEqual(after.table.find((t) => t.name === 'MA').total, 95);
});

test('no rounds gives empty results and a table of zeros', () => {
  const { rounds, periods, table } = analyze([]);
  assert.strictEqual(rounds.length, 0);
  assert.strictEqual(periods.length, 0);
  assert.strictEqual(table.length, 4);
});
