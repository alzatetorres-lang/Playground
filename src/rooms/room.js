const crypto = require('crypto');
const rules = require('./rules');

const DEFAULT_LIMITS = { minSeconds: 10, maxSeconds: 60, minDrawSeconds: 30, maxDrawSeconds: 120 };
const NEXT_TIMEOUT_MS = 45_000;
const SOLO_NEXT_MS = 3500;
const MAX_STROKE_EVENTS = 4000;

const clamp = (n, lo, hi, fallback) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;
};

class Room {
  // emitter: { toRoom(code, event, payload), toPlayer(socketId, event, payload), toRoomExcept(code, socketId, event, payload) }
  constructor({ code, quiz, settings = {}, emitter, nextWord, onFinish = () => {}, limits = {}, rand = Math.random }) {
    this.code = code;
    this.emitter = emitter;
    this.nextWord = nextWord;
    this.onFinish = onFinish;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.rand = rand;
    this.quizSource = quiz;
    this.solo = !!settings.solo;
    this.settings = this.cleanSettings(settings);
    this.players = new Map();
    this.hostId = null;
    this.reset();
    this.createdAt = Date.now();
    this.touchedAt = Date.now();
  }

  cleanSettings(s) {
    const total = this.quizSource.questions.length;
    return {
      seconds: clamp(s.seconds, this.limits.minSeconds, this.limits.maxSeconds, 20),
      drawSeconds: clamp(s.drawSeconds, this.limits.minDrawSeconds, this.limits.maxDrawSeconds, 60),
      questions: clamp(s.questions, 1, Math.max(1, total), Math.min(10, total)),
      drawEvery: this.solo ? 0 : clamp(s.drawEvery, 0, 10, 4),
      solo: this.solo,
    };
  }

  reset() {
    this.status = 'lobby';
    this.plan = [];
    this.planIndex = -1;
    this.questions = [];
    this.answers = new Map();
    this.guessed = new Map();
    this.drawn = [];
    this.usedWords = [];
    this.strokes = [];
    this.drawer = null;
    this.word = null;
    this.endsAt = 0;
    this.timer = null;
    this.nextTimer = null;
    for (const p of this.players.values()) this.resetPlayer(p);
  }

  resetPlayer(p) {
    p.score = 0;
    p.quizCorrect = 0;
    p.drawGuesses = 0;
    p.drawPoints = 0;
    p.powers = { double: true, shield: true, time: true };
    p.doubled = false;
    p.shielded = false;
    p.deadline = 0;
  }

  touch() { this.touchedAt = Date.now(); }

  // ---------- jugadores ----------

  addPlayer({ socketId, name, avatar, userId = null }) {
    const clean = String(name || '').trim().slice(0, 20);
    if (!clean) return { error: 'Escribe un nombre.' };
    const existing = [...this.players.values()].find(p => p.name.toLowerCase() === clean.toLowerCase());
    if (existing) {
      if (existing.connected) return { error: 'Ese nombre ya está en uso en la sala.' };
      existing.socketId = socketId;
      existing.connected = true;
      if (avatar) existing.avatar = rules.sanitizeAvatar(avatar);
      this.touch();
      return { player: existing, rejoined: true };
    }
    if (this.status !== 'lobby') return { error: 'La partida ya ha empezado.' };
    if (this.players.size >= rules.MAX_PLAYERS) return { error: 'La sala está completa (máximo 10).' };
    const player = {
      id: crypto.randomBytes(6).toString('hex'), socketId, name: clean, userId, connected: true,
      avatar: avatar ? rules.sanitizeAvatar(avatar) : rules.randomAvatar(this.rand),
    };
    this.resetPlayer(player);
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
    this.touch();
    return { player };
  }

  playerBySocket(socketId) {
    for (const p of this.players.values()) if (p.socketId === socketId && p.connected) return p;
    return null;
  }

  disconnect(socketId) {
    const p = this.playerBySocket(socketId);
    if (!p) return;
    if (this.status === 'lobby') {
      this.players.delete(p.id);
    } else {
      p.connected = false;
    }
    if (this.hostId === p.id) {
      const next = [...this.players.values()].find(x => x.connected);
      this.hostId = next ? next.id : this.hostId;
    }
    this.touch();
    this.emitRoom();
    // Si el que falta era el último pendiente, la ronda puede cerrarse ya.
    if (this.status === 'question') this.maybeFinishQuiz();
    if (this.status === 'draw') this.maybeFinishDraw();
  }

