import { socket, ask, serverTime, syncClock } from './net.js';
import { esc, toast } from './ui.js';
import { botSvg } from './avatar.js';
import { audio } from './audio.js';
import { S } from './state.js';
import { createCanvas, PALETTE } from './draw.js';
import { flash, confetti, buzz } from './fx.js';

// Mantiene la pantalla encendida durante la partida (móviles que se apagan solos).
let wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {} }
function letSleep() { try { wakeLock?.release(); } catch {} wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.room) keepAwake(); });

const app = () => document.querySelector('#app');
let tickTimer = null, canvas = null, lastTick = -1, nav = () => {}, chrome = () => {};
const answered = new Set(), guessed = new Set();
export const initRoom = (navigate, onChrome) => { nav = navigate; chrome = onChrome; };

const me = () => S.room?.players.find(p => p.id === S.you);
const isHost = () => S.room?.hostId === S.you;
const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
const board = (list, deltas = {}) => `<ul class="board">${list.map((p, i) => `<li><span class="pos">${i + 1}</span>${botSvg(p.avatar, { size: 'sm' })}<span class="nm">${esc(p.name)}${p.id === S.you ? ' (tú)' : ''}</span>${deltas[p.id] ? `<span class="delta">+${deltas[p.id]}</span>` : ''}<span class="pts">${p.score}</span></li>`).join('')}</ul>`;
const shareLink = () => `${location.origin}/#/join/${S.room.code}`;

function stopTimer() { clearInterval(tickTimer); tickTimer = null; lastTick = -1; }

function runTimer() {
  stopTimer();
  const update = () => {
    const left = Math.max(0, S.endsAt - serverTime());
    const el = document.querySelector('#timer');
    const bar = document.querySelector('#bar');
    if (el) { const s = Math.ceil(left / 1000); el.textContent = s; el.classList.toggle('low', s <= (S.phase === 'countdown' ? 2 : 5)); if (s <= 5 && s !== lastTick && s > 0 && (S.phase === 'question' || S.phase === 'draw' || S.phase === 'countdown')) { audio.sfx('tick'); buzz(S.phase === 'countdown' ? 12 : 6); } lastTick = s; }
    if (bar) bar.style.width = `${Math.min(100, (left / (S.seconds * 1000)) * 100)}%`;
    const arc = document.querySelector('#arc');
    if (arc) { arc.style.strokeDashoffset = 100 - Math.min(100, (left / (S.seconds * 1000)) * 100); document.querySelector('.ring')?.classList.toggle('low', Math.ceil(left / 1000) <= 2); }
    if (left <= 0) stopTimer();
  };
  update();
  tickTimer = setInterval(update, 200);
}

export function leave() {
  socket.emit('room:leave');
  stopTimer();
  canvas?.destroy(); canvas = null;
  sessionStorage.removeItem('pg_room');
  letSleep();
  S.room = null; S.phase = null; S.you = null;
  nav('/');
}

function rememberRoom() { sessionStorage.setItem('pg_room', JSON.stringify({ code: S.room.code, name: me()?.name })); }

// Entra con la respuesta del servidor (crear, unirse o reconectar).
export function enter(snapshot) {
  S.room = snapshot.room; S.you = snapshot.you; S.announce = []; S.chat = []; S.result = null;
  rememberRoom();
  keepAwake();
  nav('/room', true);
  const st = S.room.status;
  if (st === 'lobby') S.phase = 'lobby';
  else if (st === 'question' && snapshot.question) {
    syncClock(snapshot.question.now);
    setQuestion(snapshot.question);
    S.picked = snapshot.question.answered ? -1 : null;
    return;
  } else if (st === 'countdown' && snapshot.countdown) {
    setCountdown(snapshot.countdown);
    return;
  } else if (st === 'draw' && snapshot.draw) {
    syncClock(snapshot.draw.now);
    setDraw(snapshot.draw);
    return;
  } else if (st === 'finished') S.phase = 'wait';
  else S.phase = 'wait';
  render();
}

function setCountdown(c) {
  syncClock(c.now);
  S.phase = 'countdown'; S.cd = c; S.endsAt = c.endsAt; S.seconds = c.seconds; S.announce = [];
  answered.clear(); guessed.clear();
  canvas?.destroy(); canvas = null;
  render(); runTimer();
}

