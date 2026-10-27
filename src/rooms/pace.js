const M = require('./modes');

const STANDINGS_THROTTLE_MS = 400;
const FRENZY_EVERY_MS = 45_000;
const FRENZY_MS = 15_000;

// Partida a ritmo propio: cada jugador avanza por sus preguntas durante un tiempo fijo.
// Todo lo que da puntos se decide aquí; el cliente solo pide preguntas y elige.
class PaceGame {
  constructor(room) {
    this.room = room;
    this.mode = room.settings.mode;
    this.rand = room.rand;
    this.state = new Map();
    this.frenzyUntil = 0;
    this.timers = [];
    this.lastStandings = 0;
    this.standingsTimer = null;
    this.ended = false;
  }

  emit(event, payload) { this.room.emitter.toRoom(this.room.code, event, payload); }
  toPlayer(p, event, payload) { this.room.emitter.toPlayer(p.socketId, event, payload); }

  st(p) {
    if (!this.state.has(p.id)) {
      const order = this.room.questions.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      this.state.set(p.id, { order, cursor: 0, current: null, awaiting: null, capsules: null, pending: null, canHack: false, hackTarget: null, hackOptions: null, streak: 0, lure: 1, correct: 0, answered: 0 });
    }
    return this.state.get(p.id);
  }

  start() {
    const players = [...this.room.players.values()];
    for (const p of players) { p.score = 0; p.pos = 0; p.shield = false; this.st(p); }
    if (this.mode === 'hack') this.passwords = M.assignPasswords(players.map(p => p.id), this.rand);
    const duration = this.room.settings.duration * 1000;
    this.endsAt = Date.now() + duration;
    this.room.status = 'pace';
    this.room.endsAt = this.endsAt;
    this.room.emitRoom();
    for (const p of players) if (p.connected) this.toPlayer(p, 'pace:start', this.startInfo(p));
    this.pushStandings(true);
    this.timers.push(setTimeout(() => this.end(), duration + 50));
    if (this.mode === 'fish') this.timers.push(setInterval(() => this.maybeFrenzy(), FRENZY_EVERY_MS));
  }

  startInfo(p) {
    return { mode: this.mode, endsAt: this.endsAt, now: Date.now(), goal: this.mode === 'race' ? this.room.settings.goal : null, password: this.passwords?.[p.id] || null, frenzyUntil: this.frenzyUntil };
  }

  maybeFrenzy() {
    if (this.ended) return;
    this.frenzyUntil = Date.now() + FRENZY_MS;
    this.emit('pace:event', { kind: 'frenzy', until: this.frenzyUntil, now: Date.now(), text: '¡Frenesí! Las capturas pesan el doble durante 15 s.' });
  }

  // ---------- preguntas ----------

  next(p) {
    if (this.ended) return { error: 'La partida terminó.' };
    const s = this.st(p);
    if (s.awaiting && s.awaiting !== 'hackchoice') return { error: 'Termina primero lo que tienes pendiente.' };
    if (s.awaiting === 'answer' && s.current != null) return { question: this.questionPayload(s) };
    s.current = s.order[s.cursor % s.order.length];
    s.cursor++;
    s.awaiting = 'answer';
    s.canHack = false;
    return { question: this.questionPayload(s) };
  }

  questionPayload(s) {
    const q = this.room.questions[s.current];
    return { n: s.answered + 1, text: q.text, options: q.options, image: q.image || null };
  }

