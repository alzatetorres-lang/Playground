const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const file = process.env.DB_FILE || path.join(__dirname, '..', '..', 'data', 'playground.sqlite');

function open(dbFile = file) {
  if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass_hash TEXT NOT NULL, salt TEXT NOT NULL, avatar TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY, owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'General',
      is_public INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'user', created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY, quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE, pos INTEGER NOT NULL,
      text TEXT NOT NULL, options TEXT NOT NULL, correct INTEGER NOT NULL, category TEXT, difficulty TEXT, image TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id, pos);
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY, word TEXT NOT NULL, hint TEXT, theme TEXT, difficulty TEXT
    );
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY, code TEXT NOT NULL, mode TEXT NOT NULL, quiz_title TEXT, played_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_players (
      id INTEGER PRIMARY KEY, game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, name TEXT NOT NULL,
      score INTEGER NOT NULL, quiz_correct INTEGER NOT NULL DEFAULT 0, draw_guesses INTEGER NOT NULL DEFAULT 0,
      draw_points INTEGER NOT NULL DEFAULT 0, place INTEGER NOT NULL
    );
  `);
  // Bases creadas antes de que existiera la columna image.
  const cols = db.prepare('PRAGMA table_info(questions)').all().map(c => c.name);
  if (!cols.includes('image')) db.exec('ALTER TABLE questions ADD COLUMN image TEXT');
  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('tokens')) db.exec('ALTER TABLE users ADD COLUMN tokens INTEGER NOT NULL DEFAULT 0');
  if (!userCols.includes('skins')) db.exec("ALTER TABLE users ADD COLUMN skins TEXT NOT NULL DEFAULT '[0]'");
  return db;
}

module.exports = { open };