function setQuestion(q) {
  syncClock(q.now);
  answered.clear();
  S.phase = 'question'; S.q = q; S.endsAt = q.endsAt; S.seconds = q.seconds; S.picked = null; S.announce = [];
  canvas?.destroy(); canvas = null;
  render(); runTimer();
}

function setDraw(d) {
  syncClock(d.now);
  guessed.clear();
  S.phase = 'draw'; S.draw = d; S.endsAt = d.endsAt; S.seconds = d.seconds; S.chat = []; S.announce = [];
  render(); runTimer();
  if (d.strokes?.length) canvas?.load(d.strokes);
}

export function render() {
  const host = app();
  if (!S.room) return;
  // Marcador lateral en todas las fases de juego; en la sala de espera no hace falta.
  const withSide = !['lobby', 'wait'].includes(S.phase);
  host.innerHTML = `<div class="game-layout${withSide ? ' with-side' : ''}"><div id="stage"></div>${withSide ? '<aside id="side" class="card side" aria-label="Marcador en directo"></aside>' : ''}</div>`;
  const views = { lobby, countdown, question, result, draw, drawresult, finished, wait };
  (views[S.phase] || wait)(host.querySelector('#stage'));
  renderSide();
  chrome();
}

function renderSide() {
  const side = document.querySelector('#side');
  if (!side || !S.room) return;
  const players = [...S.room.players].sort((a, b) => b.score - a.score);
  const top = players[0]?.score || 0;
  const gap = top - (players.find(p => p.id === S.you)?.score ?? top);
  const mark = p => {
    if (S.phase === 'question') return answered.has(p.id) ? '<span class="mark ok" title="Ya respondió">✔</span>' : '';
    if (S.phase === 'draw') return p.id === S.draw?.drawerId ? '<span class="mark" title="Dibuja">✏</span>' : guessed.has(p.id) ? '<span class="mark ok" title="Acertó">✔</span>' : '';
    return '';
  };
  side.innerHTML = `<h2>Marcador</h2>
    ${top > 0 ? `<p class="leader">👑 Va ganando <b>${esc(players[0].name)}</b></p>` : '<p class="leader muted">Aún sin puntos</p>'}
    <ol class="side-list">${players.map((p, i) => `<li class="${p.id === S.you ? 'me' : ''}${p.connected ? '' : ' off'}${i === 0 && top > 0 ? ' lead' : ''}">
      <span class="pos">${i + 1}</span>${botSvg(p.avatar, { size: 'sm' })}
      <span class="nm">${esc(p.name)}${p.id === S.you ? ' <span class="muted">(tú)</span>' : ''}</span>${mark(p)}<span class="pts">${p.score}</span>
      <i class="fill" style="width:${top ? Math.round((p.score / top) * 100) : 0}%"></i></li>`).join('')}</ol>
    ${gap > 0 ? `<p class="small side-gap">Líder +${gap} sobre ti</p>` : ''}`;
}

// ---------- vistas ----------

function lobby(root) {
  canvas?.destroy(); canvas = null;
  const r = S.room, host = isHost();
  root.innerHTML = `
    <section class="hero center"><div class="small">${r.settings.solo ? 'Partida individual' : 'Sala de espera'}</div><h1>${esc(r.title)}</h1></section>
    ${r.settings.solo ? '' : `<section class="card"><div class="small" style="text-align:center">Código de sala</div><div class="code" id="code">${esc(r.code)}</div>
      <div class="row center"><button class="violet" data-act="copy">📋 Copiar enlace</button>${navigator.share ? '<button class="alt" data-act="share">📤 Compartir</button>' : ''}</div>
      <p class="muted" style="text-align:center;margin-top:10px">Comparte el código o el enlace. Máximo 10 jugadores.</p></section>`}
    <section class="card"><h2>Jugadores (${r.players.length}/10)</h2>
      <div class="players">${r.players.map(p => `<div class="player ${p.connected ? '' : 'off'}">${p.isHost ? '<span class="crown" title="Anfitrión">👑</span>' : ''}${botSvg(p.avatar)}<span class="name">${esc(p.name)}${p.id === S.you ? ' (tú)' : ''}</span></div>`).join('')}</div></section>
    <section class="card"><div class="small">Reglas de esta partida</div>
      <p>${r.settings.questions} preguntas · ${r.settings.seconds} s cada una${r.settings.drawEvery ? ` · una ronda de dibujo cada ${r.settings.drawEvery} preguntas (${r.settings.drawSeconds} s)` : ''}.</p></section>
    <div class="row center sticky-actions">
      ${host ? `<button data-act="start" ${!r.settings.solo && r.players.length < 2 ? 'disabled' : ''}>${!r.settings.solo && r.players.length < 2 ? 'Esperando jugadores…' : '▶ Empezar partida'}</button>` : '<p class="muted">Esperando a que el anfitrión empiece…</p>'}
      <button class="ghost" data-act="leave">Salir</button>
    </div>`;
}

