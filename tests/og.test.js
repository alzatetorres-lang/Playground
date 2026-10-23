const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

test('vista previa: etiquetas Open Graph absolutas y enlace de invitación por sala', async t => {
  const app = createApp({ dbFile: ':memory:' });
  await new Promise(r => app.server.listen(0, r));
  const base = `http://localhost:${app.server.address().port}`;
  t.after(() => app.close());
  const home = await (await fetch(base + '/')).text();
  assert.match(home, new RegExp(`<meta property="og:image" content="${base}/og/cover.jpg">`));
  assert.match(home, /og:title" content="Playground · Salva Circuitia"/);
  assert.doesNotMatch(home, /%[A-Z]+%/, 'no quedan marcadores sin sustituir');
  const inv = await (await fetch(base + '/j/abcde')).text();
  assert.match(inv, /Únete a mi sala ABCDE/);
  assert.match(inv, /http-equiv="refresh" content="0;url=\/#\/join\/ABCDE"/);
  const bad = await fetch(base + '/j/%3Cx%3E', { redirect: 'manual' });
  assert.equal(bad.status, 302);
  assert.equal((await fetch(base + '/og/cover.jpg')).headers.get('content-type'), 'image/jpeg');
  const quiz = app.db.prepare('SELECT * FROM quizzes LIMIT 1').get();
  const { room } = app.manager.create({ quiz: { ...quiz, questions: [{ text: 'p', options: ['a', 'b'], correct: 0 }] }, settings: { mode: 'fish' } });
  const live = await (await fetch(`${base}/j/${room.code}`)).text();
  assert.match(live, new RegExp(`og:image" content="${base}/img/worlds/fish.jpg"`));
  assert.match(live, /og:image:width" content="1280"/);
  assert.match(live, /Mar de Datos/);
});
