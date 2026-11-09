// The only file that talks SQL. Everything else works with plain JavaScript objects,
// so tests can swap this store for an in-memory fake.
const { PARTICIPANTS } = require('./rules');

class RoundExistsError extends Error {}
class RoundNotFoundError extends Error {}

function createPgStore(pool) {
  return {
    // Returns [{ number: 1, scores: { Kaspar: 61, KJ: 92, ... } }, ...] sorted by round number.
    async getRounds() {
      const { rows } = await pool.query(`
        SELECT r.number, p.name, s.points
        FROM rounds r
        LEFT JOIN scores s ON s.round_number = r.number
        LEFT JOIN participants p ON p.id = s.participant_id
        ORDER BY r.number`);
      const byNumber = new Map();
      for (const row of rows) {
        if (!byNumber.has(row.number)) byNumber.set(row.number, { number: row.number, scores: {} });
        if (row.name) byNumber.get(row.number).scores[row.name] = row.points;
      }
      return [...byNumber.values()];
    },

    // Saves a new round with all four scores, or nothing at all (one transaction).
    async createRound(number, scores) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query('INSERT INTO rounds (number) VALUES ($1) ON CONFLICT DO NOTHING', [number]);
        if (inserted.rowCount === 0) throw new RoundExistsError(`Round ${number} already exists.`);
        for (const name of PARTICIPANTS) {
          await client.query(
            'INSERT INTO scores (round_number, participant_id, points) SELECT $1, id, $3 FROM participants WHERE name = $2',
            [number, name, scores[name]]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    // Replaces the four scores of an existing round.
    async updateRound(number, scores) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const exists = await client.query('SELECT 1 FROM rounds WHERE number = $1', [number]);
        if (exists.rowCount === 0) throw new RoundNotFoundError(`Round ${number} does not exist.`);
        for (const name of PARTICIPANTS) {
          await client.query(
            'UPDATE scores SET points = $3, updated_at = now() WHERE round_number = $1 AND participant_id = (SELECT id FROM participants WHERE name = $2)',
            [number, name, scores[name]]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    // Deleting the round also deletes its scores (ON DELETE CASCADE).
    async deleteRound(number) {
      const result = await pool.query('DELETE FROM rounds WHERE number = $1', [number]);
      if (result.rowCount === 0) throw new RoundNotFoundError(`Round ${number} does not exist.`);
    },
  };
}

module.exports = { createPgStore, RoundExistsError, RoundNotFoundError };
