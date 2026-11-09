// Small helpers for the shared edit password.
const crypto = require('crypto');

// Compares passwords in constant time, so response timing reveals nothing.
// Both sides are hashed first so they always have the same length.
function passwordMatches(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || expected === '') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// After login the user is sent back to the page they wanted. Only local paths are allowed,
// so nobody can build a login link that redirects to another website.
function safeNext(value) {
  if (typeof value !== 'string' || value.length > 200) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  return value;
}

// Remembers wrong passwords per IP address (in memory) to slow down guessing.
function createLoginGuard({ maxFailures = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const failures = new Map(); // ip -> { count, since }

  function current(ip) {
    const entry = failures.get(ip);
    if (entry && Date.now() - entry.since > windowMs) {
      failures.delete(ip);
      return undefined;
    }
    return entry;
  }

  return {
    isBlocked(ip) {
      const entry = current(ip);
      return Boolean(entry && entry.count >= maxFailures);
    },
    fail(ip) {
      const entry = current(ip) || { count: 0, since: Date.now() };
      entry.count += 1;
      failures.set(ip, entry);
    },
    reset(ip) {
      failures.delete(ip);
    },
  };
}

module.exports = { passwordMatches, safeNext, createLoginGuard };
