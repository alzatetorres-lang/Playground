const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createApp } = require('../src/app');

const ask = (s, e, p) => new Promise(r => s.emit(e, p, r));
const once = (s, e) => new Promise(r => s.once(e, r));
const LIMITS = { minSeconds: 1, countdownMs: 30, minDuration: 1, minDrawSeconds: 1 };

async function setup(t, mode, settings = {}, players = 2) {
  const app = createApp({ dbFile: ':memory:', limits: LIMITS });
  await new Promise(r => app.server.listen(0, r));
  const url = `http://localhost:${app.server.address().port}`;
  const socks = [];
  t.after(async () => { socks.forEach(s => s.close()); await app.close(); });
  const mk = () => { const s = connect(url, { transports: ['websocket'], forceNew: true }); socks.push(s); return s; };
  const quizId = app.db.prepare("SELECT id FROM quizzes WHERE source = 'trivia' LIMIT 1").get().id;
  const host = mk();
  const { room } = await ask(host, 'room:create', { quizId, name: 'P0', solo: players === 1, settings: { mode, ...settings } });
  const all = [host];
  for (let i = 1; i < players; i++) { const s = mk(); await ask(s, 'room:join', { code: room.code, name: `P${i}` }); all.push(s); }
  const started = Promise.all(all.map(s => once(s, 'pace:start')));
  assert.ok((await ask(host, 'game:start')).ok);
  return { app, room: app.manager.get(room.code), socks: all, info: await started };
}

// Responde la pregunta actual bien o mal usando la respuesta guardada en el servidor (solo en tests).
async function play(room, sock, correct) {
  const { question } = await ask(sock, 'pace:next');
  assert.ok(question && !('correct' in question), 'la pregunta no revela la respuesta');
  const p = [...room.players.values()].find(x => x.socketId === sock.id);
  const st = room.pace.st(p);
  const right = room.questions[st.current].correct;
  return ask(sock, 'pace:answer', { answer: correct ? right : (right + 1) % room.questions[st.current].options.length });
}

test('Mina de Chips: cápsulas, objetivo y final por tiempo', async t => {
  const { room, socks } = await setup(t, 'chips', { duration: 2 });
  const [a] = socks;
  const wrong = await play(room, a, false);
  assert.equal(wrong.correct, false); assert.equal(wrong.capsules, undefined);
  const res = await play(room, a, true);
  assert.equal(res.capsules, 3);
  assert.ok((await ask(a, 'pace:next')).error, 'no hay pregunta nueva sin abrir cápsula');
  const p0 = room.pace.st([...room.players.values()][0]);
  p0.capsules = [{ type: 'steal', pct: 20 }, { type: 'gain', amount: 10 }, { type: 'nothing' }];
  [...room.players.values()][1].score = 100;
  const pick = await ask(a, 'chips:pick', { index: 0 });
  assert.equal(pick.needsTarget, true); assert.equal(pick.outcomes.length, 3);
  const target = pick.targets[0].id;
  const done = await ask(a, 'chips:target', { target });
  assert.equal(done.result.amount, 20);
  const fin = await Promise.race([once(a, 'game:finished'), new Promise(r => setTimeout(() => r(null), 4000))]);
  assert.ok(fin, 'termina al acabar el tiempo'); assert.equal(fin.ranking[0].name, 'P1');
});

test('Autopista Turbo: termina al llegar a la meta', async t => {
  const { room, socks } = await setup(t, 'race', { duration: 120, goal: 5 });
  const [a] = socks;
  const finished = once(a, 'game:finished');
  let last;
  for (let i = 0; i < 5 && room.status === 'pace'; i++) last = await play(room, a, true);
  assert.ok(last.pos >= 5);
  const fin = await finished;
  assert.equal(fin.ranking[0].name, 'P0');
});

test('Mar de Datos: pescar suma kilos y fallar resetea el cebo', async t => {
  const { room, socks } = await setup(t, 'fish', { duration: 120 }, 1);
  const [a] = socks;
  const r1 = await play(room, a, true);
  assert.ok(r1.fish.kg > 0); assert.equal(r1.score, r1.fish.kg);
  await play(room, a, true);
  const r3 = await play(room, a, false);
  assert.equal(r3.lure, 1);
});