function countdown(root) {
  const c = S.cd || {};
  const what = c.type === 'draw' ? 'Ronda de dibujo' : `Pregunta ${c.number} de ${c.total}`;
  root.innerHTML = `
    <section class="countdown card" role="timer" aria-label="Cuenta atrás">
      <div class="small">${esc(what)}</div>
      <div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="54"/><circle class="arc" id="arc" cx="60" cy="60" r="54" pathLength="100"/></svg><div class="cd-num" id="timer">--</div></div>
      <p class="muted">${c.type === 'draw' ? 'Prepárate: a alguien le toca dibujar.' : 'Prepárate. La pregunta aparece al llegar a cero.'}</p>
    </section>`;
}

function question(root) {
  const q = S.q, m = me();
  const powers = m ? m.powers : {};
  const lock = S.picked != null;
  root.innerHTML = `
    <div class="hud"><div><div class="small">Pregunta ${q.number} de ${q.total}</div></div><div class="timer" id="timer">--</div></div>
    <div class="bar"><i id="bar"></i></div>
    <section class="card">${q.image ? `<img class="qimg" src="${esc(q.image)}" alt="Imagen de la pregunta">` : ''}<h1 class="question">${esc(q.text)}</h1>
      <div class="options">${q.options.map((o, i) => `<button class="option ${S.picked === i ? 'picked' : ''}" data-act="answer" data-i="${i}" ${lock ? 'disabled' : ''}><b>${'ABCD'[i]}</b>&nbsp;${esc(o)}</button>`).join('')}</div>
      ${lock ? '<p class="muted" style="margin-top:12px">Respuesta enviada. Esperando al resto…</p>' : ''}
      <div class="powers" id="powers">${powersHtml(powers, lock)}</div>
      <div id="announce">${S.announce.map(a => `<div class="announce">${esc(a)}</div>`).join('')}</div>
    </section>`;
  runTimer();
}

function powersHtml(powers, lock) {
  const defs = [['double', '✖2 Doble apuesta'], ['shield', '🛡 Escudo'], ['time', '⏱ Robo de tiempo']];
  return defs.map(([k, label]) => `<button data-act="power" data-p="${k}" class="${powers?.[k] ? '' : ''}" ${!powers?.[k] || lock ? 'disabled' : ''} title="${{ double: 'Duplica tus puntos si aciertas', shield: 'Te protege de un robo de tiempo', time: 'Quita 5 s a los demás' }[k]}">${label}</button>`).join('');
}

function result(root) {
  const r = S.result, m = me();
  const mine = r.results.find(x => x.id === S.you);
  const ok = mine?.correct;
  const q = S.q;
  const deltas = Object.fromEntries(r.results.map(x => [x.id, x.points]));
  const sorted = [...r.ranking];
  root.innerHTML = `
    <section class="card" style="text-align:center">
      ${botSvg(m?.avatar, { size: 'lg', mood: ok ? 'happy' : 'sad' })}
      <h2>${mine?.answer == null ? '⏱ Sin respuesta' : ok ? '¡Correcto!' : 'Fallaste'}</h2>
      ${mine ? `<p class="muted">${ok ? `+${mine.points} puntos (base ${mine.breakdown.base} + rapidez ${mine.breakdown.speed}${mine.breakdown.multiplier > 1 ? ` × ${mine.breakdown.multiplier} doble apuesta` : ''})` : 'Sin puntos esta ronda'}</p>` : ''}
    </section>
    <section class="card"><div class="small">Respuesta correcta</div>
      <div class="options">${q.options.map((o, i) => `<div class="option ${i === r.correct ? 'right' : S.picked === i ? 'wrong' : ''}"><b>${'ABCD'[i]}</b>&nbsp;${esc(o)}</div>`).join('')}</div></section>
    <section class="card"><h2>Clasificación</h2>${board(sorted, deltas)}</section>
    ${nextBar(r.hasNext)}`;
}

