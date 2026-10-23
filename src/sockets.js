const { createManager } = require('./rooms/manager');
const rules = require('./rooms/rules');
const M = require('./rooms/modes');

// Límite por socket: evita que un cliente inunde el servidor.
function bucket(max, windowMs) {
  let hits = [];
  return () => {
    const now = Date.now();
    hits = hits.filter(t => now - t < windowMs);
    hits.push(now);
    return hits.length <= max;
  };
}

function attachSockets(io, { auth, quizzes, stats, db, limits }) {
  const emitter = {
    toRoom: (code, event, payload) => io.to(code).emit(event, payload),
    toPlayer: (socketId, event, payload) => io.to(socketId).emit(event, payload),
    toRoomExcept: (code, socketId, event, payload) => io.to(code).except(socketId).emit(event, payload),
  };

  const pickWord = db.prepare('SELECT word, theme FROM words ORDER BY RANDOM() LIMIT 40');
  function nextWord(used) {
    const candidates = pickWord.all();
    return candidates.find(w => !used.includes(w.word)) || candidates[0] || { word: 'Casa', theme: 'Objetos' };
  }

  // Al terminar: estadísticas y tuercas para quien tiene cuenta.
  function onFinish(room, ranking) {
    stats.saveGame(room, ranking);
    for (const r of ranking) {
      const p = room.players.get(r.id);
      if (!p?.userId) continue;
      const tokens = M.tokensForPlace(r.place, room.solo);
      auth.addTokens(p.userId, tokens);
      if (p.connected) emitter.toPlayer(p.socketId, 'game:reward', { tokens, total: auth.getCollection(p.userId)?.tokens ?? 0 });
    }
  }
  const manager = createManager({ emitter, nextWord, onFinish, limits });

  // Un acabado que no es tuyo se cambia por el estándar.
  const ownAvatar = (user, avatar) => {
    if (!avatar) return avatar;
    const a = rules.sanitizeAvatar(avatar);
    if (a.skin && !(user && auth.getCollection(user.id)?.skins.includes(a.skin))) a.skin = 0;
    return a;
  };

  io.use((socket, next) => {
    socket.data.user = auth.userFromCookieHeader(socket.handshake.headers.cookie);
    next();
  });

  io.on('connection', socket => {
    const strokeLimit = bucket(120, 1000);
    const guessLimit = bucket(5, 2000);
    const generalLimit = bucket(40, 2000);
    const roomOf = () => manager.get(socket.data.code);
    const reply = (done, payload) => typeof done === 'function' && done(payload);

    function enter(room, { name, avatar }, done) {
      const user = socket.data.user;
      const res = room.addPlayer({ socketId: socket.id, name: name || user?.username, avatar: ownAvatar(user, avatar), userId: user?.id ?? null });
      if (res.error) return reply(done, { error: res.error });
      socket.data.code = room.code;
      socket.join(room.code);
      room.emitRoom();
      const snapshot = room.snapshotFor(res.player);
      reply(done, { ...snapshot, rejoined: !!res.rejoined });
    }

    socket.on('room:create', ({ quizId, settings, name, avatar, solo } = {}, done) => {
      if (!generalLimit()) return reply(done, { error: 'Vas demasiado rápido.' });
      const quiz = quizzes.load(Number(quizId));
      if (!quiz || (!quiz.isPublic && quiz.ownerId !== socket.data.user?.id)) return reply(done, { error: 'Quiz no encontrado.' });
      if (roomOf()) socket.leave(socket.data.code);
      const res = manager.create({ quiz, settings: { ...(settings || {}), solo: !!solo } });
      if (res.error) return reply(done, res);
      enter(res.room, { name, avatar }, done);
    });

    socket.on('room:join', ({ code, name, avatar } = {}, done) => {
      if (!generalLimit()) return reply(done, { error: 'Vas demasiado rápido.' });
      const room = manager.get(code);
      if (!room) return reply(done, { error: 'No existe esa sala.' });
      if (room.solo) return reply(done, { error: 'Esa partida es individual.' });
      enter(room, { name, avatar }, done);
    });

    socket.on('room:leave', () => {
      const room = roomOf();
      if (!room) return;
      room.disconnect(socket.id);
      socket.leave(room.code);
      socket.data.code = null;
    });

    socket.on('avatar:change', avatar => roomOf()?.changeAvatar(socket.id, ownAvatar(socket.data.user, avatar)));

    socket.on('game:start', (_p, done) => reply(done, roomOf()?.start(socket.id) || { error: 'No estás en una sala.' }));
    socket.on('game:answer', ({ answer } = {}, done) => reply(done, roomOf()?.answer(socket.id, answer) || { error: 'No estás en una sala.' }));
    socket.on('game:power', ({ power } = {}, done) => reply(done, roomOf()?.usePower(socket.id, power) || { error: 'No estás en una sala.' }));
    socket.on('game:next', (_p, done) => reply(done, roomOf()?.next(socket.id) || { error: 'No estás en una sala.' }));
    socket.on('game:rematch', (_p, done) => reply(done, roomOf()?.rematch(socket.id) || { error: 'No estás en una sala.' }));

    const pace = (event, action, map = () => []) => socket.on(event, (payload = {}, done) => {
      if (!generalLimit()) return reply(done, { error: 'Vas demasiado rápido.' });
      reply(done, roomOf()?.paceAction(socket.id, action, ...map(payload || {})) || { error: 'No estás en una sala.' });
    });
    pace('pace:next', 'next');
    pace('pace:answer', 'answer', p => [p.answer]);
    pace('chips:pick', 'pick', p => [p.index]);
    pace('chips:target', 'target', p => [p.target]);
    pace('hack:begin', 'hackBegin', p => [p.target]);
    pace('hack:guess', 'hackGuess', p => [p.password]);

    socket.on('draw:stroke', data => { if (strokeLimit()) roomOf()?.stroke(socket.id, data); });
    socket.on('draw:clear', () => roomOf()?.clearCanvas(socket.id));
    socket.on('draw:guess', ({ text } = {}, done) => {
      if (!guessLimit()) return reply(done, { error: 'Más despacio.' });
      reply(done, roomOf()?.guess(socket.id, text) || { error: 'No estás en una sala.' });
    });

    socket.on('disconnect', () => roomOf()?.disconnect(socket.id));
  });

  return manager;
}

module.exports = { attachSockets };
