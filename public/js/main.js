import { api, ask, socket } from './net.js';
import { esc, toast, avatarEditor } from './ui.js';
import { botSvg, randomAvatar, bot3d, loadBot3D } from './avatar.js';
import { audio } from './audio.js';
import { S, saveProfile } from './state.js';
import { initTouchFx, decodeAll, canUse3D } from './fx.js';
import { homeHtml, mountHome, selectWorld, WORLDS, worldOf, worldArt, worldSrcset } from './world.js';
import { SKIN_INFO, RARITY_COLOR } from './skins.js';
import { initRoom, enter, handleAct, tryResume, leave, render as renderRoom } from './room.js';

const app = document.querySelector('#app');
const top = document.querySelector('#topbar');
const roombar = document.querySelector('#roombar');
const tabbar = document.querySelector('#tabbar');

// ---------- navegación ----------
function nav(path, silent = false) {
  if (silent) { history.replaceState(null, '', `#${path}`); return route(); }
  location.hash = path;
}
initRoom(nav, () => renderChrome());
window.addEventListener('hashchange', route);

function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(query) };
}

const DEPTH = { '': 0, library: 1, taller: 1, stats: 1, me: 1, login: 1, host: 2, create: 2, edit: 2, join: 2, room: 3 };
const TAB_ORDER = ['', 'library', 'taller', 'stats', 'me'];
let lastKey = null;

// Dirección de la animación: avanzar a una pantalla más profunda o a la pestaña de la derecha va hacia delante.
function direction(parts) {
  const a = parts[0] || '';
  const key = a;
  let dir = 'forward';
  if (lastKey !== null) {
    const d1 = DEPTH[lastKey] ?? 1, d2 = DEPTH[a] ?? 1;
    if (d2 !== d1) dir = d2 > d1 ? 'forward' : 'back';
    else dir = TAB_ORDER.indexOf(a) < TAB_ORDER.indexOf(lastKey) ? 'back' : 'forward';
  }
  lastKey = key;
  return dir;
}

function route() {
  const dir = direction(parse().parts);
  if (!S.room) { window.__scene?.setMode('menu'); audio.setMood('menu'); }
  if (audioUnlocked) audio.sfx('nav');
  document.documentElement.dataset.nav = dir;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !reduce) {
    // Una transición puede abortarse (p. ej. al girar el móvil): se ignora y la pantalla se pinta igual.
    const t = document.startViewTransition(() => renderRoute());
    t.ready.catch(() => {});
    t.updateCallbackDone.catch(() => {});
    return t.finished.catch(() => {});
  }
  return renderRoute();
}

async function renderRoute() {
  const { parts, query } = parse();
  setTimeout(() => bot3d()?.sweepViewers(), 0);
  // Los titulares de cada pantalla se descifran al aparecer.
  setTimeout(() => { document.querySelectorAll('#app .hero h1, #app h1.question').forEach(h => h.setAttribute('data-decode', '')); decodeAll(); }, 60);
  const [a, b] = parts;
  renderChrome();
  window.scrollTo(0, 0);
  try {
    if (S.room && a !== 'room' && a !== 'stats') return nav('/room', true);
    if (!a) return home();
    if (a === 'library') return library(query);
    if (a === 'host') return hostSetup(Number(b), query.get('solo') === '1', query.get('mode'));
    if (a === 'taller') return taller();
    if (a === 'join') return joinView(b);
    if (a === 'create') return editor(null);
    if (a === 'edit') return editor(Number(b));
    if (a === 'stats') return stats();
    if (a === 'login') return loginView();
    if (a === 'me') return profile();
    if (a === 'room') return S.room ? renderRoom() : nav('/', true);
    return notFound();
  } catch (e) { app.innerHTML = `<section class="card"><h2>Ups</h2><p class="err">${esc(e.message)}</p><a class="btn" href="#/">Volver al inicio</a></section>`; }
}

function notFound() {
  app.innerHTML = `<section class="hero center"><div class="small">Error 404</div><h1>Señal perdida</h1><p>Esta página no existe. Vuelve al inicio o entra a una sala con tu código.</p><div class="row"><a class="btn" href="#/">Inicio</a><a class="btn violet" href="#/library">Ver quizzes</a></div></section>`;
}

// ---------- barra superior, inferior y de sala ----------
const ICON = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z"/></svg>',
  library: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  taller: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 5 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z"/></svg>',
  stats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 01-10 0z"/><path d="M12 14v4M8 21h8M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3"/></svg>',
  me: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
};
const SECTION = { '': 'home', library: 'library', host: 'library', create: 'library', edit: 'library', taller: 'taller', stats: 'stats', me: 'me', login: 'me', join: 'home' };
const current = () => SECTION[parse().parts[0] || ''];
const cur = k => (current() === k ? ' aria-current="page"' : '');

