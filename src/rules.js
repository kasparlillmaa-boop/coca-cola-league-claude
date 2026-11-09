// All league rules live here. This file never touches the database or the web,
// so it is easy to read and to test.
//
// Input:  rounds = [{ number: 1, scores: { Kaspar: 61, KJ: 92, MA: 55, ML: 88 } }, ...]
// Output: analyze(rounds) -> { rounds, periods, table }, everything calculated fresh each time.
// Nothing is stored, so correcting a score can never leave old results behind.

const PARTICIPANTS = ['Kaspar', 'KJ', 'MA', 'ML'];
const ROUNDS_PER_PERIOD = 5;
const MAX_ROUND = 100;
const MAX_POINTS = 500;
const WINNERS = 2; // the best two win, the other two bring the Coca-Cola
const CLOSE_MARGIN = 10; // a lead below this many points is "a close one"
const STREAK_MIN = 3; // Coca-Cola streak that gets mentioned

const TIE_RULE_TEXT =
  'Ties: if two participants have the same score, the one with more points in the current period ranks higher; if that is equal too, alphabetical order decides.';

function compareNames(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

function periodOf(roundNumber) {
  return Math.ceil(roundNumber / ROUNDS_PER_PERIOD);
}

// A round only counts when all four participants have a score.
function isComplete(scores) {
  return PARTICIPANTS.every((name) => Number.isInteger(scores[name]));
}

function zeroTotals() {
  return Object.fromEntries(PARTICIPANTS.map((name) => [name, 0]));
}

// "A", "A and B", "A, B and C"
function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function analyze(allRounds) {
  const complete = allRounds.filter((r) => isComplete(r.scores)).sort((a, b) => a.number - b.number);

  // 1) Rank every round. Same score -> higher period total -> alphabetical.
  const periodRunning = new Map(); // period number -> running totals inside that period
  const cokeStreaks = zeroTotals();
  const rounds = complete.map((r) => {
    const period = periodOf(r.number);
    const running = periodRunning.get(period) || zeroTotals();
    for (const name of PARTICIPANTS) running[name] += r.scores[name];
    periodRunning.set(period, running);

    const ranking = PARTICIPANTS.map((name) => ({
      name,
      points: r.scores[name],
      periodTotal: running[name], // includes this round and earlier complete rounds of the period
    })).sort((a, b) => b.points - a.points || b.periodTotal - a.periodTotal || compareNames(a.name, b.name));

    ranking.forEach((entry, i) => {
      entry.rank = i + 1;
      entry.result = i < WINNERS ? 'win' : 'coke';
      cokeStreaks[entry.name] = entry.result === 'coke' ? cokeStreaks[entry.name] + 1 : 0;
    });

    return { number: r.number, period, ranking, cokeStreaks: { ...cokeStreaks } };
  });

  // 2) Period standings. Marks (win/coke) only appear once all 5 rounds are complete.
  const roundsByPeriod = new Map();
  for (const r of rounds) {
    if (!roundsByPeriod.has(r.period)) roundsByPeriod.set(r.period, []);
    roundsByPeriod.get(r.period).push(r);
  }
  const periods = [...roundsByPeriod.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, list]) => {
      const totals = zeroTotals();
      for (const r of list) for (const e of r.ranking) totals[e.name] += e.points;
      const finished = list.length === ROUNDS_PER_PERIOD;
      const standings = PARTICIPANTS.map((name) => ({ name, total: totals[name] })).sort(
        (a, b) => b.total - a.total || compareNames(a.name, b.name)
      );
      standings.forEach((entry, i) => {
        entry.rank = i + 1;
        entry.result = finished ? (i < WINNERS ? 'win' : 'coke') : null;
      });
      return {
        number,
        firstRound: (number - 1) * ROUNDS_PER_PERIOD + 1,
        lastRound: number * ROUNDS_PER_PERIOD,
        roundsDone: list.length,
        finished,
        standings,
      };
    });

  // 3) Summary text for each round.
  for (const r of rounds) {
    r.summary = summarizeRound(r, periods.find((p) => p.number === r.period));
  }

  // 4) League table over all complete rounds.
  const wins = zeroTotals();
  const cokes = zeroTotals();
  const totals = zeroTotals();
  for (const r of rounds) {
    for (const e of r.ranking) {
      totals[e.name] += e.points;
      if (e.result === 'win') wins[e.name] += 1;
      else cokes[e.name] += 1;
    }
  }
  const table = PARTICIPANTS.map((name) => ({ name, total: totals[name], wins: wins[name], cokes: cokes[name] })).sort(
    (a, b) => b.total - a.total || compareNames(a.name, b.name)
  );
  table.forEach((entry, i) => (entry.rank = i + 1));

  return { rounds, periods, table };
}

