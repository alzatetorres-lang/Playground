const crypto = require('crypto');

const SESSION_MS = 1000 * 60 * 60 * 24 * 30;
const COOKIE = 'pg_session';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const attempt = Buffer.from(hashPassword(password, salt).hash, 'hex');
  const real = Buffer.from(hash, 'hex');
  return attempt.length === real.length && crypto.timingSafeEqual(attempt, real);
}

function cleanUsername(name) {
  return String(name || '').trim().slice(0, 20);
}

function validate({ username, password }) {
  if (!/^[\p{L}\p{N}_ .-]{3,20}$/u.test(username)) return 'El usuario debe tener entre 3 y 20 letras, números o guiones.';
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return 'La contraseña debe tener entre 8 y 128 caracteres.';
  return null;
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createAuth(db, { secureCookie = false } = {}) {
  const q = {
    insertUser: db.prepare('INSERT INTO users (username, pass_hash, salt, avatar, created_at) VALUES (?, ?, ?, ?, ?)'),
    byName: db.prepare('SELECT * FROM users WHERE username = ?'),
    byId: db.prepare('SELECT id, username, avatar FROM users WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
    sessionUser: db.prepare('SELECT u.id, u.username, u.avatar FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    setAvatar: db.prepare('UPDATE users SET avatar = ? WHERE id = ?'),
    collection: db.prepare('SELECT tokens, skins FROM users WHERE id = ?'),
    setCollection: db.prepare('UPDATE users SET tokens = ?, skins = ? WHERE id = ?'),
    addTokens: db.prepare('UPDATE users SET tokens = tokens + ? WHERE id = ?'),
  };

  function startSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    q.insertSession.run(token, userId, Date.now() + SESSION_MS);
    return token;
  }

  function setCookie(res, token) {
    const flags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secureCookie ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${flags}`);
  }

  function clearCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie ? '; Secure' : ''}`);
  }

  function userFromCookieHeader(header) {
    const token = parseCookies(header)[COOKIE];
    if (!token) return null;
    return q.sessionUser.get(token, Date.now()) || null;
  }

  function register({ username, password, avatar }) {
    const name = cleanUsername(username);
    const invalid = validate({ username: name, password });
    if (invalid) return { error: invalid };
    if (q.byName.get(name)) return { error: 'Ese usuario ya existe.' };
    const { hash, salt } = hashPassword(password);
    const { lastInsertRowid } = q.insertUser.run(name, hash, salt, avatar ? JSON.stringify(avatar) : null, Date.now());
    return { token: startSession(Number(lastInsertRowid)), user: q.byId.get(lastInsertRowid) };
  }

  function login({ username, password }) {
    const user = q.byName.get(cleanUsername(username));
    // Mismo mensaje si falla el usuario o la contraseña para no revelar cuentas.
    if (!user || typeof password !== 'string' || !verifyPassword(password, user.pass_hash, user.salt)) {
      return { error: 'Usuario o contraseña incorrectos.' };
    }
    return { token: startSession(user.id), user: q.byId.get(user.id) };
  }

  function logout(header) {
    const token = parseCookies(header)[COOKIE];
    if (token) q.deleteSession.run(token);
  }

  function saveAvatar(userId, avatar) {
    q.setAvatar.run(JSON.stringify(avatar), userId);
  }

  function getCollection(userId) {
    const row = q.collection.get(userId);
    if (!row) return null;
    let skins = [0];
    try { skins = JSON.parse(row.skins); } catch {}
    return { tokens: row.tokens, skins: skins.includes(0) ? skins : [0, ...skins] };
  }

  // Abre una cápsula de forma atómica: cobra, sortea y guarda.
  function buyCapsule(userId, { cost, refund, open }) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const col = getCollection(userId);
      if (!col) throw new Error('Usuario no encontrado.');
      if (col.tokens < cost) { db.exec('ROLLBACK'); return { error: `Te faltan ${cost - col.tokens} tuercas.` }; }
      const skin = open();
      const duplicate = col.skins.includes(skin.id);
      const tokens = col.tokens - cost + (duplicate ? refund : 0);
      const skins = duplicate ? col.skins : [...col.skins, skin.id];
      q.setCollection.run(tokens, JSON.stringify(skins), userId);
      db.exec('COMMIT');
      return { skin, duplicate, tokens, skins };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  return { getCollection, buyCapsule, addTokens: (userId, n) => q.addTokens.run(n, userId), register, login, logout, userFromCookieHeader, setCookie, clearCookie, saveAvatar, purgeExpired: () => q.purge.run(Date.now()) };
}

// Límite simple por IP para login y registro.
function createLimiter({ max = 10, windowMs = 60_000 } = {}) {
  const hits = new Map();
  return key => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length <= max;
  };
}

module.exports = { createAuth, createLimiter, hashPassword, verifyPassword, parseCookies, validate };