  answer(p, choice) {
    if (this.ended) return { error: 'La partida terminó.' };
    const s = this.st(p);
    if (s.awaiting !== 'answer') return { error: 'Pide una pregunta primero.' };
    const q = this.room.questions[s.current];
    const answer = Number(choice);
    if (!Number.isInteger(answer) || answer < 0 || answer >= q.options.length) return { error: 'Respuesta no válida.' };
    const correct = answer === q.correct;
    s.answered++;
    s.awaiting = null;
    const out = { correct, correctIndex: q.correct };
    if (correct) { s.correct++; p.quizCorrect++; }

    if (this.mode === 'chips') {
      s.streak = correct ? s.streak + 1 : 0;
      if (correct) { s.capsules = M.rollCapsules(this.rand, s.correct); s.awaiting = 'capsule'; out.capsules = 3; }
    } else if (this.mode === 'race') {
      const leader = this.leader(p);
      const me = { pos: p.pos, streak: s.streak };
      const res = M.raceStep(me, correct, leader);
      p.pos = me.pos; s.streak = me.streak;
      if (res.emp) this.emit('pace:event', { kind: 'emp', by: p.id, target: leader.id, text: `${p.name} lanzó un pulso EMP a ${leader.name}` });
      p.score = p.pos;
      Object.assign(out, { pos: p.pos, moved: res.moved, boost: res.boost, goal: this.room.settings.goal });
      if (p.pos >= this.room.settings.goal) { this.pushStandings(true); this.end(p); return out; }
    } else if (this.mode === 'fish') {
      if (correct) {
        const fish = M.catchFish(this.rand, s.lure, Date.now() < this.frenzyUntil);
        p.score += fish.kg;
        s.streak++;
        out.fish = fish;
        if (fish.rarity === 'legendario' || fish.rarity === 'mítico') this.emit('pace:event', { kind: 'fish', by: p.id, text: `${p.name} pescó ${fish.name} (${fish.kg} kg)` });
        s.lure = Math.min(5, 1 + Math.floor(s.streak / 2));
      } else { s.streak = 0; s.lure = 1; }
      out.lure = s.lure;
    } else if (this.mode === 'hack') {
      if (correct) {
        const mined = M.mineBits(this.rand, s.streak);
        s.streak++;
        p.score += mined;
        s.canHack = true;
        s.awaiting = 'hackchoice';
        out.mined = mined;
      } else s.streak = 0;
    }
    out.streak = s.streak;
    out.score = p.score;
    this.pushStandings();
    return out;
  }

  leader(except) {
    let best = null;
    for (const x of this.room.players.values()) if (x !== except && (!best || x.pos > best.pos)) best = x;
    return best;
  }

  // ---------- Mina de Chips ----------

  pick(p, index) {
    const s = this.st(p);
    if (this.mode !== 'chips' || s.awaiting !== 'capsule') return { error: 'No hay cápsulas que abrir.' };
    const i = Number(index);
    if (![0, 1, 2].includes(i)) return { error: 'Cápsula no válida.' };
    const outcome = s.capsules[i];
    const reveal = s.capsules;
    s.capsules = null;
    if (M.needsTarget(outcome)) {
      const victims = [...this.room.players.values()].filter(x => x.id !== p.id);
      if (!victims.length) { s.awaiting = null; return { outcomes: reveal, picked: i, result: { type: 'nothing', delta: 0 } }; }
      s.pending = outcome;
      s.awaiting = 'target';
      return { outcomes: reveal, picked: i, needsTarget: true, targets: victims.map(v => ({ id: v.id, name: v.name, score: v.score, avatar: v.avatar })) };
    }
    s.awaiting = null;
    const result = M.applyCapsule(p, outcome);
    if (outcome.type === 'double' || outcome.type === 'shield') this.emit('pace:event', { kind: outcome.type, by: p.id, text: outcome.type === 'double' ? `${p.name} duplicó sus chips` : `${p.name} activó un escudo` });
    this.pushStandings();
    return { outcomes: reveal, picked: i, result, score: p.score };
  }