function musicHtml() {
  const st = audio.state;
  return `<span class="music"><button class="ghost small-btn" data-act="mute" aria-label="${st.muted ? 'Activar música' : 'Silenciar música'}">${st.muted ? '🔇' : '🔊'}</button>
    <input type="range" min="0" max="1" step="0.05" value="${st.volume}" class="vol" aria-label="Volumen de la música"></span>`;
}
function bindMusic(root) { const v = root.querySelector('.vol'); if (v) v.oninput = ev => audio.setVolume(Number(ev.target.value)); }

function renderChrome() {
  const inRoom = !!S.room;
  document.body.classList.toggle('in-room', inRoom);
  top.hidden = inRoom; roombar.hidden = !inRoom; tabbar.hidden = inRoom;
  if (inRoom) {
    const r = S.room;
    const round = r.round ? `Ronda ${r.round.number}/${r.round.total}` : r.status === 'lobby' ? 'Sala de espera' : '';
    roombar.innerHTML = `<div class="row"><span class="chip">SALA <b>${esc(r.code)}</b></span>${round ? `<span class="small">${esc(round)}</span>` : ''}</div>
      <div class="row">${musicHtml()}${S.confirmLeave
        ? '<span class="confirm-row"><span class="small">¿Salir?</span><button class="danger small-btn" data-act="leave">Sí</button><button class="ghost small-btn" data-act="leaveno">No</button></span>'
        : '<button class="ghost small-btn" data-act="leaveask">Salir</button>'}</div>`;
    bindMusic(roombar);
    return;
  }
  top.innerHTML = `
    <a class="brand" href="#/" aria-label="Playground, inicio">PLAY<b>GROUND</b></a>
    <nav class="topnav" aria-label="Principal">
      <a class="link" href="#/library"${cur('library')}>Quizzes</a>
      <a class="link" href="#/taller"${cur('taller')}>Taller</a>
      <a class="link" href="#/stats"${cur('stats')}>Récords</a>
      <a class="link" href="${S.user ? '#/me' : '#/login'}"${cur('me')}>${S.user ? esc(S.user.username) : 'Entrar'}</a>
      <a class="link" href="#/" data-cookies>Cookies</a>
      ${musicHtml()}
    </nav>`;
  bindMusic(top);
  updateTabbar();
}

