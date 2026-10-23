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

function createApp({ dbFile, secureCookie = false, limits, publicOrigin } = {}) {
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

  app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: manager.size() }));

  app.get('/api/me', (req, res) => res.json({ user: publicUser(me(req)) }));

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
    auth.saveAvatar(req.user.id, avatar);
    res.json({ avatar });
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

  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No encontrado.' });
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
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