function nextBar(hasNext) {
  if (S.room.settings.solo) return '<p class="muted" style="text-align:center">Siguiente pregunta en unos segundos…</p>';
  return `<div class="row center sticky-actions">${isHost() ? `<button data-act="next">${hasNext ? 'Siguiente ▶' : 'Ver resultado final 🏁'}</button>` : '<p class="muted">Esperando al anfitrión…</p>'}</div>${hasNext ? '<p class="muted" style="text-align:center">La siguiente ronda empieza con una cuenta atrás de 5 s.</p>' : ''}`;
}

function draw(root) {
  const d = S.draw, drawer = d.role === 'drawer';
  const drawerName = S.room.players.find(p => p.id === d.drawerId)?.name || '';
  const mask = d.words.map(n => '_'.repeat(n).split('').join(' ')).join('   ');
  root.innerHTML = `
    <div class="hud"><div><div class="small">${drawer ? 'Te toca dibujar' : `Dibuja ${esc(drawerName)}`}${d.theme ? ` · ${esc(d.theme)}` : ''}</div></div><div class="timer" id="timer">--</div></div>
    <div class="bar"><i id="bar"></i></div>
    <section class="card">
      ${drawer ? `<div class="small" style="text-align:center">Dibuja esta palabra (sin letras ni números)</div><div class="secret">${esc(d.word)}</div>` : `<div class="mask" aria-label="Palabra de ${d.length} letras">${esc(mask)}</div>`}
      <div id="cv"></div>
      ${drawer ? `<div class="tools">${PALETTE.map((c, i) => `<button class="swatch ${i === 0 ? 'on' : ''}" style="background:${c};${c === '#ffffff' ? 'border:2px solid #888' : ''}" data-act="color" data-c="${c}" aria-label="Color ${i + 1}"></button>`).join('')}
        <input type="range" min="2" max="30" value="6" id="size" aria-label="Grosor"><button class="alt small-btn" data-act="clear">🗑 Borrar</button></div>` : ''}
      ${drawer ? '' : `<form id="guessform" class="row" style="flex-wrap:nowrap"><input id="guess" placeholder="Escribe tu respuesta" autocomplete="off" maxlength="60" style="margin:0" ${d.guessed ? 'disabled' : ''}><button type="submit" ${d.guessed ? 'disabled' : ''}>Probar</button></form>`}
      <div class="chat" id="chat" aria-live="polite">${S.chat.map(chatLine).join('') || '<span class="muted">Los intentos aparecen aquí.</span>'}</div>
    </section>`;
  canvas?.destroy();
  canvas = createCanvas(document.querySelector('#cv'), {
    canDraw: drawer,
    onStroke: e => socket.emit('draw:stroke', e),
    onClear: () => socket.emit('draw:clear'),
  });
  if (d.strokes?.length) canvas.load(d.strokes);
  document.querySelector('#size')?.addEventListener('input', ev => canvas.setSize(Number(ev.target.value)));
  document.querySelector('#guessform')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const input = document.querySelector('#guess');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const res = await ask('draw:guess', { text });
    if (res.error) toast(res.error, true);
    if (res.close) { toast('¡Casi! Revisa la palabra y prueba otra vez.'); input.focus(); }
    if (res.correct) {
      S.draw.guessed = true;
      audio.sfx('correct');
      // La ronda puede haber terminado ya y el formulario desaparecido.
      const form = document.querySelector('#guessform');
      form?.querySelectorAll('input, button').forEach(el => { el.disabled = true; });
    }
  });
  runTimer();
}

const chatLine = c => c.ok ? `<div class="ok">✔ ${esc(c.name)} ha acertado (+${c.points})</div>` : `<div><span class="who">${esc(c.name)}:</span> ${esc(c.text)}</div>`;