  changeAvatar(socketId, avatar) {
    const p = this.playerBySocket(socketId);
    if (!p) return;
    p.avatar = rules.sanitizeAvatar(avatar);
    this.emitRoom();
  }

  connectedPlayers() { return [...this.players.values()].filter(p => p.connected); }

  isEmpty() { return this.connectedPlayers().length === 0; }

  // ---------- vistas ----------

  publicPlayer(p) {
    return { id: p.id, name: p.name, avatar: p.avatar, score: p.score, connected: p.connected, powers: p.powers, isHost: p.id === this.hostId };
  }

  view() {
    return {
      code: this.code, status: this.status, title: this.quizSource.title, settings: this.settings, hostId: this.hostId,
      players: [...this.players.values()].map(p => this.publicPlayer(p)),
      round: this.planIndex >= 0 ? { number: this.planIndex + 1, total: this.plan.length, type: this.plan[this.planIndex]?.type } : null,
    };
  }

  ranking() {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ ...this.publicPlayer(p), place: i + 1, quizCorrect: p.quizCorrect, drawGuesses: p.drawGuesses, drawPoints: p.drawPoints }));
  }

  emitRoom() { this.emitter.toRoom(this.code, 'room:update', this.view()); }

  // ---------- flujo ----------

  start(socketId) {
    const host = this.playerBySocket(socketId);
    if (!host || host.id !== this.hostId) return { error: 'Solo el anfitrión puede empezar.' };
    if (this.status !== 'lobby') return { error: 'La partida ya empezó.' };
    const connected = this.connectedPlayers();
    if (connected.length < 1) return { error: 'Hace falta al menos un jugador.' };
    if (!this.solo && connected.length < 2) return { error: 'Hacen falta al menos 2 jugadores.' };

    const pool = [...this.quizSource.questions];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // Copia congelada: editar el quiz después no altera la partida.
    this.questions = pool.slice(0, this.settings.questions).map(q => ({ text: q.text, options: [...q.options], correct: q.correct, image: q.image || null }));
    this.plan = rules.buildPlan(this.questions.length, this.settings.drawEvery, connected.length);
    this.planIndex = -1;
    this.startedAt = Date.now();
    this.advance();
    return { ok: true };
  }

  advance() {
    clearTimeout(this.nextTimer);
    this.planIndex++;
    if (this.planIndex >= this.plan.length) return this.finishGame();
    const step = this.plan[this.planIndex];
    if (step.type === 'draw') return this.startDraw();
    this.startQuiz();
  }

  quizNumber() { return this.plan.slice(0, this.planIndex + 1).filter(s => s.type === 'quiz').length; }

  // ---------- quiz ----------

  startQuiz() {
    const step = this.plan[this.planIndex];
    const q = this.questions[step.index];
    this.status = 'question';
    this.answers.clear();
    const secs = this.settings.seconds;
    this.endsAt = Date.now() + secs * 1000;
    for (const p of this.players.values()) { p.doubled = false; p.shielded = false; p.deadline = this.endsAt; }
    this.emitRoom();
    this.emitter.toRoom(this.code, 'game:question', {
      number: this.quizNumber(), total: this.questions.length, text: q.text, options: q.options, image: q.image || null, endsAt: this.endsAt, seconds: secs, now: Date.now(),
    });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.finishQuiz(), secs * 1000 + 50);
  }

  answer(socketId, choice) {
    const p = this.playerBySocket(socketId);
    if (!p || this.status !== 'question' || this.answers.has(p.id)) return { error: 'No se puede responder ahora.' };
    const now = Date.now();
    if (now > p.deadline + 300) return { error: 'Se acabó tu tiempo.' };
    const answer = Number(choice);
    if (!Number.isInteger(answer) || answer < 0 || answer >= this.questions[this.plan[this.planIndex].index].options.length) return { error: 'Respuesta no válida.' };
    this.answers.set(p.id, { answer, at: now });
    this.emitter.toRoom(this.code, 'game:answered', { id: p.id, count: this.answers.size, total: this.connectedPlayers().length });
    this.maybeFinishQuiz();
    return { ok: true };
  }

  usePower(socketId, power) {
    const p = this.playerBySocket(socketId);
    if (!p) return { error: 'No estás en la sala.' };
    const res = rules.usePower(this, p, power);
    if (res.error) return res;
    this.emitter.toRoom(this.code, 'game:power', { ...res, byName: p.name });
    for (const id of res.targets || []) {
      const t = this.players.get(id);
      if (t) this.emitter.toPlayer(t.socketId, 'game:deadline', { deadline: t.deadline, now: Date.now() });
    }
    this.emitRoom();
    return { ok: true };
  }

  maybeFinishQuiz() {
    const connected = this.connectedPlayers();
    if (connected.length && connected.every(p => this.answers.has(p.id))) this.finishQuiz();
  }

  finishQuiz() {
    if (this.status !== 'question') return;
    clearTimeout(this.timer);
    const q = this.questions[this.plan[this.planIndex].index];
    const totalMs = this.settings.seconds * 1000;
    const results = [];
    for (const p of this.players.values()) {
      const a = this.answers.get(p.id);
      const correct = !!a && a.answer === q.correct;
      const breakdown = rules.scoreAnswer({ correct, remainingMs: a ? this.endsAt - a.at : 0, totalMs, doubled: p.doubled });
      p.score += breakdown.total;
      if (correct) p.quizCorrect++;
      results.push({ id: p.id, name: p.name, answer: a ? a.answer : null, correct, points: breakdown.total, breakdown, score: p.score, doubled: p.doubled });
      p.doubled = false;
      p.shielded = false;
    }
    this.status = 'result';
    results.sort((a, b) => b.score - a.score);
    this.emitRoom();
    this.emitter.toRoom(this.code, 'game:result', { type: 'quiz', correct: q.correct, results, ranking: this.ranking(), hasNext: this.planIndex + 1 < this.plan.length });
    this.scheduleNext();
  }

  scheduleNext() {
    clearTimeout(this.nextTimer);
    this.nextTimer = setTimeout(() => this.advance(), this.solo ? SOLO_NEXT_MS : NEXT_TIMEOUT_MS);
  }

  next(socketId) {
    const p = this.playerBySocket(socketId);
    if (!p || p.id !== this.hostId) return { error: 'Solo el anfitrión avanza.' };
    if (this.status !== 'result' && this.status !== 'drawresult') return { error: 'Aún no toca.' };
    this.advance();
    return { ok: true };
  }

  // ---------- dibujo ----------

  startDraw() {
    const connected = this.connectedPlayers();
    if (connected.length < 2) return this.advance();
    const { drawer, alreadyDrew } = rules.pickDrawer(connected.map(p => p.id), this.drawn, this.rand);
    this.drawn = alreadyDrew;
    const entry = this.nextWord(this.usedWords);
    this.usedWords.push(entry.word);
    this.drawer = drawer;
    this.word = entry;
    this.status = 'draw';
    this.strokes = [];
    this.guessed.clear();
    const secs = this.settings.drawSeconds;
    this.endsAt = Date.now() + secs * 1000;
    this.emitRoom();
    const base = { now: Date.now(), drawerId: drawer, theme: entry.theme || null, seconds: secs, endsAt: this.endsAt, length: rules.normalizeWord(entry.word).length, words: entry.word.split(/\s+/).map(w => w.length) };
    for (const p of connected) {
      this.emitter.toPlayer(p.socketId, 'draw:start', { ...base, role: p.id === drawer ? 'drawer' : 'guesser', word: p.id === drawer ? entry.word : undefined });
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.finishDraw(), secs * 1000 + 50);
  }

  stroke(socketId, data) {
    const p = this.playerBySocket(socketId);
    if (!p || this.status !== 'draw' || p.id !== this.drawer) return;
    const pts = Array.isArray(data?.pts) ? data.pts.slice(0, 64).filter(pt => Array.isArray(pt) && pt.length === 2).map(([x, y]) => [Math.min(1, Math.max(0, +x || 0)), Math.min(1, Math.max(0, +y || 0))]) : [];
    if (!pts.length) return;
    const clean = {
      pts, start: !!data.start,
      color: /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : '#ffffff',
      size: clamp(data.size, 1, 40, 6),
    };
    if (this.strokes.length < MAX_STROKE_EVENTS) this.strokes.push(clean);
    this.emitter.toRoomExcept(this.code, socketId, 'draw:stroke', clean);
  }

  clearCanvas(socketId) {
    const p = this.playerBySocket(socketId);
    if (!p || this.status !== 'draw' || p.id !== this.drawer) return;
    this.strokes = [];
    this.emitter.toRoomExcept(this.code, socketId, 'draw:clear', {});
  }

  guess(socketId, text) {
    const p = this.playerBySocket(socketId);
    if (!p || this.status !== 'draw' || p.id === this.drawer || this.guessed.has(p.id)) return { error: 'No puedes adivinar ahora.' };
    const guess = String(text || '').slice(0, 60);
    if (!guess.trim()) return { error: 'Escribe algo.' };
    if (rules.isCorrectGuess(guess, this.word.word)) {
      const points = rules.scoreGuess({ remainingMs: this.endsAt - Date.now(), totalMs: this.settings.drawSeconds * 1000 });
      this.guessed.set(p.id, points);
      p.score += points;
      p.drawGuesses++;
      p.drawPoints += points;
      const drawer = this.players.get(this.drawer);
      if (drawer) { drawer.score += rules.DRAWER_POINTS_PER_GUESS; drawer.drawPoints += rules.DRAWER_POINTS_PER_GUESS; }
      this.emitter.toRoom(this.code, 'draw:correct', { id: p.id, name: p.name, points, count: this.guessed.size });
      this.emitRoom();
      this.maybeFinishDraw();
      return { ok: true, correct: true };
    }
    this.emitter.toRoom(this.code, 'draw:chat', { id: p.id, name: p.name, text: guess });
    return { ok: true, correct: false };
  }

  maybeFinishDraw() {
    const guessers = this.connectedPlayers().filter(p => p.id !== this.drawer);
    const drawerHere = this.players.get(this.drawer)?.connected;
    if (!drawerHere || !guessers.length || guessers.every(p => this.guessed.has(p.id))) this.finishDraw();
  }

  finishDraw() {
    if (this.status !== 'draw') return;
    clearTimeout(this.timer);
    this.status = 'drawresult';
    const results = [...this.players.values()].filter(p => p.id !== this.drawer).map(p => ({ id: p.id, name: p.name, guessed: this.guessed.has(p.id), points: this.guessed.get(p.id) || 0 }));
    this.emitRoom();
    this.emitter.toRoom(this.code, 'game:result', {
      type: 'draw', word: this.word.word, drawerId: this.drawer, results, ranking: this.ranking(), hasNext: this.planIndex + 1 < this.plan.length,
    });
    this.scheduleNext();
  }

  // ---------- final ----------

  finishGame() {
    clearTimeout(this.timer);
    clearTimeout(this.nextTimer);
    this.status = 'finished';
    const ranking = this.ranking();
    this.emitRoom();
    this.emitter.toRoom(this.code, 'game:finished', { ranking });
    try { this.onFinish(this, ranking); } catch (e) { console.error('No se pudo guardar la partida:', e.message); }
  }

  rematch(socketId) {
    const p = this.playerBySocket(socketId);
    if (!p || p.id !== this.hostId) return { error: 'Solo el anfitrión propone revancha.' };
    if (this.status !== 'finished') return { error: 'La partida no ha terminado.' };
    for (const x of [...this.players.values()]) if (!x.connected) this.players.delete(x.id);
    this.reset();
    this.emitRoom();
    this.emitter.toRoom(this.code, 'game:rematch', {});
    return { ok: true };
  }

  // Estado completo para quien se reconecta a mitad de partida.
  snapshotFor(player) {
    const out = { room: this.view(), you: player.id };
    if (this.status === 'question') {
      const q = this.questions[this.plan[this.planIndex].index];
      out.question = { number: this.quizNumber(), total: this.questions.length, text: q.text, options: q.options, image: q.image || null, endsAt: player.deadline || this.endsAt, seconds: this.settings.seconds, now: Date.now(), answered: this.answers.has(player.id) };
    }
    if (this.status === 'draw') {
      out.draw = {
        drawerId: this.drawer, role: player.id === this.drawer ? 'drawer' : 'guesser', word: player.id === this.drawer ? this.word.word : undefined,
        theme: this.word.theme || null, seconds: this.settings.drawSeconds, endsAt: this.endsAt, now: Date.now(),
        length: rules.normalizeWord(this.word.word).length, words: this.word.word.split(/\s+/).map(w => w.length),
        strokes: this.strokes, guessed: this.guessed.has(player.id),
      };
    }
    return out;
  }

  destroy() {
    clearTimeout(this.timer);
    clearTimeout(this.nextTimer);
  }
}

module.exports = { Room };