test('Fortaleza Firewall: minar y hackear con la contraseña correcta', async t => {
  const { room, socks, info } = await setup(t, 'hack', { duration: 120 });
  const [a, b] = socks;
  assert.ok(info[0].password && info[1].password && info[0].password !== info[1].password);
  assert.ok((await ask(a, 'hack:begin', { target: 'x' })).error, 'sin acertar no se hackea');
  const victim = [...room.players.values()][1];
  victim.score = 300;
  const mined = await play(room, a, true);
  assert.ok(mined.mined > 0);
  const { options } = await ask(a, 'hack:begin', { target: victim.id });
  assert.ok(options.includes(info[1].password));
  const hit = await ask(a, 'hack:guess', { password: info[1].password });
  assert.equal(hit.ok, true); assert.equal(hit.stolen, 60); assert.equal(victim.score, 240);
});

test('Coliseo: los que fallan pierden vidas y el superviviente gana', async t => {
  const app = createApp({ dbFile: ':memory:', limits: LIMITS });
  await new Promise(r => app.server.listen(0, r));
  const url = `http://localhost:${app.server.address().port}`;
  const a = connect(url, { transports: ['websocket'], forceNew: true }), b = connect(url, { transports: ['websocket'], forceNew: true });
  t.after(async () => { a.close(); b.close(); await app.close(); });
  const quizId = app.db.prepare("SELECT id FROM quizzes WHERE source = 'trivia' LIMIT 1").get().id;
  const { room: r } = await ask(a, 'room:create', { quizId, name: 'A', settings: { mode: 'battle', seconds: 1, questions: 9 } });
  await ask(b, 'room:join', { code: r.code, name: 'B' });
  const room = app.manager.get(r.code);
  const finished = once(a, 'game:finished');
  await ask(a, 'game:start');
  for (let round = 0; round < 3; round++) {
    await once(a, 'game:question');
    const q = room.questions[room.plan[room.planIndex].index];
    const res = once(a, 'game:result');
    await ask(a, 'game:answer', { answer: q.correct });
    await ask(b, 'game:answer', { answer: (q.correct + 1) % q.options.length });
    const out = await res;
    assert.equal(out.results.find(x => x.name === 'B').lives, 2 - round);
    if (round < 2) await ask(a, 'game:next');
  }
  const fin = await finished.catch(() => null) || await Promise.race([finished, new Promise(rs => setTimeout(rs, 100))]);
  await ask(a, 'game:next');
  const end = await finished;
  assert.equal(end.ranking[0].name, 'A');
  assert.equal(end.ranking[1].eliminated, true);
  void fin;
});

test('Colección: tuercas por partida, cápsula y acabado ajeno ignorado', async t => {
  const app = createApp({ dbFile: ':memory:', limits: LIMITS });
  await new Promise(r => app.server.listen(0, r));
  const base = `http://localhost:${app.server.address().port}`;
  t.after(() => app.close());
  const reg = await fetch(base + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'Coleccionista', password: 'clave-segura-9' }) });
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  const get = () => fetch(base + '/api/collection', { headers: { cookie } }).then(r => r.json());
  assert.equal((await get()).tokens, 0);
  const poor = await fetch(base + '/api/capsule', { method: 'POST', headers: { cookie } });
  assert.equal(poor.status, 400);
  app.db.prepare('UPDATE users SET tokens = 250').run();
  const open = await (await fetch(base + '/api/capsule', { method: 'POST', headers: { cookie } })).json();
  assert.ok(open.skin && open.tokens <= 150);
  const after = await get();
  assert.ok(after.skins.includes(open.skin.id));
  const save = await (await fetch(base + '/api/avatar', { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ skin: 10 }) })).json();
  assert.equal(save.avatar.skin, after.skins.includes(10) ? 10 : 0);
});
