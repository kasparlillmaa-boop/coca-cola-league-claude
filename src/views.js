// HTML pages, written as plain template strings.
// The html`...` tag escapes every value you put into it, so text typed by a user
// can never become real HTML (this prevents cross-site scripting).
const { PARTICIPANTS, MAX_ROUND, MAX_POINTS } = require('./rules');

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
  <footer><p>EuroLeague Fantasy · Kaspar, KJ, MA and ML</p></footer>
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

module.exports = { html, Raw, layout, messagePage, loginPage, roundForm, deleteConfirmPage };
