const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createApp } = require('../src/app');

const LIMITS = { minSeconds: 1, maxSeconds: 60, minDrawSeconds: 1, maxDrawSeconds: 120 };

async function boot(t) {
  const instance = createApp({ dbFile: ':memory:', limits: LIMITS });
  await new Promise(r => instance.server.listen(0, r));
  const base = `http://localhost:${instance.server.address().port}`;
  const clients = [];
  t.after(async () => { clients.forEach(c => c.close()); await instance.close(); });
  const client = (cookie) => {
    const c = connect(base, { transports: ['websocket'], forceNew: true, extraHeaders: cookie ? { cookie } : undefined });
    clients.push(c);
    return c;
  };
  return { base, client, instance };
}

const ask = (socket, event, payload) => new Promise(res => socket.emit(event, payload, res));
const once = (socket, event) => new Promise(res => socket.once(event, res));

test('API: registro, sesión, quiz propio y biblioteca', async t => {
  const { base } = await boot(t);
  const post = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

  assert.equal((await post('/api/register', { username: 'a', password: '12345678' })).status, 400);
  const reg = await post('/api/register', { username: 'Rocio', password: 'clave-segura-1' });
  assert.equal(reg.status, 201);
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  const who = await (await fetch(base + '/api/me', { headers: { cookie } })).json();
  assert.equal(who.user.username, 'Rocio');
  assert.equal((await post('/api/login', { username: 'rocio', password: 'mala' })).status, 401);

  const bad = await post('/api/quizzes', { title: 'x', questions: [{ text: 'p', options: ['a', 'a'], correct: 0 }] }, cookie);
  assert.equal(bad.status, 400);
  const ok = await post('/api/quizzes', { title: 'Mío', category: 'Prueba', isPublic: false, questions: [{ text: '¿2+2?', options: ['3', '4'], correct: 1 }] }, cookie);
  assert.equal(ok.status, 201);
  const { id } = await ok.json();

  const publicList = await (await fetch(base + '/api/quizzes?q=Mío')).json();
  assert.equal(publicList.length, 0, 'un quiz privado no sale en la biblioteca');
  const mine = await (await fetch(base + '/api/quizzes?mine=1', { headers: { cookie } })).json();
  assert.equal(mine.length, 1);
  assert.equal((await fetch(`${base}/api/quizzes/${id}`)).status, 404);
  const detail = await (await fetch(`${base}/api/quizzes/${id}`, { headers: { cookie } })).json();
  assert.equal(detail.questions[0].correct, 1);

  const lib = await (await fetch(base + '/api/quizzes')).json();
  assert.ok(lib.length >= 20);
  const open = await (await fetch(`${base}/api/quizzes/${lib[0].id}`)).json();
  assert.equal('correct' in open.questions[0], false, 'la biblioteca no revela la respuesta');
  assert.equal((await post(`/api/quizzes/${lib[0].id}/duplicate`, {}, cookie)).status, 201);
});

