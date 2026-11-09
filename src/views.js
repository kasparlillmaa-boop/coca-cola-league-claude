// HTML pages, written as plain template strings.
// The html`...` tag escapes every value you put into it, so text typed by a user
// can never become real HTML (this prevents cross-site scripting).
const { PARTICIPANTS, MAX_ROUND, MAX_POINTS, TIE_RULE_TEXT } = require('./rules');

class Raw {
  constructor(text) {
    this.text = text;
  }
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function render(value) {
  if (value instanceof Raw) return value.text;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(String(value));
}

function html(strings, ...values) {
  let out = '';
  strings.forEach((part, i) => {
    out += part;
    if (i < values.length) out += render(values[i]);
  });
  return new Raw(out);
}

const NAV = [
  { key: 'league', href: '/', label: 'League' },
  { key: 'rounds', href: '/rounds', label: 'Rounds' },
  { key: 'periods', href: '/periods', label: 'Periods' },
  { key: 'add', href: '/rounds/new', label: 'Add round' },
];

// The frame around every page. `body` is an html`...` value.
function layout({ title, active, authed, flash, body }) {
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · Coca-Cola League</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header>
    <h1><a href="/">Coca-Cola League</a></h1>
    <nav aria-label="Main">
      ${NAV.map((item) => html`<a href="${item.href}"${item.key === active ? new Raw(' aria-current="page"') : ''}>${item.label}</a>`)}
      ${authed
        ? html`<form method="post" action="/logout"><button type="submit" class="link-button">Sign out</button></form>`
        : html`<a href="/login"${active === 'login' ? new Raw(' aria-current="page"') : ''}>Sign in</a>`}
    </nav>
  </header>
  <main>
    ${flash ? html`<p class="flash" role="status">${flash}</p>` : ''}
    ${body}
  </main>
  <footer><p>© 2026 Coca-Cola League. Built with Claude Code</p></footer>
</body>
</html>`.text;
}

function messagePage(heading, text) {
  return html`<h2>${heading}</h2><p>${text}</p><p><a class="button" href="/">Back to the league</a></p>`;
}

function loginPage({ next, error, disabled }) {
  if (disabled) {
    return html`<h2>Sign in</h2>
      <p class="errors" role="alert">Editing is switched off because EDIT_PASSWORD is not set on the server.</p>`;
  }
  return html`<h2>Sign in</h2>
    <p>Everyone can look at the results. Adding or changing scores needs the league password.</p>
    ${error ? html`<p class="errors" role="alert">${error}</p>` : ''}
    <form method="post" action="/login" class="stack">
      <input type="hidden" name="next" value="${next}">
      <label for="password">League password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="200">
      <button type="submit" class="button">Sign in</button>
    </form>`;
}

// mode: 'create' or 'edit'. values holds the text for each field (so typed text is kept after an error).
function roundForm({ mode, round, values, errors }) {
  const editing = mode === 'edit';
  return html`<h2>${editing ? `Edit round ${round}` : 'Add round'}</h2>
    <p>${editing ? 'Change the scores below and save. The league table and summaries update automatically.' : 'Enter all four scores. They are saved together.'}</p>
    ${errors && errors.length
      ? html`<div class="errors" role="alert"><p>Please fix this:</p><ul>${errors.map((e) => html`<li>${e}</li>`)}</ul></div>`
      : ''}
    <form method="post" action="${editing ? `/rounds/${round}/edit` : '/rounds/new'}" class="stack" novalidate>
      ${editing
        ? ''
        : html`<label for="round">Round number (1–${MAX_ROUND})</label>
               <input id="round" name="round" type="text" inputmode="numeric" autocomplete="off" maxlength="6" value="${values.round}">`}
      ${PARTICIPANTS.map(
        (name) => html`<label for="points_${name}">${name} – points (0–${MAX_POINTS})</label>
          <input id="points_${name}" name="points_${name}" type="text" inputmode="numeric" autocomplete="off" maxlength="6" value="${values.points[name]}">`
      )}
      <button type="submit" class="button">${editing ? 'Save changes' : 'Save round'}</button>
    </form>
    <p><a href="/rounds">Cancel</a></p>`;
}

function deleteConfirmPage(round) {
  return html`<h2>Delete round ${round.number}?</h2>
    <p>This removes all four scores of this round and cannot be undone.</p>
    <ul class="plain">${PARTICIPANTS.map((name) => html`<li>${name}: ${round.scores[name]}</li>`)}</ul>
    <form method="post" action="/rounds/${round.number}/delete" class="stack">
      <button type="submit" class="button danger">Yes, delete round ${round.number}</button>
    </form>
    <p><a href="/rounds">No, keep it</a></p>`;
}

// ----- Read-only pages -----

const tieNote = () => html`<p class="note">${TIE_RULE_TEXT}</p>`;

// Text label as well as colour, so the result is clear without relying on colour.
function resultTag(result) {
  if (result === 'win') return html`<span class="tag win">Wins</span>`;
  if (result === 'coke') return html`<span class="tag coke">Coke</span>`;
  return '';
}

// analysis = the output of analyze() in rules.js
function leaguePage(analysis) {
  const latest = analysis.rounds[analysis.rounds.length - 1];
  return html`<h2>League table</h2>
    ${analysis.rounds.length === 0
      ? html`<p>No rounds yet. <a href="/rounds/new">Add the first round.</a></p>`
      : ''}
    <table>
      <caption class="sr-only">League table, ranked by total points</caption>
      <thead><tr><th scope="col">#</th><th scope="col">Name</th><th scope="col" class="num">Total</th><th scope="col" class="num">Wins</th><th scope="col" class="num">Cokes</th></tr></thead>
      <tbody>
        ${analysis.table.map(
          (row) => html`<tr><td>${row.rank}</td><th scope="row">${row.name}</th><td class="num">${row.total}</td><td class="num">${row.wins}</td><td class="num">${row.cokes}</td></tr>`
        )}
      </tbody>
    </table>
    <p class="note">Ranked by total points over all complete rounds. Wins = rounds in the best two. Cokes = rounds in the lowest two, which means bringing the Coca-Cola.</p>
    ${latest
      ? html`<section class="card"><h3>Latest round</h3><p class="summary">${latest.summary}</p><p><a href="/rounds#round-${latest.number}">See round ${latest.number}</a></p></section>`
      : ''}
    ${tieNote()}`;
}

function roundsPage(analysis) {
  const rounds = [...analysis.rounds].reverse(); // newest first
  return html`<h2>Rounds</h2>
    ${rounds.length === 0 ? html`<p>No rounds yet. <a href="/rounds/new">Add the first round.</a></p>` : ''}
    ${rounds.map(
      (r) => html`<section class="card" id="round-${r.number}">
        <h3>Round ${r.number} <small>Period ${r.period}</small></h3>
        <table>
          <caption class="sr-only">Results of round ${r.number}</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Name</th><th scope="col" class="num">Points</th><th scope="col">Result</th></tr></thead>
          <tbody>
            ${r.ranking.map((e) => html`<tr class="${e.result}"><td>${e.rank}</td><th scope="row">${e.name}</th><td class="num">${e.points}</td><td>${resultTag(e.result)}</td></tr>`)}
          </tbody>
        </table>
        <p class="summary">${r.summary}</p>
        <p class="actions">
          <a class="button secondary" href="/rounds/${r.number}/edit">Edit</a>
          <a class="button secondary" href="/rounds/${r.number}/delete">Delete</a>
        </p>
      </section>`
    )}
    ${tieNote()}`;
}

function periodsPage(analysis) {
  const periods = [...analysis.periods].reverse(); // newest first
  return html`<h2>Periods</h2>
    <p class="note">Every five rounds form one period (rounds 1–5, 6–10, …). When all five rounds are in, the two best win the period and the two lowest bring the Coca-Cola.</p>
    ${periods.length === 0 ? html`<p>No rounds yet. <a href="/rounds/new">Add the first round.</a></p>` : ''}
    ${periods.map(
      (p) => html`<section class="card">
        <h3>Period ${p.number} <small>rounds ${p.firstRound}–${p.lastRound}</small></h3>
        <p class="status ${p.finished ? 'done' : ''}">${p.finished ? 'Finished' : `In progress (${p.roundsDone} of 5 rounds)`}</p>
        <table>
          <caption class="sr-only">Standings of period ${p.number}</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Name</th><th scope="col" class="num">Total</th>${p.finished ? html`<th scope="col">Result</th>` : ''}</tr></thead>
          <tbody>
            ${p.standings.map(
              (s) => html`<tr class="${s.result || ''}"><td>${s.rank}</td><th scope="row">${s.name}</th><td class="num">${s.total}</td>${p.finished ? html`<td>${resultTag(s.result)}</td>` : ''}</tr>`
            )}
          </tbody>
        </table>
      </section>`
    )}
    ${tieNote()}`;
}

module.exports = { html, Raw, layout, messagePage, loginPage, roundForm, deleteConfirmPage, leaguePage, roundsPage, periodsPage };