// La barra inferior se construye una vez para que el indicador pueda deslizarse entre pestañas.
function updateTabbar() {
  if (!tabbar.dataset.built) {
    tabbar.innerHTML = `<i class="ink"></i>
      <a data-tab="home" href="#/">${ICON.home}<span>Inicio</span></a>
      <a data-tab="library" href="#/library">${ICON.library}<span>Quizzes</span></a>
      <a data-tab="taller" href="#/taller">${ICON.taller}<span>Taller</span></a>
      <a data-tab="stats" href="#/stats">${ICON.stats}<span>Récords</span></a>
      <a data-tab="me" href="#/login">${ICON.me}<span>Entrar</span></a>`;
    tabbar.dataset.built = '1';
  }
  const order = ['home', 'library', 'taller', 'stats', 'me'];
  const now = current();
  tabbar.style.setProperty('--i', Math.max(0, order.indexOf(now)));
  tabbar.querySelectorAll('a').forEach(a => { if (a.dataset.tab === now) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const me = tabbar.querySelector('[data-tab=me]');
  me.setAttribute('href', S.user ? '#/me' : '#/login');
  me.querySelector('span').textContent = S.user ? 'Perfil' : 'Entrar';
}
audio.onChange(() => renderChrome());
// La música arranca con el primer gesto del usuario (política de autoplay de los navegadores).
let audioUnlocked = false;
const unlock = () => { audioUnlocked = true; if (!audio.state.muted) audio.start(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// Los elementos con role=button (planetas del mapa) también responden a Enter y espacio.
document.addEventListener('keydown', ev => {
  const el = ev.target.closest?.('[role=button][data-act]');
  if (el && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});

// ---------- clics ----------
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'mute') { audio.toggleMute(); return; }
  if (act === 'leaveask') { S.confirmLeave = true; return renderChrome(); }
  if (act === 'leaveno') { S.confirmLeave = false; return renderChrome(); }
  if (act === 'leave') S.confirmLeave = false;
  if (act === 'home' && S.room) { ev.preventDefault(); return; }
  if (await handleAct(act, el)) return;
  const fn = actions[act];
  if (fn) fn(el, ev);
});

const val = sel => document.querySelector(sel)?.value?.trim() || '';
function requireName() {
  const name = val('#name') || S.name || S.user?.username || '';
  if (!name) { toast('Escribe un nombre primero.', true); document.querySelector('#name')?.focus(); return null; }
  S.name = name; saveProfile();
  return name;
}

const actions = {
  async join() {
    const name = requireName(); if (!name) return;
    const code = val('#code').toUpperCase();
    if (code.length !== 5) return toast('El código tiene 5 caracteres.', true);
    const res = await ask('room:join', { code, name, avatar: S.avatar });
    if (res.error) return toast(res.error, true);
    audio.sfx('join'); enter(res);
  },
  async create() {
    const name = requireName(); if (!name) return;
    // Cada modo muestra solo sus ajustes: los que no están se dejan al valor por defecto del servidor.
    const el = id => { const f = document.querySelector(id); return f ? Number(f.value) : undefined; };
    const res = await ask('room:create', {
      quizId: S.hostQuiz, name, avatar: S.avatar, solo: S.hostSolo,
      settings: {
        mode: S.hostMode, questions: el('#s-q'), seconds: el('#s-sec'), drawEvery: S.hostSolo || S.hostMode !== 'classic' ? 0 : el('#s-draw'), drawSeconds: el('#s-dsec'),
        duration: el('#s-min') * 60, goal: el('#s-goal'), drawRounds: el('#s-rounds'),
      },
    });
    if (res.error) return toast(res.error, true);
    audio.sfx('go'); enter(res);
  },
  async dup(el) {
    if (!S.user) return nav('/login');
    try { const { id } = await api(`/api/quizzes/${el.dataset.id}/duplicate`, { method: 'POST' }); toast('Copiado a tus quizzes'); nav(`/edit/${id}`); } catch (e) { toast(e.message, true); }
  },
  async del(el) {
    if (!el.dataset.sure) {
      el.dataset.sure = '1'; el.textContent = '¿Seguro?';
      setTimeout(() => { delete el.dataset.sure; el.textContent = 'Borrar'; }, 3000);
      return;
    }
    try { await api(`/api/quizzes/${el.dataset.id}`, { method: 'DELETE' }); toast('Borrado'); profile(); } catch (e) { toast(e.message, true); }
  },
  async logout() { await api('/api/logout', { method: 'POST' }); S.user = null; toast('Sesión cerrada'); nav('/'); },
  addq() { collectEditor(); S.draft.questions.push(blankQ()); editorBody(); },
  delq(el) { collectEditor(); S.draft.questions.splice(Number(el.dataset.i), 1); if (!S.draft.questions.length) S.draft.questions.push(blankQ()); editorBody(); },
  addopt(el) { collectEditor(); const q = S.draft.questions[Number(el.dataset.i)]; if (q.options.length < 4) q.options.push(''); editorBody(); },
  delopt(el) { collectEditor(); const q = S.draft.questions[Number(el.dataset.i)]; if (q.options.length > 2) { q.options.pop(); q.correct = Math.min(q.correct, q.options.length - 1); } editorBody(); },
  async save() {
    collectEditor();
    try {
      const body = S.draft;
      const res = S.draft.id ? await api(`/api/quizzes/${S.draft.id}`, { method: 'PUT', body }) : await api('/api/quizzes', { method: 'POST', body });
      toast('Quiz guardado'); nav('/me'); return res;
    } catch (e) { document.querySelector('#editor-err').textContent = e.message; }
  },
  async doLogin() { authSubmit('login'); },
  async doRegister() { authSubmit('register'); },
  tab(el) { S.tab = el.dataset.t; stats(); },
  world(el) { selectWorld(el.dataset.mode); audio.sfx('join'); },
  trailer() { const d = document.querySelector('#trailer-dialog'); d.showModal(); const v = d.querySelector('video'); v.currentTime = 0; v.muted = false; v.play().catch(() => {}); audio.duck?.(true); },
  closetrailer() { const d = document.querySelector('#trailer-dialog'); d.querySelector('video').pause(); d.close(); },
  tomap(el, ev) { ev.preventDefault(); document.querySelector('#map')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  pickmode(el) { S.hostMode = el.dataset.mode; hostSetup(S.hostQuiz, S.hostSolo, S.hostMode); },
  async capsule() { openCapsule(); },
  async wear(el) { S.avatar.skin = Number(el.dataset.s); saveProfile(); try { await api('/api/avatar', { method: 'PUT', body: S.avatar }); } catch {} toast(`Llevas el acabado ${SKIN_INFO[S.avatar.skin].name}`); taller(); },
  async saveAvatar() { try { await api('/api/avatar', { method: 'PUT', body: S.avatar }); toast('Robot guardado'); } catch (e) { toast(e.message, true); } },
};

// ---------- vistas ----------
function skeletonGrid(n = 4) {
  return `<div class="grid" aria-busy="true" aria-label="Cargando">${'<div class="skeleton"></div>'.repeat(n)}</div>`;
}

function nameField() {
  return `<label for="name">Tu nombre</label><input id="name" maxlength="20" placeholder="¿Cómo te llamas?" value="${esc(S.name || S.user?.username || '')}" autocomplete="nickname">`;
}

function robotCard() {
  return `<section class="card"><div class="row between"><h2>Tu robot</h2>${S.user ? '<button class="alt small-btn" data-act="saveAvatar">Guardar en mi cuenta</button>' : ''}</div><div id="avatar-editor"></div></section>`;
}
function mountRobot() {
  avatarEditor(document.querySelector('#avatar-editor'), S.avatar, () => saveProfile(), () => randomAvatar(), S.user?.skins || [0]);
}

function home() {
  app.innerHTML = homeHtml({ nameField, robotCard });
  mountHome();
  mountRobot();
}

async function library(query) {
  const solo = query.get('solo') === '1';
  const mode = query.get('mode') || S.libMode || 'classic';
  S.libMode = mode;
  const world = worldOf(mode);
  const hostQ = id => `#/host/${id}?mode=${mode}${solo ? '&solo=1' : ''}`;
  const mine = S.libMine && S.user;
  app.innerHTML = skeletonGrid();
  const [cats, list] = await Promise.all([api('/api/categories'), api(`/api/quizzes?${new URLSearchParams({ q: S.libQ || '', category: S.libCat || '', ...(mine ? { mine: '1' } : {}) })}`)]);
  app.innerHTML = `
    <a class="back" href="#/">‹ Inicio</a><section class="hero" style="padding:4px 0 0"><div class="small">${solo ? 'Elige un quiz para jugar solo' : 'Elige un quiz'}</div><h1>Biblioteca</h1></section>
    <div class="mode-strip" role="radiogroup" aria-label="Modo de juego">${WORLDS.filter(w => !solo || w.solo).map(w => `<a class="mode-chip ${w.mode === mode ? 'on' : ''}" role="radio" aria-checked="${w.mode === mode}" href="#/library?mode=${w.mode}${solo ? '&solo=1' : ''}" style="--c:${w.color}"><img src="${worldArt(w.mode, 'sm')}" width="34" height="22" alt="" loading="lazy" decoding="async"><span>${w.icon}</span>${esc(w.name)}</a>`).join('')}</div>
    <p class="muted">${esc(world.icon)} <b>${esc(world.name)}</b>: ${esc(world.rules[0])} ${esc(world.rules[1] || '')}</p>
    <div class="tabs"><button class="${mine ? '' : 'on'}" data-act="libtab" data-m="0">Públicos</button>${S.user ? `<button class="${mine ? 'on' : ''}" data-act="libtab" data-m="1">Mis quizzes</button><a class="btn violet" href="#/create">+ Crear quiz</a>` : '<a class="btn ghost small-btn" href="#/login">Inicia sesión para crear quizzes</a>'}</div>
    <div class="row" style="align-items:flex-end"><div style="flex:2;min-width:180px"><label for="q">Buscar</label><input id="q" value="${esc(S.libQ || '')}" placeholder="Título o descripción"></div>
      <div style="flex:1;min-width:150px"><label for="cat">Categoría</label><select id="cat"><option value="">Todas</option>${cats.map(c => `<option ${S.libCat === c.name ? 'selected' : ''} value="${esc(c.name)}">${esc(c.name)} (${c.count})</option>`).join('')}</select></div></div>
    <div class="grid" style="margin-top:12px">${list.map(q => `<article class="card qcard" style="--accent:${accent(q.category)}"><div class="row between"><span class="pill">${esc(q.category)}</span>${q.isPublic ? '' : '<span class="pill">Privado</span>'}</div><h2 class="qtitle">${esc(q.title)}</h2><div class="meta">${q.questionCount} preguntas · por ${esc(q.author)}</div>
      <div class="row"><a class="btn small-btn" href="${hostQ(q.id)}">${solo ? 'Jugar solo' : 'En directo'}</a>${solo || !world.solo ? '' : `<a class="btn alt small-btn" href="#/host/${q.id}?mode=${mode}&solo=1">Solo</a>`}${q.mine ? `<a class="btn ghost small-btn" href="#/edit/${q.id}">Editar</a>` : `<button class="ghost small-btn" data-act="dup" data-id="${q.id}">Duplicar</button>`}</div></article>`).join('') || '<div class="card empty"><span class="big">∅</span>No hay quizzes con ese filtro. Prueba otra búsqueda o crea el tuyo.</div>'}</div>`;
  const apply = () => { S.libQ = val('#q'); S.libCat = val('#cat'); library(query); };
  let t; document.querySelector('#q').oninput = () => { clearTimeout(t); t = setTimeout(apply, 350); };
  document.querySelector('#cat').onchange = apply;
}
actions.libtab = el => { S.libMine = el.dataset.m === '1'; library(parse().query); };

async function hostSetup(id, solo, mode) {
  const quiz = await api(`/api/quizzes/${id}`);
  S.hostQuiz = id; S.hostSolo = solo;
  S.hostMode = WORLDS.some(w => w.mode === mode && (!solo || w.solo)) ? mode : (S.hostMode && (!solo || worldOf(S.hostMode).solo) ? S.hostMode : 'classic');
  const w = worldOf(S.hostMode);
  const n = quiz.questions.length;
  const pace = ['chips', 'race', 'fish', 'hack'].includes(w.mode);
  const range = (id, label, min, max, step, value, unit = '') => `<label for="${id}">${label}: <span id="o${id}"></span>${unit}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">`;
  app.innerHTML = `
    <a class="back" href="#/library?mode=${w.mode}${solo ? '&solo=1' : ''}">‹ Biblioteca</a>
    <div class="world-banner" style="--c:${w.color}"><img src="${worldArt(w.mode)}" srcset="${worldSrcset(w.mode)}" sizes="(max-width: 720px) 100vw, 1040px" width="1280" height="720" alt="" decoding="async" fetchpriority="high"></div>
    <section class="hero" style="padding:4px 0 0"><div class="small">${solo ? 'Partida individual' : 'Nueva partida en directo'} · ${esc(quiz.title)}</div><h1 style="--c:${w.color}"><span class="mode-ico">${w.icon}</span> ${esc(w.name)}</h1><p>${esc(w.story)}</p></section>
    <div class="mode-strip">${WORLDS.filter(x => !solo || x.solo).map(x => `<button class="mode-chip ${x.mode === w.mode ? 'on' : ''}" data-act="pickmode" data-mode="${x.mode}" style="--c:${x.color}"><span>${x.icon}</span>${esc(x.name)}</button>`).join('')}</div>
    <div class="split">
      <section class="card stack">${nameField()}
        ${pace ? range('s-min', 'Duración', 2, 10, 1, 4, ' min') : ''}
        ${w.mode === 'race' ? range('s-goal', 'Meta', 5, 40, 1, 15, ' aciertos') : ''}
        ${w.mode === 'draw' ? range('s-rounds', 'Rondas de dibujo', 2, 12, 1, 4) + range('s-dsec', 'Segundos por dibujo', 30, 120, 10, 60) : ''}
        ${!pace && w.mode !== 'draw' ? range('s-q', 'Preguntas', 1, Math.min(30, n), 1, Math.min(w.mode === 'battle' ? 15 : 10, n)) + range('s-sec', 'Segundos por pregunta', 10, 60, 5, 20) : ''}
        ${w.mode === 'classic' && !solo ? `<label for="s-draw">Ronda de dibujo</label><select id="s-draw"><option value="0">Sin dibujo</option><option value="2">Cada 2 preguntas</option><option value="3">Cada 3 preguntas</option><option value="4" selected>Cada 4 preguntas</option><option value="5">Cada 5 preguntas</option></select>${range('s-dsec', 'Segundos por dibujo', 30, 120, 10, 60)}` : ''}
        <button class="wide" data-act="create">${solo ? '▶ Jugar' : 'Crear sala y obtener código'}</button>
      </section>
      <section class="card"><h2>Reglas</h2><ul class="rules">${w.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul><p class="muted">${n} preguntas en este quiz.</p></section>
    </div>
    ${robotCard()}`;
  for (const id of ['s-q', 's-sec', 's-dsec', 's-min', 's-goal', 's-rounds']) {
    const i = document.querySelector(`#${id}`), o = document.querySelector(`#o${id}`);
    if (i && o) { const f = () => { o.textContent = i.value; }; i.oninput = f; f(); }
  }
  mountRobot();
}

// ---------- Taller: cápsulas y colección ----------
async function taller() {
  if (!S.user) {
    app.innerHTML = `<section class="hero center"><div class="small">Taller de Chispa</div><h1>Colecciona <span>bots</span></h1><p>Gana tuercas en cada partida y ábrelas en cápsulas para conseguir acabados: Neón, Cromo, Oro, Holograma, Lava, Galaxia o Glitch. Necesitas una cuenta para guardar tu colección.</p><div class="row"><a class="btn" href="#/login">Crear cuenta o entrar</a></div></section>
      <div class="skin-grid">${SKIN_INFO.map((k, i) => `<div class="skin-card" style="--rc:${RARITY_COLOR[k.rarity]}">${botSvg({ ...S.avatar, skin: i })}<b>${esc(k.name)}</b><span class="small" style="color:var(--rc)">${k.rarity}</span></div>`).join('')}</div>`;
    return;
  }
  app.innerHTML = skeletonGrid(3);
  const col = await api('/api/collection');
  S.user.tokens = col.tokens; S.user.skins = col.skins;
  app.innerHTML = `
    <section class="hero" style="padding:8px 0 0"><div class="small">Taller de Chispa</div><h1>Tu <span>colección</span></h1><p>Cada partida da tuercas (más si quedas en el podio). Una cápsula cuesta ${col.cost}; si sale repetido te devolvemos ${col.refund}.</p></section>
    <div class="split">
      <section class="card capsule-card">
        <div class="tokens"><span class="nut">⚙</span><b class="num" id="tokens">${col.tokens}</b> tuercas</div>
        <div class="capsule-stage" id="capsule-stage"><div class="capsule" id="capsule"><i></i><i></i></div></div>
        <button class="wide" data-act="capsule" ${col.tokens < col.cost ? 'disabled' : ''}>Abrir cápsula · ${col.cost} ⚙</button>
        <p class="muted" style="text-align:center;margin:8px 0 0">Probabilidades: común 55 % · raro 28 % · épico 12 % · legendario 4 % · mítico 1 %</p>
      </section>
      <section class="card"><h2>Acabados (${col.skins.length}/${SKIN_INFO.length})</h2>
        <div class="skin-grid">${SKIN_INFO.map((k, i) => {
          const own = col.skins.includes(i);
          return `<div class="skin-card ${own ? '' : 'locked'} ${S.avatar.skin === i ? 'on' : ''}" style="--rc:${RARITY_COLOR[k.rarity]}">${own ? botSvg({ ...S.avatar, skin: i }) : '<div class="lockbox">?</div>'}<b>${esc(k.name)}</b><span class="small" style="color:var(--rc)">${k.rarity}</span>${own ? `<button class="small-btn ${S.avatar.skin === i ? 'alt' : ''}" data-act="wear" data-s="${i}">${S.avatar.skin === i ? 'Puesto' : 'Ponérselo'}</button>` : ''}</div>`;
        }).join('')}</div></section>
    </div>`;
}

async function openCapsule() {
  const btn = document.querySelector('[data-act=capsule]');
  const stage = document.querySelector('#capsule-stage');
  btn.disabled = true;
  stage.classList.add('shaking');
  audio.sfx('riser');
  let res;
  try { res = await api('/api/capsule', { method: 'POST' }); } catch (e) { stage.classList.remove('shaking'); btn.disabled = false; return toast(e.message, true); }
  await new Promise(r => setTimeout(r, 1600));
  stage.classList.remove('shaking');
  stage.classList.add('burst');
  audio.sfx('win');
  const skin = res.skin;
  S.user.tokens = res.tokens; S.user.skins = res.skins;
  stage.innerHTML = `<div class="reveal-bot" style="--rc:${RARITY_COLOR[skin.rarity]}"><div class="rays"></div><div id="reveal-live"></div><div class="small" style="color:var(--rc)">${skin.rarity}</div><h3>${esc(skin.name)}</h3><p class="muted">${res.duplicate ? `Repetido: +${30} tuercas` : '¡Nuevo acabado!'}</p></div>`;
  const viewer = bot3d()?.mountBot(document.querySelector('#reveal-live'), { ...S.avatar, skin: skin.id }, { size: 200 });
  if (!viewer) document.querySelector('#reveal-live').innerHTML = botSvg({ ...S.avatar, skin: skin.id }, { size: 'lg' });
  document.querySelector('#tokens').textContent = res.tokens;
  setTimeout(() => { if (document.querySelector('#reveal-live')) taller(); }, 4200);
}

function joinView(code) {
  app.innerHTML = `
    <a class="back" href="#/">‹ Inicio</a><section class="hero" style="padding:4px 0 0"><div class="small">Te han invitado</div><h1>Entrar a la partida</h1></section>
    <section class="card stack">${nameField()}
      <label for="code">Código de sala</label><input id="code" maxlength="5" value="${esc((code || '').toUpperCase())}" style="text-transform:uppercase;letter-spacing:.3em;font-family:var(--font-head);font-weight:700">
      <button class="wide" data-act="join">Entrar</button></section>
    ${robotCard()}`;
  mountRobot();
}

const ACCENTS = ['var(--cyan)', 'var(--lime)', 'var(--magenta)', 'var(--amber)'];
const accent = name => ACCENTS[[...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % ACCENTS.length];

const blankQ = () => ({ text: '', options: ['', '', '', ''], correct: 0 });

async function editor(id) {
  if (!S.user) { toast('Entra con tu cuenta para crear quizzes.', true); return nav('/login'); }
  if (id) {
    const q = await api(`/api/quizzes/${id}`);
    if (!q.mine) throw new Error('Solo puedes editar tus quizzes.');
    S.draft = { id, title: q.title, description: q.description, category: q.category, isPublic: q.isPublic, questions: q.questions };
  } else S.draft = { id: null, title: '', description: '', category: 'General', isPublic: false, questions: [blankQ()] };
  editorBody();
}

function editorBody() {
  const d = S.draft;
  app.innerHTML = `
    <a class="back" href="#/me">‹ Mis quizzes</a><section class="hero" style="padding:4px 0 0"><h1>${d.id ? 'Editar quiz' : 'Crear quiz'}</h1></section>
    <section class="card stack">
      <label for="e-title">Título</label><input id="e-title" maxlength="80" value="${esc(d.title)}">
      <label for="e-desc">Descripción</label><input id="e-desc" maxlength="200" value="${esc(d.description)}">
      <label for="e-cat">Categoría</label><input id="e-cat" maxlength="40" value="${esc(d.category)}">
      <label><input type="checkbox" id="e-pub" style="width:auto;min-height:0;margin-right:8px" ${d.isPublic ? 'checked' : ''}> Publicar en la biblioteca pública</label>
    </section>
    ${d.questions.map((q, i) => `<section class="qedit" data-qi="${i}"><div class="row between"><b>Pregunta ${i + 1}</b><button class="danger small-btn" data-act="delq" data-i="${i}">Quitar</button></div>
      <input class="q-text" maxlength="200" placeholder="Escribe la pregunta" value="${esc(q.text)}">
      ${q.options.map((o, j) => `<div class="opt"><input type="radio" name="c${i}" class="q-correct" value="${j}" ${q.correct === j ? 'checked' : ''} aria-label="Respuesta correcta ${j + 1}"><input type="text" class="q-opt" maxlength="80" placeholder="Opción ${'ABCD'[j]}" value="${esc(o)}"></div>`).join('')}
      <div class="row"><button class="alt small-btn" data-act="addopt" data-i="${i}" ${q.options.length >= 4 ? 'disabled' : ''}>+ Opción</button><button class="alt small-btn" data-act="delopt" data-i="${i}" ${q.options.length <= 2 ? 'disabled' : ''}>− Opción</button></div></section>`).join('')}
    <div class="row"><button class="violet" data-act="addq" ${d.questions.length >= 50 ? 'disabled' : ''}>+ Añadir pregunta</button><button data-act="save">Guardar quiz</button><a class="btn ghost" href="#/me">Cancelar</a></div>
    <p class="err" id="editor-err"></p>`;
}

function collectEditor() {
  const d = S.draft;
  d.title = val('#e-title'); d.description = val('#e-desc'); d.category = val('#e-cat') || 'General'; d.isPublic = document.querySelector('#e-pub').checked;
  d.questions = [...document.querySelectorAll('.qedit')].map(box => ({
    text: box.querySelector('.q-text').value.trim(),
    options: [...box.querySelectorAll('.q-opt')].map(i => i.value.trim()),
    correct: Number(box.querySelector('.q-correct:checked')?.value ?? 0),
  }));
}

async function stats() {
  app.innerHTML = skeletonGrid(2);
  const data = await api('/api/stats');
  const tab = S.tab || 'best';
  const tbl = (head, rows) => rows.length ? `<table class="tbl"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="empty"><span class="big">∅</span>Todavía no hay datos. Juega una partida para abrir el marcador.</div>';
  const body = {
    best: tbl(['#', 'Jugador', 'Puntos', 'Quiz'], data.bestGames.map((r, i) => [i + 1, r.name, r.score, r.quiz])),
    wins: tbl(['#', 'Jugador', 'Victorias'], data.wins.map((r, i) => [i + 1, r.name, r.wins])),
    draw: tbl(['#', 'Jugador', 'Aciertos', 'Puntos de dibujo'], data.topDrawers.map((r, i) => [i + 1, r.name, r.guesses, r.points])),
  }[tab];
  app.innerHTML = `
    <section class="hero" style="padding:8px 0 0"><div class="small">${data.totals.games} partidas jugadas</div><h1>Récords</h1></section>
    ${data.me ? `<section class="card"><h2>Mis números</h2><div class="row"><span class="pill num">${data.me.games} partidas</span><span class="pill num">Récord ${data.me.best}</span><span class="pill num">${data.me.wins} victorias</span><span class="pill num">${data.me.correct} aciertos de quiz</span><span class="pill num">${data.me.guesses} dibujos adivinados</span></div></section>` : '<div class="card"><p class="muted" style="margin:0">Entra con tu cuenta para guardar tus estadísticas. <a href="#/login">Iniciar sesión</a></p></div>'}
    <div class="tabs"><button class="${tab === 'best' ? 'on' : ''}" data-act="tab" data-t="best">Mejores partidas</button><button class="${tab === 'wins' ? 'on' : ''}" data-act="tab" data-t="wins">Victorias</button><button class="${tab === 'draw' ? 'on' : ''}" data-act="tab" data-t="draw">Dibujo</button></div>
    <section class="card">${body}</section>`;
}

function loginView() {
  app.innerHTML = `
    <a class="back" href="#/">‹ Inicio</a><section class="hero" style="padding:4px 0 0"><div class="small">Anfitriones</div><h1>Entrar</h1><p>Con cuenta puedes crear y publicar quizzes y guardar tus récords. Para jugar basta con un nombre.</p></section>
    <section class="card stack"><label for="u">Usuario</label><input id="u" maxlength="20" autocomplete="username"><label for="p">Contraseña (mínimo 8)</label><input id="p" type="password" autocomplete="current-password">
      <div class="row"><button data-act="doLogin">Iniciar sesión</button><button class="violet" data-act="doRegister">Crear cuenta</button></div><p class="err" id="auth-err"></p></section>`;
}

async function authSubmit(kind) {
  const body = { username: val('#u'), password: document.querySelector('#p').value };
  if (kind === 'register') body.avatar = S.avatar;
  try {
    const { user } = await api(`/api/${kind}`, { method: 'POST', body });
    S.user = user;
    if (user.avatar) { S.avatar = user.avatar; saveProfile(); }
    if (!S.name) { S.name = user.username; saveProfile(); }
    toast(`Hola, ${user.username}`); nav('/');
  } catch (e) { document.querySelector('#auth-err').textContent = e.message; }
}

async function profile() {
  if (!S.user) return nav('/login');
  app.innerHTML = skeletonGrid(2);
  const list = await api('/api/quizzes?mine=1');
  app.innerHTML = `
    <section class="hero" style="padding:8px 0 0"><div class="small">Perfil</div><h1>${esc(S.user.username)}</h1></section>
    ${robotCard()}
    <section class="card"><div class="row between"><h2>Mis quizzes</h2><a class="btn violet small-btn" href="#/create">+ Crear</a></div>
      ${list.map(q => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--outline)"><div><b>${esc(q.title)}</b> <span class="pill">${q.isPublic ? 'Público' : 'Privado'}</span><div class="muted">${q.questionCount} preguntas</div></div>
        <div class="row"><a class="btn small-btn" href="#/host/${q.id}">Jugar</a><a class="btn alt small-btn" href="#/edit/${q.id}">Editar</a><button class="danger small-btn" data-act="del" data-id="${q.id}">Borrar</button></div></div>`).join('') || '<div class="empty"><span class="big">∅</span>Aún no has creado ningún quiz.</div>'}</section>
    <button class="ghost" data-act="logout">Cerrar sesión</button>`;
  mountRobot();
}

// ---------- arranque ----------
initTouchFx();
// El fondo 3D y los robots 3D se cargan después de pintar la primera pantalla.
const idle = fn => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 600));
// Mejora progresiva: la primera pantalla se pinta ligera (robots en SVG, fondo CSS) y el 3D se activa
// con la primera interacción. Así la carga no compite con el motor 3D, que es lo más pesado.
let enhanced = false;
function enhance() {
  if (enhanced) return;
  enhanced = true;
  document.body.classList.add('enhanced');
  window.dispatchEvent(new Event('pg:enhance'));
  if (!canUse3D()) return;
  idle(() => {
    loadBot3D();
    setTimeout(() => idle(() => import('./scene3d.js').then(m => { window.__scene = m.initScene(); if (!S.room) window.__scene.setMode('menu'); }).catch(() => {})), 600);
  });
}
for (const ev of ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll']) window.addEventListener(ev, enhance, { once: true, passive: true });
window.addEventListener('hashchange', enhance, { once: true });
(async function boot() {
  try { S.user = (await api('/api/me')).user; } catch {}
  if (S.user?.avatar && !localStorage.getItem('pg_avatar')) { S.avatar = S.user.avatar; saveProfile(); }
  if (S.user && !S.name) S.name = S.user.username;
  const { parts } = parse();
  if (parts[0] === 'room' || sessionStorage.getItem('pg_room')) { if (await tryResume()) return; }
  route();
})();