// Builds the plain-text summary from simple rules (no AI).
function summarizeRound(round, period) {
  const ranking = round.ranking;
  const label = (e) => `${e.name} (${e.points})`;
  const winners = ranking.filter((e) => e.result === 'win');
  const cokers = ranking.filter((e) => e.result === 'coke');

  const sentences = [
    `Round ${round.number}: ${joinNames(winners.map(label))} win. ${joinNames(cokers.map(label))} bring the Coca-Cola.`,
  ];

  // Tie note: only when a tie sits on the line between 2nd and 3rd place,
  // because only that tie changes who wins and who brings the Coca-Cola.
  const boundaryPoints = ranking[WINNERS - 1].points;
  if (ranking[WINNERS].points === boundaryPoints) {
    const tied = ranking.filter((e) => e.points === boundaryPoints);
    if (tied.length === 2) {
      const [a, b] = tied;
      sentences.push(
        a.periodTotal === b.periodTotal
          ? `${a.name} and ${b.name} both scored ${boundaryPoints} and have the same period total (${a.periodTotal}), so alphabetical order puts ${a.name} first.`
          : `${a.name} and ${b.name} both scored ${boundaryPoints}; ${a.name} ranks higher on period total (${a.periodTotal} vs ${b.periodTotal}).`
      );
    } else {
      sentences.push(
        `${joinNames(tied.map((e) => e.name))} all scored ${boundaryPoints}. They were ranked by period total, then alphabetically: ${tied.map((e) => e.name).join(', ')}.`
      );
    }
  }

  // Margin between 1st and 2nd.
  const lead = ranking[0].points - ranking[1].points;
  if (lead === 0) {
    sentences.push(`A close one: ${ranking[0].name} and ${ranking[1].name} scored the same.`);
  } else if (lead < CLOSE_MARGIN) {
    sentences.push(`A close one: ${ranking[0].name} led ${ranking[1].name} by only ${plural(lead, 'point')}.`);
  } else {
    sentences.push(`${ranking[0].name} led ${ranking[1].name} by ${plural(lead, 'point')}.`);
  }

  // Coca-Cola streaks.
  for (const e of cokers) {
    const streak = round.cokeStreaks[e.name];
    if (streak >= STREAK_MIN) sentences.push(`${e.name} has now brought the Coca-Cola ${streak} rounds in a row.`);
  }

  // Last round of a finished period.
  if (period && period.finished && round.number === period.lastRound) {
    const pw = period.standings.filter((e) => e.result === 'win').map((e) => e.name);
    const pc = period.standings.filter((e) => e.result === 'coke').map((e) => e.name);
    sentences.push(`Period ${period.number} is complete: ${joinNames(pw)} win the period, ${joinNames(pc)} bring the Coca-Cola.`);
  }

  return sentences.join(' ');
}

module.exports = {
  PARTICIPANTS,
  ROUNDS_PER_PERIOD,
  MAX_ROUND,
  MAX_POINTS,
  TIE_RULE_TEXT,
  analyze,
  periodOf,
};
