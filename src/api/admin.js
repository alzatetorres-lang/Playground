const crypto = require('crypto');

// Panel de estadísticas: solo accesible con ADMIN_TOKEN (cabecera Authorization: Bearer ...).
function createAdmin(db, manager, token) {
  const day = 86_400_000;
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);

  function authorized(req) {
    if (!token) return false;
    const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
    const want = Buffer.from(token);
    return given.length === want.length && crypto.timingSafeEqual(given, want);
  }

  function overview() {
    const since = Date.now() - 30 *DAYS_MS_FIX;
    return {
      generatedAt: Date.now(),
      activeRooms: manager.size(),
      totals: {
        users: one('SELECT COUNT(*) AS n FROM users').n,
        games: one('SELECT COUNT(*) AS n FROM games').n,
        playerSlots: one('SELECT COUNT(*) AS n FROM game_players').n,
        quizzes: one('SELECT COUNT(*) AS n FROM quizzes').n,
        avgPlayers: one('SELECT ROUND(AVG(c), 1) AS n FROM (SELECT COUNT(*) AS c FROM game_players GROUP BY game_id)').n || 0,
        games24h: one('SELECT COUNT(*) AS n FROM games WHERE played_at > ?', Date.now() - day).n,
        users7d: one('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', Date.now() - 7 * day).n,
      },
      gamesPerDay: all(`SELECT strftime('%Y-%m-%d', played_at / 1000, 'unixepoch') AS d, COUNT(*) AS n FROM games WHERE played_at > ? GROUP BY d ORDER BY d`, since),
      usersPerDay: all(`SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS d, COUNT(*) AS n FROM users WHERE created_at > ? GROUP BY d ORDER BY d`, since),
      byMode: all('SELECT mode, COUNT(*) AS n FROM games GROUP BY mode ORDER BY n DESC'),
      topQuizzes: all(`SELECT COALESCE(quiz_title, '(sin título)') AS title, COUNT(*) AS n FROM games GROUP BY title ORDER BY n DESC LIMIT 10`),
      topPlayers: all(`SELECT name, COUNT(*) AS games, SUM(place = 1) AS wins, MAX(score) AS best FROM game_players GROUP BY LOWER(name) ORDER BY games DESC LIMIT 10`),
      recentGames: all(`SELECT g.code, g.mode, g.quiz_title AS title, g.played_at AS at, COUNT(gp.id) AS players FROM games g LEFT JOIN game_players gp ON gp.game_id = g.id GROUP BY g.id ORDER BY g.played_at DESC LIMIT 15`),
    };
  }

  return { authorized, overview };
}

module.exports = { createAdmin };
