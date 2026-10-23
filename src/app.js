const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { open } = require('./db');
const { seed } = require('./db/seed');
const { createAuth, createLimiter } = require('./auth');
const { createQuizStore, validateQuiz } = require('./api/quizzes');
const { createStats } = require('./api/stats');
const { attachSockets } = require('./sockets');
const rules = require('./rooms/rules');
const M = require('./rooms/modes');

function createApp({ dbFile, secureCookie = false, limits, publicOrigin = process.env.PUBLIC_ORIGIN } = {}) {
  const db = open(dbFile);
  seed(db);
  const auth = createAuth(db, { secureCookie });
  const quizzes = createQuizStore(db);
  const stats = createStats(db);
  const authLimit = createLimiter({ max: 10, windowMs: 60_000 });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  const server = http.createServer(app);
  const io = new Server(server, { cors: publicOrigin ? { origin: publicOrigin, credentials: true } : undefined, maxHttpBufferSize: 50_000 });
  const manager = attachSockets(io, { auth, quizzes, stats, db, limits });

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:; script-src 'self'; media-src 'self' blob:; frame-ancestors 'none'");
    next();
  });
  app.use(express.json({ limit: '200kb' }));

  const me = req => auth.userFromCookieHeader(req.headers.cookie);
  const requireUser = (req, res, next) => {
    const user = me(req);
    if (!user) return res.status(401).json({ error: 'Inicia sesión primero.' });
    req.user = user;
    next();
  };
  const publicUser = u => u && { id: u.id, username: u.username, avatar: u.avatar ? JSON.parse(u.avatar) : null };

  // index.html con etiquetas Open Graph absolutas (WhatsApp y otras apps no aceptan rutas relativas).
  const indexFile = path.join(__dirname, '..', 'public', 'index.html');
  let indexTpl = null;
  const escAttr = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function sendIndex(req, res, { title, desc, url, image = null, extra = '' } = {}) {
    if (!indexTpl || process.env.NODE_ENV !== 'production') indexTpl = require('fs').readFileSync(indexFile, 'utf8');
    const origin = publicOrigin || `${req.protocol}://${req.get('host')}`;
    const t = title || 'Playground · Salva Circuitia';
    const d = desc || 'Quiz y dibujo en directo para jugar en grupo: 7 mundos, 7 modos de juego y hasta 10 jugadores desde el móvil. Gratis y sin instalar nada.';
    // La invitación usa la ilustración del mundo de la sala (1280x720); la portada, la imagen general (1200x630).
    let tpl = indexTpl.replaceAll('%ORIGIN%/og/cover.jpg', escAttr(origin + (image || '/og/cover.jpg')));
    if (image) tpl = tpl.replace('og:image:width" content="1200"', 'og:image:width" content="1280"').replace('og:image:height" content="630"', 'og:image:height" content="720"');
    const html = tpl.replaceAll('%ORIGIN%', escAttr(origin)).replaceAll('%URL%', escAttr(url || origin + '/'))
      .replaceAll('%TITLE%', escAttr(t)).replaceAll('%PAGETITLE%', escAttr(t)).replaceAll('%DESC%', escAttr(d)).replace('%EXTRA%', extra);
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  }
  app.get(['/', '/index.html'], (req, res) => sendIndex(req, res));

  // Enlace de invitación: la vista previa lleva el código y abre la sala al entrar.
  app.get('/j/:code', (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    if (!/^[A-Z2-9]{5}$/.test(code)) return res.redirect('/');
    const room = manager.get(code);
    const origin = publicOrigin || `${req.protocol}://${req.get('host')}`;
    const mode = room ? M.MODES[room.settings.mode]?.name : null;
    sendIndex(req, res, {
      title: `Únete a mi sala ${code} en Playground`,
      desc: room ? `${mode} · ${room.quizSource.title}. ${room.players.size}/10 jugadores. Entra con el código ${code} y elige tu robot.` : `Entra con el código ${code}, elige tu robot y salva Circuitia con tus amigos.`,
      url: `${origin}/j/${code}`,
      image: room ? `/img/worlds/${room.settings.mode}.jpg` : null,
      extra: `<meta http-equiv="refresh" content="0;url=/#/join/${code}">`,
    });
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: manager.size() }));

  app.get('/api/me', (req, res) => {
    const user = publicUser(me(req));
    res.json({ user: user && { ...user, ...auth.getCollection(user.id) } });
  });

  app.post('/api/register', (req, res) => {
    if (!authLimit(req.ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' });
    const result = auth.register({ ...req.body, avatar: rules.sanitizeAvatar(req.body?.avatar) });
    if (result.error) return res.status(400).json({ error: result.error });
    auth.setCookie(res, result.token);
    res.status(201).json({ user: publicUser(result.user) });
  });

  app.post('/api/login', (req, res) => {
    if (!authLimit(req.ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' });
    const result = auth.login(req.body || {});
    if (result.error) return res.status(401).json({ error: result.error });
    auth.setCookie(res, result.token);
    res.json({ user: publicUser(result.user) });
  });

  app.post('/api/logout', (req, res) => {
    auth.logout(req.headers.cookie);
    auth.clearCookie(res);
    res.json({ ok: true });
  });

  app.put('/api/avatar', requireUser, (req, res) => {
    const avatar = rules.sanitizeAvatar(req.body);
    // Solo se puede llevar un acabado que esté en tu colección.
    if (!auth.getCollection(req.user.id).skins.includes(avatar.skin)) avatar.skin = 0;
    auth.saveAvatar(req.user.id, avatar);
    res.json({ avatar });
  });

  app.get('/api/collection', requireUser, (req, res) => res.json({ ...auth.getCollection(req.user.id), catalog: M.SKINS, cost: M.CAPSULE_COST, refund: M.DUPLICATE_REFUND }));

  app.post('/api/capsule', requireUser, (req, res) => {
    const result = auth.buyCapsule(req.user.id, { cost: M.CAPSULE_COST, refund: M.DUPLICATE_REFUND, open: () => M.openCapsule(Math.random) });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  app.get('/api/categories', (_req, res) => res.json(quizzes.categories()));

  app.get('/api/quizzes', (req, res) => {
    const user = me(req);
    const mine = req.query.mine === '1';
    if (mine && !user) return res.status(401).json({ error: 'Inicia sesión primero.' });
    res.json(quizzes.list({
      userId: user?.id ?? null, mine, text: String(req.query.q || '').slice(0, 60), category: String(req.query.category || '').slice(0, 40),
      limit: Number(req.query.limit) || 60, offset: Number(req.query.offset) || 0,
    }));
  });

  app.get('/api/quizzes/:id', (req, res) => {
    const user = me(req);
    const quiz = quizzes.load(Number(req.params.id));
    if (!quiz || (!quiz.isPublic && quiz.ownerId !== user?.id)) return res.status(404).json({ error: 'Quiz no encontrado.' });
    const owner = user?.id === quiz.ownerId;
    // Las respuestas correctas solo las ve su autor.
    res.json({ ...quiz, questions: quiz.questions.map(q => (owner ? q : { text: q.text, options: q.options, image: q.image })), mine: owner });
  });

  app.post('/api/quizzes', requireUser, (req, res) => {
    const { quiz, error } = validateQuiz(req.body);
    if (error) return res.status(400).json({ error });
    res.status(201).json({ id: quizzes.create(req.user.id, quiz) });
  });

  app.put('/api/quizzes/:id', requireUser, (req, res) => {
    const current = quizzes.load(Number(req.params.id));
    if (!current || current.ownerId !== req.user.id) return res.status(404).json({ error: 'Quiz no encontrado.' });
    const { quiz, error } = validateQuiz(req.body);
    if (error) return res.status(400).json({ error });
    quizzes.replace(current.id, quiz);
    res.json({ id: current.id });
  });

  app.delete('/api/quizzes/:id', requireUser, (req, res) => {
    const current = quizzes.load(Number(req.params.id));
    if (!current || current.ownerId !== req.user.id) return res.status(404).json({ error: 'Quiz no encontrado.' });
    quizzes.remove(current.id);
    res.json({ ok: true });
  });

  app.post('/api/quizzes/:id/duplicate', requireUser, (req, res) => {
    const src = quizzes.load(Number(req.params.id));
    if (!src || (!src.isPublic && src.ownerId !== req.user.id)) return res.status(404).json({ error: 'Quiz no encontrado.' });
    const id = quizzes.create(req.user.id, { ...src, title: `${src.title} (copia)`.slice(0, 80), isPublic: false });
    res.status(201).json({ id });
  });

  app.get('/api/stats', (req, res) => res.json(stats.overview(me(req)?.id ?? null)));

  // Three.js se sirve desde node_modules (mismo origen, sin CDN).
  // Módulos auxiliares de Three.js: reescribimos `from 'three'` para no necesitar import map (CSP sin inline).
  const ADDONS = new Set(['geometries/RoundedBoxGeometry.js', 'environments/RoomEnvironment.js']);
  const addonCache = new Map();
  app.get('/vendor/three-addons/:dir/:file', (req, res) => {
    const key = `${req.params.dir}/${req.params.file}`;
    if (!ADDONS.has(key)) return res.status(404).end();
    if (!addonCache.has(key)) {
      const src = require('fs').readFileSync(path.join(__dirname, '..', 'node_modules', 'three', 'examples', 'jsm', key), 'utf8');
      addonCache.set(key, src.replace(/from\s+['"]three['"]/g, "from '/vendor/three/three.module.js'"));
    }
    res.type('application/javascript').set('Cache-Control', 'public, max-age=2592000').send(addonCache.get(key));
  });
  app.use('/vendor/three', express.static(path.join(__dirname, '..', 'node_modules', 'three', 'build'), { maxAge: '30d', immutable: true }));
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No encontrado.' });
    sendIndex(req, res);
  });
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status === 400 ? 'Petición no válida.' : 'Error interno.' });
  });

  const purge = setInterval(() => auth.purgeExpired(), 60 * 60_000);
  purge.unref();

  return {
    app, server, io, db, manager,
    close: () => new Promise(resolve => { clearInterval(purge); manager.stop(); io.close(() => { try { db.close(); } catch {} resolve(); }); }),
  };
}

module.exports = { createApp };