function drawresult(root) {
  const r = S.result;
  const drawer = S.room.players.find(p => p.id === r.drawerId);
  const got = r.results.filter(x => x.guessed).length;
  root.innerHTML = `
    <section class="card" style="text-align:center">
      ${botSvg(drawer?.avatar, { size: 'lg', mood: got ? 'happy' : 'sad' })}
      <div class="small">La palabra era</div><div class="secret">${esc(r.word)}</div>
      <p class="muted">${got ? `${got} de ${r.results.length} la adivinaron.` : 'Nadie la adivinó.'} Dibujó ${esc(drawer?.name || '')}.</p>
    </section>
    <section class="card"><h2>Aciertos</h2><ul class="board">${r.results.map(x => `<li><span class="pos">${x.guessed ? '✔' : '✘'}</span><span class="nm">${esc(x.name)}</span><span class="delta">${x.guessed ? `+${x.points}` : ''}</span></li>`).join('')}</ul></section>
    <section class="card"><h2>Clasificación</h2>${board(r.ranking)}</section>
    ${nextBar(r.hasNext)}`;
}

function finished(root) {
  const rank = S.result.ranking;
  const top = rank.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const cls = p => ['p1', 'p2', 'p3'][p.place - 1];
  root.innerHTML = `
    <section class="hero center"><div class="small">Fin de la partida</div><h1>¡Ganó <span>${esc(top[0].name)}</span>!</h1></section>
    <div class="podium">${order.map(p => `<div class="${cls(p)}">${botSvg(p.avatar, { mood: p.place === 1 ? 'happy' : undefined })}<b>${medal(p.place - 1)} ${esc(p.name)}</b><div class="muted">${p.score}</div></div>`).join('')}</div>
    <section class="card"><h2>Resultado final</h2>
      <ul class="board">${rank.map(p => `<li><span class="pos">${p.place}</span>${botSvg(p.avatar, { size: 'sm' })}<span class="nm">${esc(p.name)}${p.id === S.you ? ' (tú)' : ''}<br><span class="muted" style="font-size:.78rem">${p.quizCorrect} aciertos de quiz · ${p.drawGuesses} dibujos adivinados</span></span><span class="pts">${p.score}</span></li>`).join('')}</ul></section>
    <div class="row center">
      ${isHost() && !S.room.settings.solo ? '<button data-act="rematch">🔁 Revancha</button>' : S.room.settings.solo ? '<button data-act="again">🔁 Jugar otra vez</button>' : '<p class="muted">El anfitrión puede proponer revancha.</p>'}
      <button class="alt" data-act="stats">🏆 Récords</button>
      <button class="ghost" data-act="leave">Salir</button>
    </div>`;
}

function wait(root) {
  const r = S.room;
  root.innerHTML = `<section class="hero center"><div class="small">Sala ${esc(r.code)}</div><h1>Reconectado</h1><p>Esperando a que empiece la siguiente ronda…</p></section><section class="card"><h2>Clasificación</h2>${board([...r.players].sort((a, b) => b.score - a.score))}</section><div class="row center"><button class="ghost" data-act="leave">Salir</button></div>`;
}

// ---------- acciones ----------

export async function handleAct(act, el) {
  if (act === 'leave') return leave();
  if (act === 'share') { try { await navigator.share({ title: 'Playground', text: `Únete a mi partida en Playground con el código ${S.room.code}`, url: shareLink() }); } catch {} return true; }
  if (act === 'copy') { try { await navigator.clipboard.writeText(shareLink()); toast('Enlace copiado'); } catch { toast(shareLink()); } return true; }
  if (act === 'start') { audio.sfx('go'); const res = await ask('game:start'); if (res.error) toast(res.error, true); return true; }
  if (act === 'answer') {
    const i = Number(el.dataset.i);
    S.picked = i;
    const res = await ask('game:answer', { answer: i });
    if (res.error) { S.picked = null; toast(res.error, true); }
    render();
    return true;
  }
  if (act === 'power') {
    const res = await ask('game:power', { power: el.dataset.p });
    if (res.error) toast(res.error, true); else audio.sfx('power');
    return true;
  }
  if (act === 'next') { const res = await ask('game:next'); if (res.error) toast(res.error, true); return true; }
  if (act === 'rematch') { const res = await ask('game:rematch'); if (res.error) toast(res.error, true); return true; }
  if (act === 'again') { nav('/'); return true; }
  if (act === 'stats') { nav('/stats'); return true; }
  if (act === 'color') {
    canvas?.setColor(el.dataset.c);
    document.querySelectorAll('.tools .swatch').forEach(s => s.classList.toggle('on', s === el));
    return true;
  }
  if (act === 'clear') { canvas?.clearLocal(); return true; }
  return false;
}

