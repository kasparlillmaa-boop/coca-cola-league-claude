// An in-memory stand-in for the database store, used by the tests.
// It follows the same rules as the real store (src/store.js).
const { RoundExistsError, RoundNotFoundError } = require('../src/store');

function createFakeStore(initial = []) {
  const rounds = new Map(initial.map((r) => [r.number, { number: r.number, scores: { ...r.scores } }]));
  return {
    async getRounds() {
      return [...rounds.values()].sort((a, b) => a.number - b.number).map((r) => ({ number: r.number, scores: { ...r.scores } }));
    },
    async createRound(number, scores) {
      if (rounds.has(number)) throw new RoundExistsError(`Round ${number} already exists.`);
      rounds.set(number, { number, scores: { ...scores } });
    },
    async updateRound(number, scores) {
      if (!rounds.has(number)) throw new RoundNotFoundError(`Round ${number} does not exist.`);
      rounds.set(number, { number, scores: { ...scores } });
    },
    async deleteRound(number) {
      if (!rounds.delete(number)) throw new RoundNotFoundError(`Round ${number} does not exist.`);
    },
  };
}

module.exports = { createFakeStore };