test('partida completa: sala, 10 máx., quiz, poderes y dibujo', async t => {
  const { client, instance } = await boot(t);
  const quizId = instance.db.prepare("SELECT id FROM quizzes WHERE source = 'trivia' LIMIT 1").get().id;

  const host = client();
  const created = await ask(host, 'room:create', { quizId, name: 'Ana', settings: { seconds: 1, drawSeconds: 1, questions: 2, drawEvery: 1 } });
  assert.match(created.room.code, /^[A-Z2-9]{5}$/);
  const code = created.room.code;

  const guest = client();
  const joined = await ask(guest, 'room:join', { code: code.toLowerCase(), name: 'Luis' });
  assert.equal(joined.room.players.length, 2);
  assert.ok((await ask(client(), 'room:join', { code, name: 'Luis' })).error, 'nombre repetido');
  assert.ok((await ask(client(), 'room:join', { code: 'ZZZZZ', name: 'X' })).error, 'sala inexistente');

  assert.ok((await ask(guest, 'game:start', {})).error, 'solo el anfitrión empieza');

  const questionHost = once(host, 'game:question');
  assert.ok((await ask(host, 'game:start', {})).ok);
  const q = await questionHost;
  assert.equal(q.options.length > 1, true);
  assert.equal('correct' in q, false, 'la pregunta no incluye la respuesta');

  const power = await ask(host, 'game:power', { power: 'double' });
  assert.ok(power.ok);
  assert.ok((await ask(host, 'game:power', { power: 'double' })).error);

  const resultP = once(host, 'game:result');
  await ask(host, 'game:answer', { answer: 0 });
  await ask(guest, 'game:answer', { answer: 0 });
  const result = await resultP;
  assert.equal(result.type, 'quiz');
  assert.equal(result.results.length, 2);

  // Siguiente: toca ronda de dibujo (drawEvery = 1).
  const drawStarts = Promise.all([once(host, 'draw:start'), once(guest, 'draw:start')]);
  await ask(host, 'game:next', {});
  const [a, b] = await drawStarts;
  const [drawerStart, guesserStart] = a.role === 'drawer' ? [a, b] : [b, a];
  const [drawerSock, guesserSock] = a.role === 'drawer' ? [host, guest] : [guest, host];
  assert.ok(drawerStart.word);
  assert.equal(guesserStart.word, undefined, 'el que adivina no recibe la palabra');

  const seen = once(guesserSock, 'draw:stroke');
  drawerSock.emit('draw:stroke', { pts: [[0.1, 0.1], [0.5, 0.5]], start: true, color: '#ffffff', size: 4 });
  assert.equal((await seen).pts.length, 2);
  guesserSock.emit('draw:stroke', { pts: [[0.9, 0.9]], start: true });

  assert.ok((await ask(drawerSock, 'draw:guess', { text: drawerStart.word })).error, 'el dibujante no adivina');
  assert.equal((await ask(guesserSock, 'draw:guess', { text: 'zzz-nada' })).correct, false);
  const drawResult = once(host, 'game:result');
  const hit = await ask(guesserSock, 'draw:guess', { text: drawerStart.word.toUpperCase() });
  assert.equal(hit.correct, true);
  const dr = await drawResult;
  assert.equal(dr.type, 'draw');
  assert.equal(dr.word, drawerStart.word);

  // Reconexión con el mismo nombre.
  guest.close();
  await new Promise(r => setTimeout(r, 100));
  const back = client();
  const again = await ask(back, 'room:join', { code, name: 'Luis' });
  assert.equal(again.rejoined, true);
  assert.equal(again.room.players.find(p => p.name === 'Luis').connected, true);

  // Terminar: quedan 1 pregunta de quiz y 1 de dibujo.
  const finished = once(host, 'game:finished');
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 1300));
    await ask(host, 'game:next', {});
    if (instance.manager.get(code).status === 'finished') break;
  }
  const end = await Promise.race([finished, new Promise(r => setTimeout(() => r(null), 6000))]);
  assert.ok(end, 'la partida termina');
  assert.equal(end.ranking[0].place, 1);
  const stats = await (await fetch(`http://localhost:${instance.server.address().port}/api/stats`)).json();
  assert.equal(stats.totals.games, 1);

  assert.ok((await ask(host, 'game:rematch', {})).ok);
  assert.equal(instance.manager.get(code).status, 'lobby');
});

test('la sala admite 10 jugadores y rechaza al 11.º', async t => {
  const { client, instance } = await boot(t);
  const quizId = instance.db.prepare('SELECT id FROM quizzes LIMIT 1').get().id;
  const host = client();
  const { room } = await ask(host, 'room:create', { quizId, name: 'P0' });
  for (let i = 1; i < 10; i++) assert.ok((await ask(client(), 'room:join', { code: room.code, name: `P${i}` })).room);
  const extra = await ask(client(), 'room:join', { code: room.code, name: 'P10' });
  assert.match(extra.error, /completa/);
});

test('modo individual: sin dibujo y avanza solo', async t => {
  const { client, instance } = await boot(t);
  const quizId = instance.db.prepare('SELECT id FROM quizzes LIMIT 1').get().id;
  const sock = client();
  const { room } = await ask(sock, 'room:create', { quizId, name: 'Solo', solo: true, settings: { seconds: 1, questions: 1 } });
  assert.equal(room.settings.drawEvery, 0);
  const done = once(sock, 'game:finished');
  assert.ok((await ask(sock, 'game:start', {})).ok);
  const fin = await Promise.race([done, new Promise(r => setTimeout(() => r(null), 8000))]);
  assert.ok(fin, 'termina sin pulsar siguiente');
});
