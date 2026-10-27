// Reglas puras de los modos de juego del universo Circuitia.
// Sin sockets ni temporizadores: reciben el estado del jugador y devuelven el cambio.

// sync: preguntas a la vez para todos. pace: cada jugador va a su ritmo durante un tiempo.
const MODES = {
  classic: { kind: 'sync', name: 'Arena Neón', solo: true },
  battle: { kind: 'sync', name: 'Coliseo de Glitch', solo: false },
  draw: { kind: 'sync', name: 'Taller de Grafitis', solo: false },
  chips: { kind: 'pace', name: 'Mina de Chips', solo: true },
  race: { kind: 'pace', name: 'Autopista Turbo', solo: true },
  fish: { kind: 'pace', name: 'Mar de Datos', solo: true },
  hack: { kind: 'pace', name: 'Fortaleza Firewall', solo: false },
};

const pickWeighted = (table, rand) => {
  const total = table.reduce((s, t) => s + t.w, 0);
  let r = rand() * total;
  for (const t of table) { r -= t.w; if (r < 0) return t; }
  return table[table.length - 1];
};

// ---------- Mina de Chips ----------

// Tres cápsulas ocultas tras cada acierto. La ganancia base crece con los aciertos para que remontar sea posible.
function rollCapsules(rand, correctCount) {
  const base = 10 + 5 * Math.min(correctCount, 20);
  const table = [
    { w: 22, make: () => ({ type: 'gain', amount: base }) },
    { w: 16, make: () => ({ type: 'gain', amount: base * 2 }) },
    { w: 8, make: () => ({ type: 'gain', amount: base * 3 }) },
    { w: 9, make: () => ({ type: 'pct', pct: 25 }) },
    { w: 5, make: () => ({ type: 'double' }) },
    { w: 9, make: () => ({ type: 'lose', pct: 25 }) },
    { w: 10, make: () => ({ type: 'steal', pct: 20 }) },
    { w: 4, make: () => ({ type: 'swap' }) },
    { w: 8, make: () => ({ type: 'shield' }) },
    { w: 9, make: () => ({ type: 'nothing' }) },
  ];
  return [0, 1, 2].map(() => pickWeighted(table, rand).make());
}

const needsTarget = outcome => outcome.type === 'steal' || outcome.type === 'swap';

// Aplica una cápsula. Para robar o intercambiar hace falta `target`. Devuelve qué pasó para anunciarlo.
function applyCapsule(me, outcome, target = null) {
  const before = me.score;
  switch (outcome.type) {
    case 'gain': me.score += outcome.amount; break;
    case 'pct': me.score += Math.max(1, Math.round(me.score * outcome.pct / 100)); break;
    case 'double': me.score *= 2; break;
    case 'lose': me.score -= Math.round(me.score * outcome.pct / 100); break;
    case 'shield': me.shield = true; break;
    case 'nothing': break;
    case 'steal': {
      if (!target) return { error: 'Elige a quién robar.' };
      if (target.shield) { target.shield = false; return { type: 'blocked', delta: 0 }; }
      const amount = Math.round(target.score * outcome.pct / 100);
      target.score -= amount;
      me.score += amount;
      return { type: 'steal', delta: amount, amount };
    }
    case 'swap': {
      if (!target) return { error: 'Elige con quién intercambiar.' };
      if (target.shield) { target.shield = false; return { type: 'blocked', delta: 0 }; }
      [me.score, target.score] = [target.score, me.score];
      return { type: 'swap', delta: me.score - before };
    }
    default: return { error: 'Cápsula desconocida.' };
  }
  return { type: outcome.type, delta: me.score - before };
}

// ---------- Autopista Turbo ----------

// Cada acierto avanza 1; cada 3 seguidos, turbo +1; cada 5 seguidos, pulso EMP que retrasa al líder.
function raceStep(me, correct, leader) {
  if (!correct) { me.streak = 0; return { moved: 0, boost: false, emp: null }; }
  me.streak++;
  const boost = me.streak % 3 === 0;
  const moved = 1 + (boost ? 1 : 0);
  me.pos += moved;
  let emp = null;
  if (me.streak % 5 === 0 && leader && leader !== me && leader.pos > 0) {
    if (leader.shield) leader.shield = false;
    else { leader.pos -= 1; emp = leader; }
  }
  return { moved, boost, emp };
}

// ---------- Mar de Datos ----------

const FISH = {
  común: { kg: [1, 8], names: ['Pez Tornillo', 'Sardina Byte', 'Boquerón USB', 'Gamba Cable'] },
  raro: { kg: [8, 20], names: ['Pez Disquete', 'Calamar Wifi', 'Medusa LED'] },
  épico: { kg: [20, 45], names: ['Pulpo Procesador', 'Tiburón Láser', 'Mantarraya Radar'] },
  legendario: { kg: [45, 90], names: ['Ballena Servidor', 'Pez Espada Fibra'] },
  mítico: { kg: [90, 150], names: ['Kraken Cuántico'] },
};

