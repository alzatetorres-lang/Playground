const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../src/rooms/rules');
const { fromBank } = require('../src/db/seed');

test('normalizeWord ignora tildes, mayúsculas y signos', () => {
  assert.equal(r.normalizeWord('  ÁTOMO!! '), 'atomo');
  assert.ok(r.isCorrectGuess('torre   EIFFEL', 'Torre Eiffel'));
  assert.ok(!r.isCorrectGuess('', ''));
  assert.ok(!r.isCorrectGuess('torre', 'Torre Eiffel'));
});

test('isCloseGuess avisa de errores de una letra, no de acierto ni de lejos', () => {
  assert.ok(r.isCloseGuess('elefanta', 'Elefante'));
  assert.ok(r.isCloseGuess('pinguino', 'Pingüino') === false, 'sin tilde es acierto, no casi');
  assert.ok(r.isCorrectGuess('pinguino', 'Pingüino'));
  assert.ok(r.isCorrectGuess('CAMALEON', 'Camaleón'));
  assert.ok(!r.isCloseGuess('perro', 'Elefante'));
  assert.ok(!r.isCloseGuess('sol', 'sal'), 'palabras cortas no avisan');
});

test('scoreAnswer: base + rapidez, doble apuesta y fallo', () => {
  assert.deepEqual(r.scoreAnswer({ correct: true, remainingMs: 10000, totalMs: 10000, doubled: false }), { total: 200, base: 100, speed: 100, multiplier: 1 });
  assert.equal(r.scoreAnswer({ correct: true, remainingMs: 0, totalMs: 10000, doubled: false }).total, 100);
  assert.equal(r.scoreAnswer({ correct: true, remainingMs: 5000, totalMs: 10000, doubled: true }).total, 300);
  assert.equal(r.scoreAnswer({ correct: false, remainingMs: 9000, totalMs: 10000, doubled: true }).total, 0);
});

test('scoreGuess crece con el tiempo restante', () => {
  assert.ok(r.scoreGuess({ remainingMs: 50000, totalMs: 60000 }) > r.scoreGuess({ remainingMs: 5000, totalMs: 60000 }));
  assert.equal(r.scoreGuess({ remainingMs: 0, totalMs: 60000 }), 50);
});

test('pickDrawer no repite hasta que todos dibujan', () => {
  const ids = ['a', 'b', 'c'];
  let drew = [];
  const seen = [];
  for (let i = 0; i < 3; i++) {
    const res = r.pickDrawer(ids, drew);
    seen.push(res.drawer);
    drew = res.alreadyDrew;
  }
  assert.deepEqual([...seen].sort(), ['a', 'b', 'c']);
  const again = r.pickDrawer(ids, drew);
  assert.ok(ids.includes(again.drawer));
  assert.deepEqual(again.alreadyDrew, [again.drawer]);
});

test('buildPlan intercala dibujo y cierra con dibujo', () => {
  const plan = r.buildPlan(8, 4, 3);
  assert.deepEqual(plan.map(p => p.type).join(''), 'quizquizquizquizdrawquizquizquizquizdraw');
  assert.equal(r.buildPlan(5, 0, 3).every(p => p.type === 'quiz'), true);
  assert.equal(r.buildPlan(5, 2, 1).every(p => p.type === 'quiz'), true);
});

function fakeRoom(players) {
  return { status: 'question', answers: new Map(), players: new Map(players.map(p => [p.id, p])) };
}
const mk = id => ({ id, connected: true, powers: { double: true, shield: true, time: true }, deadline: Date.now() + 20000, shielded: false, doubled: false });

test('doble apuesta se gasta una vez', () => {
  const a = mk('a');
  const room = fakeRoom([a]);
  assert.equal(r.usePower(room, a, 'double').power, 'double');
  assert.equal(a.doubled, true);
  assert.ok(r.usePower(room, a, 'double').error);
});

test('robo de tiempo recorta a los demás y el escudo lo bloquea', () => {
  const a = mk('a'), b = mk('b'), c = mk('c');
  c.shielded = true;
  const room = fakeRoom([a, b, c]);
  const before = b.deadline;
  const res = r.usePower(room, a, 'time');
  assert.deepEqual(res.targets, ['b']);
  assert.deepEqual(res.blocked, ['c']);
  assert.equal(b.deadline, before - r.TIME_STEAL_MS);
  assert.equal(c.shielded, false);
});

test('los poderes no valen fuera de pregunta ni tras responder', () => {
  const a = mk('a');
  const room = fakeRoom([a]);
  room.status = 'lobby';
  assert.ok(r.usePower(room, a, 'shield').error);
  room.status = 'question';
  room.answers.set('a', {});
  assert.ok(r.usePower(room, a, 'shield').error);
});

test('sanitizeAvatar descarta valores fuera de rango', () => {
  assert.deepEqual(r.sanitizeAvatar({ body: 99, eyes: 'x', antenna: 2 }), { body: 0, eyes: 0, antenna: 2, mouth: 0, accessory: 0, color: 0, skin: 0 });
  assert.deepEqual(r.sanitizeAvatar(null), { body: 0, eyes: 0, antenna: 0, mouth: 0, accessory: 0, color: 0, skin: 0 });
});

test('fromBank: trivia con imagen y concepto de Kahoot', () => {
  const identity = () => 0.9999;
  const trivia = fromBank({ tema: 'Varias', dificultad: 'Fácil', kahoot: { pregunta: '¿Qué flor?', categoria_origen: 'Naturaleza', opciones: ['a', 'b', 'c', 'd'], respuesta_correcta: 'b', url_imagen: 'kahoot_images/trivia_q6.jpg' } }, identity);
  assert.equal(trivia.text, '¿Qué flor?');
  assert.equal(trivia.category, 'Naturaleza');
  assert.equal(trivia.image, '/img/questions/trivia_q6.jpg');
  assert.equal(trivia.options[trivia.correct], 'b');
  const concept = fromBank({ tema: 'Geografía', dificultad: 'Media', concepto: 'X', pictionary: { solucion: 'X' }, kahoot: { imagen_pista: 'Torre de hierro.', opciones: ['a', 'b', 'c', 'X'], respuesta_correcta: 'X' } });
  assert.match(concept.text, /^Torre de hierro\./);
  assert.equal(concept.image, null);
  assert.equal(fromBank({ tema: 'T', kahoot: { pregunta: 'p', opciones: ['a'], respuesta_correcta: 'z' } }), null);
});
