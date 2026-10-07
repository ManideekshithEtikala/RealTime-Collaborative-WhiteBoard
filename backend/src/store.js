const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

class RoomStore {
  constructor(config) {
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(config.dataDir, 'whiteboard.sqlite'));
    try {
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS rooms (
          session_id TEXT PRIMARY KEY,
          state TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS rooms_updated_at ON rooms(updated_at);
      `);
      this.write = this.db.prepare(`INSERT INTO rooms (session_id, state, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`);
      this.touchStatement = this.db.prepare('UPDATE rooms SET updated_at = ? WHERE session_id = ?');
      this.deleteStatement = this.db.prepare('DELETE FROM rooms WHERE session_id = ?');
      this.db.prepare('DELETE FROM rooms WHERE updated_at < ?').run(Date.now() - config.roomTtlMs);
      this.config = config;
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  load() {
    const rows = this.db.prepare('SELECT session_id, state, updated_at FROM rooms LIMIT ?')
      .all(this.config.maxRooms + 1);
    if (rows.length > this.config.maxRooms) throw new Error('Persisted room count exceeds MAX_ROOMS');
    return rows.map((row) => {
      const state = JSON.parse(row.state);
      if (!Array.isArray(state.lines) || !Array.isArray(state.redo) || !Array.isArray(state.messages)) {
        throw new Error(`Invalid persisted room: ${row.session_id}`);
      }
      state.seen ||= [...state.lines, ...state.redo].map(({ id, userId }) => ({ id, userId }));
      if (!Array.isArray(state.seen)) throw new Error(`Invalid persisted drawing IDs: ${row.session_id}`);
      return { sessionId: row.session_id, ...state, updatedAt: row.updated_at };
    });
  }

  save(sessionId, state, now) {
    this.write.run(sessionId, JSON.stringify(state), now);
  }

  touch(sessionId, now) {
    this.touchStatement.run(now, sessionId);
  }

  delete(sessionId) {
    this.deleteStatement.run(sessionId);
  }

  close() {
    this.db.close();
  }
}

module.exports = { RoomStore };
