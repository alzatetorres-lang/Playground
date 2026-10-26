function createStats(db) {
  const insGame = db.prepare('INSERT INTO games (code, mode, quiz_title, played_at) VALUES (?, ?, ?, ?)');
  const insPlayer = db.prepare('INSERT INTO game_players (game_id, user_id, name, score, quiz_correct, draw_guesses, draw_points, place) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

  function saveGame(room, ranking) {
    db.exec('BEGIN');
    try {
      const { lastInsertRowid } = insGame.run(room.code, room.solo ? 'solo' : 'live', room.quizSource.title, Date.now());
      for (const r of ranking) {
        const p = room.players.get(r.id);
        insPlayer.run(lastInsertRowid, p?.userId ?? null, r.name, r.score, r.quizCorrect, r.drawGuesses, r.drawPoints, r.place);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  function overview(userId = null) {
    const rows = sql => db.prepare(sql);
    const bestGames = rows(`SELECT gp.name, gp.score, g.quiz_title AS quiz, g.played_at AS at FROM game_players gp JOIN games g ON g.id = gp.game_id WHERE g.mode = 'live' ORDER BY gp.score DESC LIMIT 10`).all();
    const topDrawers = rows(`SELECT name, SUM(draw_guesses) AS guesses, SUM(draw_points) AS points FROM game_players GROUP BY LOWER(name) HAVING points > 0 ORDER BY points DESC LIMIT 10`).all();
    const wins = rows(`SELECT name, COUNT(*) AS wins FROM game_players gp JOIN games g ON g.id = gp.game_id WHERE gp.place = 1 AND g.mode = 'live' GROUP BY LOWER(name) ORDER BY wins DESC LIMIT 10`).all();
    const totals = rows('SELECT COUNT(*) AS games FROM games').get();
    const out = { totals: { games: totals.games }, bestGames, topDrawers, wins, me: null };
    if (userId != null) {
      out.me = rows(`SELECT COUNT(*) AS games, COALESCE(MAX(score),0) AS best, COALESCE(SUM(quiz_correct),0) AS correct,
        COALESCE(SUM(draw_guesses),0) AS guesses, COALESCE(SUM(draw_points),0) AS drawPoints, COALESCE(SUM(place = 1),0) AS wins
        FROM game_players WHERE user_id = ?`).get(userId);
    }
    return JSON.parse(JSON.stringify(out));
  }

  return { saveGame, overview };
}

module.exports = { createStats };