// El cebo (1–5) sube con la racha y desplaza las probabilidades hacia peces raros.
function catchFish(rand, lure, frenzy = false) {
  const l = Math.max(1, Math.min(5, lure)) - 1;
  const table = [
    { w: 62 - l * 10, rarity: 'común' },
    { w: 25 + l * 3, rarity: 'raro' },
    { w: 9 + l * 4, rarity: 'épico' },
    { w: 3 + l * 2, rarity: 'legendario' },
    { w: 1 + l, rarity: 'mítico' },
  ];
  const { rarity } = pickWeighted(table, rand);
  const f = FISH[rarity];
  const kg = Math.round(f.kg[0] + rand() * (f.kg[1] - f.kg[0])) * (frenzy ? 2 : 1);
  return { rarity, name: f.names[Math.floor(rand() * f.names.length)], kg };
}

// ---------- Fortaleza Firewall ----------

const PASSWORDS = ['NEÓN', 'BYTE', 'PÍXEL', 'LÁSER', 'TURBO', 'CHIP', 'ROBOT', 'GALAXIA', 'COHETE', 'CÓDIGO', 'PLASMA', 'QUÁSAR', 'VOLTIO', 'ÓRBITA', 'CIRCUITO', 'NÚCLEO'];

function assignPasswords(ids, rand) {
  const pool = [...PASSWORDS];
  const out = {};
  for (const id of ids) {
    if (!pool.length) pool.push(...PASSWORDS);
    out[id] = pool.splice(Math.floor(rand() * pool.length), 1)[0];
  }
  return out;
}

// Minar: 20–50 bits, multiplicado por la racha (hasta x2,25).
const mineBits = (rand, streak) => Math.round((20 + rand() * 30) * (1 + Math.min(streak, 5) * 0.25));

function hackOptions(rand, real) {
  const others = PASSWORDS.filter(p => p !== real);
  const picks = [real];
  while (picks.length < 3) {
    const p = others.splice(Math.floor(rand() * others.length), 1)[0];
    picks.push(p);
  }
  for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }
  return picks;
}

function hackSteal(target) {
  if (target.shield) { target.shield = false; return { blocked: true, amount: 0 }; }
  const amount = Math.max(1, Math.round(target.score * 0.2));
  target.score -= Math.min(target.score, amount);
  return { blocked: false, amount };
}

// ---------- Coliseo ----------

// Pierde una vida quien falla, salvo que fallen todos los vivos (así nadie queda eliminado por una pregunta imposible).
function battleRound(alive, correctIds) {
  const failed = alive.filter(p => !correctIds.has(p.id));
  if (failed.length === alive.length) return { lost: [], eliminated: [] };
  const eliminated = [];
  for (const p of failed) {
    p.lives = Math.max(0, p.lives - 1);
    if (p.lives === 0) { p.eliminated = true; eliminated.push(p.id); }
  }
  return { lost: failed.map(p => p.id), eliminated };
}

// ---------- Colección: acabados de robot ----------

const SKINS = [
  { id: 0, name: 'Estándar', rarity: 'común' },
  { id: 1, name: 'Pastel', rarity: 'común' },
  { id: 2, name: 'Mate', rarity: 'común' },
  { id: 3, name: 'Neón', rarity: 'raro' },
  { id: 4, name: 'Carbono', rarity: 'raro' },
  { id: 5, name: 'Cromo', rarity: 'épico' },
  { id: 6, name: 'Oro', rarity: 'épico' },
  { id: 7, name: 'Holograma', rarity: 'legendario' },
  { id: 8, name: 'Lava', rarity: 'legendario' },
  { id: 9, name: 'Galaxia', rarity: 'mítico' },
  { id: 10, name: 'Glitch', rarity: 'mítico' },
];
const CAPSULE_COST = 100;
const DUPLICATE_REFUND = 30;
const RARITY_ODDS = [{ w: 55, rarity: 'común' }, { w: 28, rarity: 'raro' }, { w: 12, rarity: 'épico' }, { w: 4, rarity: 'legendario' }, { w: 1, rarity: 'mítico' }];

function openCapsule(rand) {
  const { rarity } = pickWeighted(RARITY_ODDS, rand);
  // El acabado estándar lo tiene todo el mundo: no sale en cápsulas.
  const pool = SKINS.filter(s => s.rarity === rarity && s.id !== 0);
  return pool[Math.floor(rand() * pool.length)];
}

// Tuercas por partida según el puesto; jugar siempre da algo.
const tokensForPlace = (place, solo) => (solo ? 15 : [60, 45, 35][place - 1] ?? 25);

module.exports = {
  MODES, rollCapsules, needsTarget, applyCapsule, raceStep, FISH, catchFish, PASSWORDS, assignPasswords, mineBits, hackOptions, hackSteal,
  battleRound, SKINS, CAPSULE_COST, DUPLICATE_REFUND, openCapsule, tokensForPlace,
};
