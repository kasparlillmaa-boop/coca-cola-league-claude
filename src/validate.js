// Checks what the user typed into the round form. It never throws on bad input.
const { PARTICIPANTS, MAX_ROUND, MAX_POINTS } = require('./rules');

// Cuts long text so it can be shown back safely (the views also escape it).
function shorten(text, max = 20) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Form values can be missing or even arrays (a=1&a=2); only plain strings are accepted.
function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseRoundNumber(input) {
  const text = asText(input);
  if (text === '') return { error: `Enter a round number (a whole number from 1 to ${MAX_ROUND}).` };
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > MAX_ROUND) {
    return { error: `Round number must be a whole number from 1 to ${MAX_ROUND} (you entered "${shorten(text)}").` };
  }
  return { value: Number(text) };
}

function parsePoints(name, input) {
  const text = asText(input);
  if (text === '') return { error: `${name}: enter points (a whole number from 0 to ${MAX_POINTS}).` };
  if (!/^\d+$/.test(text)) {
    return { error: `${name}: "${shorten(text)}" is not valid. Points must be a whole number from 0 to ${MAX_POINTS}.` };
  }
  if (Number(text) > MAX_POINTS) {
    return { error: `${name}: ${shorten(text)} is too high. Points must be from 0 to ${MAX_POINTS}.` };
  }
  return { value: Number(text) };
}

// body = what the form sent. Fields are "round" and "points_<Name>" for each participant.
// Pass fixedRound when editing, so the round number cannot be changed.
function validateRoundForm(body, fixedRound) {
  const errors = [];
  const raw = { round: '', points: {} };
  const safeBody = body && typeof body === 'object' ? body : {};

  let round = fixedRound;
  if (fixedRound === undefined) {
    raw.round = shorten(asText(safeBody.round));
    const parsed = parseRoundNumber(safeBody.round);
    if (parsed.error) errors.push(parsed.error);
    else round = parsed.value;
  }

  const scores = {};
  for (const name of PARTICIPANTS) {
    const field = safeBody[`points_${name}`];
    raw.points[name] = shorten(asText(field));
    const parsed = parsePoints(name, field);
    if (parsed.error) errors.push(parsed.error);
    else scores[name] = parsed.value;
  }

  return { ok: errors.length === 0, errors, round, scores, raw };
}

module.exports = { validateRoundForm, parseRoundNumber, parsePoints };
