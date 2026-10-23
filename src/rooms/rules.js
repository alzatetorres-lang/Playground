// Reglas puras del juego: sin sockets ni temporizadores, fáciles de probar.

const MAX_PLAYERS = 10;
const BASE_POINTS = 100;
const SPEED_MAX = 100;
const TIME_STEAL_MS = 5000;

// Normaliza para comparar palabras sin importar mayúsculas, tildes ni espacios.
function normalizeWord(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCorrectGuess(guess, word) {
  const g = normalizeWord(guess);
  return g.length > 0 && g === normalizeWord(word);
}

// Puntos de una pregunta de quiz: base + rapidez, con desglose.
function scoreAnswer({ correct, remainingMs, totalMs, doubled }) {
  if (!correct) return { total: 0, base: 0, speed: 0, multiplier: 1 };
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const speed = Math.round(SPEED_MAX * ratio);
  const multiplier = doubled ? 2 : 1;
  return { total: (BASE_POINTS + speed) * multiplier, base: BASE_POINTS, speed, multiplier };
}

// Puntos de quien adivina el dibujo: más cuanto antes acierta.
function scoreGuess({ remainingMs, totalMs }) {
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  return 50 + Math.round(150 * ratio);
}

const DRAWER_POINTS_PER_GUESS = 40;

// Elige al dibujante al azar sin repetir hasta que todos hayan dibujado.
function pickDrawer(playerIds, alreadyDrew, rand = Math.random) {
  if (!playerIds.length) return { drawer: null, alreadyDrew: [] };
  let pool = playerIds.filter(id => !alreadyDrew.includes(id));
  let drew = alreadyDrew.filter(id => playerIds.includes(id));
  if (!pool.length) { pool = [...playerIds]; drew = []; }
  const drawer = pool[Math.floor(rand() * pool.length)];
  return { drawer, alreadyDrew: [...drew, drawer] };
}

// Mezcla rondas de quiz con rondas de dibujo: una de dibujo cada `drawEvery` preguntas.
function buildPlan(questionCount, drawEvery, playerCount) {
  const plan = [];
  for (let i = 0; i < questionCount; i++) {
    plan.push({ type: 'quiz', index: i });
    const last = i === questionCount - 1;
    if (drawEvery > 0 && playerCount >= 2 && (i + 1) % drawEvery === 0 && !last) plan.push({ type: 'draw' });
  }
  // Siempre cerramos con una ronda de dibujo si el grupo es de 2 o más y hay alguna configurada.
  if (drawEvery > 0 && playerCount >= 2) plan.push({ type: 'draw' });
  return plan;
}

// Aplica un poder. Devuelve el efecto para anunciarlo antes de que cuente.
// Poderes: double (doble apuesta), shield (escudo), time (robo de tiempo).
function usePower(room, player, power) {
  if (!['double', 'shield', 'time'].includes(power)) return { error: 'Poder desconocido.' };
  if (!player.powers[power]) return { error: 'Ya usaste ese poder.' };
  if (room.status !== 'question') return { error: 'Los poderes solo se usan durante una pregunta.' };
  if (room.answers.has(player.id)) return { error: 'Ya respondiste esta pregunta.' };

  if (power === 'double') {
    player.powers.double = false;
    player.doubled = true;
    return { power, by: player.id, targets: [], blocked: [] };
  }
  if (power === 'shield') {
    player.powers.shield = false;
    player.shielded = true;
    return { power, by: player.id, targets: [], blocked: [] };
  }
  player.powers.time = false;
  const targets = [];
  const blocked = [];
  for (const other of room.players.values()) {
    if (other.id === player.id || !other.connected || room.answers.has(other.id)) continue;
    if (other.shielded) { other.shielded = false; blocked.push(other.id); continue; }
    other.deadline = Math.max(Date.now() + 1500, other.deadline - TIME_STEAL_MS);
    targets.push(other.id);
  }
  return { power, by: player.id, targets, blocked, ms: TIME_STEAL_MS };
}

function sanitizeAvatar(a) {
  const pick = (v, max) => (Number.isInteger(v) && v >= 0 && v < max ? v : 0);
  const src = a && typeof a === 'object' ? a : {};
  return { body: pick(src.body, 5), eyes: pick(src.eyes, 5), antenna: pick(src.antenna, 5), mouth: pick(src.mouth, 4), accessory: pick(src.accessory, 6), color: pick(src.color, 8) };
}

function randomAvatar(rand = Math.random) {
  const r = max => Math.floor(rand() * max);
  return { body: r(5), eyes: r(5), antenna: r(5), mouth: r(4), accessory: r(6), color: r(8) };
}

module.exports = {
  MAX_PLAYERS, BASE_POINTS, TIME_STEAL_MS, DRAWER_POINTS_PER_GUESS,
  normalizeWord, isCorrectGuess, scoreAnswer, scoreGuess, pickDrawer, buildPlan, usePower, sanitizeAvatar, randomAvatar,
};
