const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/rooms/modes');

const seq = values => { let i = 0; return () => values[i++ % values.length]; };

test('Mina: robar, intercambiar y escudo', () => {
  const me = { score: 100 }, them = { score: 200 };
  assert.deepEqual(M.applyCapsule(me, { type: 'steal', pct: 20 }, them), { type: 'steal', delta: 40, amount: 40 });
  assert.equal(me.score, 140); assert.equal(them.score, 160);
  them.shield = true;
  assert.equal(M.applyCapsule(me, { type: 'swap' }, them).type, 'blocked');
  assert.equal(them.shield, false, 'el escudo se gasta');
  M.applyCapsule(me, { type: 'swap' }, them);
  assert.deepEqual([me.score, them.score], [160, 140]);
  assert.ok(M.applyCapsule(me, { type: 'steal', pct: 20 }).error, 'robar exige objetivo');
  M.applyCapsule(me, { type: 'double' }); assert.equal(me.score, 320);
  M.applyCapsule(me, { type: 'lose', pct: 25 }); assert.equal(me.score, 240);
  assert.equal(M.rollCapsules(Math.random, 3).length, 3);
});

test('Turbo: avance, turbo cada 3 y EMP al líder cada 5', () => {
  const me = { pos: 0, streak: 0 }, leader = { pos: 10 };
  const moves = [1, 2, 3, 4, 5].map(() => M.raceStep(me, true, leader));
  assert.deepEqual(moves.map(m => m.moved), [1, 1, 2, 1, 1]);
  assert.equal(me.pos, 6);
  assert.equal(moves[4].emp, leader); assert.equal(leader.pos, 9);
  M.raceStep(me, false, leader); assert.equal(me.streak, 0);
});

test('Mar: el cebo alto pesca más raro y el frenesí dobla el peso', () => {
  const avg = lure => { let kg = 0; for (let i = 0; i < 4000; i++) kg += M.catchFish(Math.random, lure).kg; return kg / 4000; };
  assert.ok(avg(5) > avg(1) * 1.3);
  const r = seq([0.0001, 0.5, 0]);
  const normal = M.catchFish(r, 1, false);
  const r2 = seq([0.0001, 0.5, 0]);
  assert.equal(M.catchFish(r2, 1, true).kg, normal.kg * 2);
});

test('Firewall: contraseñas distintas, 3 opciones con la buena y robo del 20 %', () => {
  const pw = M.assignPasswords(['a', 'b', 'c'], Math.random);
  assert.equal(new Set(Object.values(pw)).size, 3);
  const opts = M.hackOptions(Math.random, pw.a);
  assert.equal(opts.length, 3); assert.ok(opts.includes(pw.a)); assert.equal(new Set(opts).size, 3);
  const t = { score: 500 };
  assert.deepEqual(M.hackSteal(t), { blocked: false, amount: 100 }); assert.equal(t.score, 400);
});

test('Coliseo: fallar quita vida, pero si fallan todos nadie pierde', () => {
  const a = { id: 'a', lives: 1 }, b = { id: 'b', lives: 3 };
  assert.deepEqual(M.battleRound([a, b], new Set()), { lost: [], eliminated: [] });
  const res = M.battleRound([a, b], new Set(['b']));
  assert.deepEqual(res.eliminated, ['a']); assert.equal(a.eliminated, true);
});

test('Cápsulas: rarezas según probabilidad y tuercas por puesto', () => {
  const counts = {};
  for (let i = 0; i < 20000; i++) { const s = M.openCapsule(Math.random); counts[s.rarity] = (counts[s.rarity] || 0) + 1; }
  assert.ok(counts['común'] > counts['raro'] && counts['raro'] > counts['épico'] && counts['épico'] > counts['legendario']);
  assert.ok(counts['mítico'] > 0 && counts['mítico'] < 600);
  assert.equal(M.tokensForPlace(1, false), 60); assert.equal(M.tokensForPlace(7, false), 25); assert.equal(M.tokensForPlace(1, true), 15);
});
