const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createApp } = require('../src/app');

const ask = (s, e, p) => new Promise(r => s.emit(e, p, r));
const once = (s, e) => new Promise(r => s.once(e, r));

test('cada ronda empieza con cuenta atrás y la pregunta no se ve antes', async t => {
  const app = createApp({ dbFile: ':memory:', limits: { minSeconds: 1, countdownMs: 300 } });
  await new Promise(r => app.server.listen(0, r));
  const sock = connect(`http://localhost:${app.server.address().port}`, { transports: ['websocket'], forceNew: true });
  t.after(async () => { sock.close(); await app.close(); });
  const quizId = app.db.prepare('SELECT id FROM quizzes LIMIT 1').get().id;
  const { room } = await ask(sock, 'room:create', { quizId, name: 'Solo', solo: true, settings: { seconds: 1, questions: 2 } });

  let sawQuestion = false;
  sock.on('game:question', () => { sawQuestion = true; });
  const cd = once(sock, 'game:countdown');
  await ask(sock, 'game:start', {});
  const info = await cd;
  assert.equal(info.type, 'quiz');
  assert.equal(info.number, 1);
  assert.equal(app.manager.get(room.code).status, 'countdown');
  await new Promise(r => setTimeout(r, 150));
  assert.equal(sawQuestion, false, 'la pregunta no aparece durante la cuenta atrás');
  assert.ok((await ask(sock, 'game:answer', { answer: 0 })).error, 'no se responde en la cuenta atrás');
  const q = await once(sock, 'game:question');
  assert.ok(q.text);
  const second = once(sock, 'game:countdown');
  assert.equal((await second).number, 2, 'la siguiente ronda también cuenta atrás');
});