  target(p, targetId) {
    const s = this.st(p);
    if (this.mode !== 'chips' || s.awaiting !== 'target') return { error: 'No hay nada pendiente.' };
    const t = this.room.players.get(targetId);
    if (!t || t.id === p.id) return { error: 'Elige a otro jugador.' };
    const result = M.applyCapsule(p, s.pending, t);
    if (result.error) return result;
    const kind = s.pending.type;
    s.pending = null;
    s.awaiting = null;
    const text = result.type === 'blocked' ? `El escudo de ${t.name} bloqueó a ${p.name}` : kind === 'steal' ? `${p.name} robó ${result.amount} chips a ${t.name}` : `${p.name} intercambió sus chips con ${t.name}`;
    this.emit('pace:event', { kind: result.type, by: p.id, target: t.id, text });
    this.pushStandings();
    return { result, score: p.score };
  }

  // ---------- Fortaleza Firewall ----------

  hackBegin(p, targetId) {
    const s = this.st(p);
    if (this.mode !== 'hack' || !s.canHack) return { error: 'Acierta una pregunta para poder hackear.' };
    const t = this.room.players.get(targetId);
    if (!t || t.id === p.id) return { error: 'Elige a otro jugador.' };
    s.canHack = false;
    s.awaiting = 'hackguess';
    s.hackTarget = t.id;
    s.hackOptions = M.hackOptions(this.rand, this.passwords[t.id]);
    if (t.connected) this.toPlayer(t, 'pace:event', { kind: 'hacking', by: p.id, text: `${p.name} está intentando hackearte` });
    return { options: s.hackOptions };
  }

  hackGuess(p, password) {
    const s = this.st(p);
    if (this.mode !== 'hack' || s.awaiting !== 'hackguess') return { error: 'No estás hackeando a nadie.' };
    const t = this.room.players.get(s.hackTarget);
    s.awaiting = null;
    const options = s.hackOptions;
    s.hackTarget = null; s.hackOptions = null;
    if (!t || !options.includes(password)) return { error: 'Contraseña no válida.' };
    if (password !== this.passwords[t.id]) return { ok: false, score: p.score };
    const res = M.hackSteal(t);
    p.score += res.amount;
    this.emit('pace:event', { kind: res.blocked ? 'blocked' : 'hack', by: p.id, target: t.id, text: res.blocked ? `El firewall de ${t.name} resistió` : `${p.name} hackeó ${res.amount} bits a ${t.name}` });
    this.pushStandings();
    return { ok: true, stolen: res.amount, blocked: res.blocked, score: p.score };
  }

  // ---------- marcador y final ----------

  standings() {
    return [...this.room.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score, pos: p.pos || 0, shield: !!p.shield, streak: this.st(p).streak, connected: p.connected }))
      .sort((a, b) => b.score - a.score);
  }

  pushStandings(force = false) {
    const send = () => { this.lastStandings = Date.now(); this.standingsTimer = null; this.emit('pace:standings', { players: this.standings(), endsAt: this.endsAt, now: Date.now(), goal: this.mode === 'race' ? this.room.settings.goal : null }); };
    if (force) { clearTimeout(this.standingsTimer); return send(); }
    if (this.standingsTimer) return;
    const wait = Math.max(0, STANDINGS_THROTTLE_MS - (Date.now() - this.lastStandings));
    this.standingsTimer = setTimeout(send, wait);
  }

  snapshot(p) {
    const s = this.st(p);
    return {
      ...this.startInfo(p), standings: this.standings(), streak: s.streak, lure: s.lure, awaiting: s.awaiting,
      question: s.awaiting === 'answer' ? this.questionPayload(s) : null, canHack: s.canHack,
    };
  }

  end(winner = null) {
    if (this.ended) return;
    this.ended = true;
    this.destroy();
    // En la carrera gana quien llega a la meta aunque otro tenga la misma posición.
    if (winner) winner.first = true;
    this.room.finishGame();
  }

  destroy() {
    for (const t of this.timers) { clearTimeout(t); clearInterval(t); }
    clearTimeout(this.standingsTimer);
    this.timers = [];
  }
}

module.exports = { PaceGame };