// ---------- eventos del servidor ----------

socket.on('room:update', room => {
  const prev = S.room?.players.length || 0;
  S.room = room;
  if (!S.you) return;
  if (S.phase === 'lobby' || S.phase === 'wait') { if (room.players.length > prev && prev) audio.sfx('join'); render(); }
  else if (S.phase === 'question') { const el = document.querySelector('#powers'); if (el) el.innerHTML = powersHtml(me()?.powers, S.picked != null); }
  else if (S.phase === 'finished') render();
  renderSide();
});

socket.on('game:countdown', c => { if (S.you) { audio.sfx('go'); setCountdown(c); } });
socket.on('game:question', q => { if (S.you) { audio.sfx('go'); setQuestion(q); } });
socket.on('game:answered', ({ id }) => { answered.add(id); renderSide(); });
socket.on('game:deadline', ({ deadline, now }) => { syncClock(now); S.endsAt = deadline; });
socket.on('game:power', p => {
  if (!S.you || S.phase !== 'question') return;
  const names = id => S.room.players.find(x => x.id === id)?.name || '?';
  const text = {
    double: `${p.byName} activó Doble apuesta`,
    shield: `${p.byName} activó un Escudo`,
    time: `${p.byName} robó tiempo${p.targets.length ? ` a ${p.targets.map(names).join(', ')}` : ''}${p.blocked.length ? ` (${p.blocked.map(names).join(', ')} se protegió)` : ''}`,
  }[p.power];
  S.announce.push(text);
  const el = document.querySelector('#announce');
  if (el) el.innerHTML = S.announce.map(a => `<div class="announce">${esc(a)}</div>`).join('');
  audio.sfx('power');
});

socket.on('game:result', r => {
  if (!S.you) return;
  stopTimer();
  S.result = r;
  S.phase = r.type === 'draw' ? 'drawresult' : 'result';
  if (r.type === 'quiz') {
    const ok = r.results.find(x => x.id === S.you)?.correct;
    audio.sfx(ok ? 'correct' : 'wrong');
    flash(ok ? 'ok' : 'bad');
    buzz(ok ? 30 : 80);
  }
  canvas?.destroy(); canvas = null;
  render();
});

socket.on('game:finished', ({ ranking }) => {
  if (!S.you) return;
  stopTimer();
  S.result = { ranking };
  S.phase = 'finished';
  audio.sfx('win');
  sessionStorage.removeItem('pg_room');
  render();
  confetti();
});

socket.on('game:rematch', () => { S.phase = 'lobby'; S.result = null; rememberRoom(); render(); });
socket.on('draw:start', d => { if (S.you) setDraw(d); });
socket.on('draw:stroke', e => canvas?.remote(e));
socket.on('draw:clear', () => canvas?.clear());
socket.on('draw:chat', c => { S.chat.push(c); refreshChat(); });
socket.on('draw:correct', c => { if (c.id === S.you) { flash('ok'); buzz(30); } guessed.add(c.id); renderSide(); S.chat.push({ ok: true, ...c }); refreshChat(); if (c.id !== S.you) audio.sfx('join'); });

function refreshChat() {
  const el = document.querySelector('#chat');
  if (!el) return;
  el.innerHTML = S.chat.map(chatLine).join('');
  el.scrollTop = el.scrollHeight;
}

// Reconexión automática tras una caída de red.
socket.on('connect', async () => {
  const saved = JSON.parse(sessionStorage.getItem('pg_room') || 'null');
  if (!saved || !S.you) return;
  const res = await ask('room:join', { code: saved.code, name: saved.name, avatar: S.avatar });
  if (res.error) { toast('Se perdió la conexión con la sala.', true); leave(); } else if (res.rejoined) enter(res);
});

export async function tryResume() {
  const saved = JSON.parse(sessionStorage.getItem('pg_room') || 'null');
  if (!saved) return false;
  const res = await ask('room:join', { code: saved.code, name: saved.name, avatar: S.avatar });
  if (res.error) { sessionStorage.removeItem('pg_room'); return false; }
  enter(res);
  return true;
}
