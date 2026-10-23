// Interfaz de los modos a ritmo propio: Mina de Chips, Autopista Turbo, Mar de Datos y Fortaleza Firewall.
import { socket, ask, serverTime, syncClock } from './net.js';
import { esc, toast } from './ui.js';
import { botSvg } from './avatar.js';
import { audio } from './audio.js';
import { S } from './state.js';
import { flash, buzz, confetti, floatScore } from './fx.js';
import { worldOf } from './world.js';
import { RARITY_COLOR } from './bot3d.js';

const P = { info: null, standings: [], view: 'loading', q: null, answered: null, outcomes: null, picked: null, result: null, targets: null, hackOptions: null, hackTarget: null, fish: null, mined: 0, lure: 1, streak: 0, score: 0, events: [], frenzyUntil: 0 };
let rerender = () => {}, clock = null, auto = null;
export const paceState = () => P;
export const initPace = fn => { rerender = fn; };

const UNIT = { chips: 'chips', race: '', fish: 'kg', hack: 'bits' };
export const fmtScore = (mode, p, goal) => mode === 'race' ? `${p.pos ?? p.score}/${goal}` : `${Math.round(p.score)} ${UNIT[mode] || ''}`;

const OUTCOME = {
  gain: o => ['💎', `+${o.amount}`], pct: o => ['📈', `+${o.pct} %`], double: () => ['✖2', 'Duplicar'], lose: o => ['💥', `−${o.pct} %`],
  steal: o => ['🦝', `Robar ${o.pct} %`], swap: () => ['🔄', 'Intercambio'], shield: () => ['🛡', 'Escudo'], nothing: () => ['💨', 'Nada'],
};
const FISH_ICON = { común: '🐟', raro: '🐠', épico: '🦈', legendario: '🐋', mítico: '🦑' };

function later(fn, ms) { clearTimeout(auto); auto = setTimeout(fn, ms); }

export async function startPace(info, resume = null) {
  syncClock(info.now);
  Object.assign(P, { info, view: 'loading', events: [], frenzyUntil: info.frenzyUntil || 0, standings: resume?.standings || [], streak: resume?.streak || 0, lure: resume?.lure || 1 });
  S.phase = 'pace';
  window.__scene?.setMode('game');
  audio.setMood(info.mode === 'fish' ? 'draw' : 'game');
  startClock();
  if (resume?.question) { P.q = resume.question; P.view = 'question'; rerender(); return; }
  if (resume?.awaiting === 'hackchoice') { P.view = 'hackchoice'; P.mined = 0; rerender(); return; }
  await nextQuestion();
}

function startClock() {
  clearInterval(clock);
  clock = setInterval(() => {
    const el = document.querySelector('#ptimer');
    if (!el || !P.info) return;
    const left = Math.max(0, P.info.endsAt - serverTime());
    const s = Math.ceil(left / 1000);
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('low', s <= 15);
    const fz = document.querySelector('#frenzy');
    if (fz) fz.hidden = serverTime() > P.frenzyUntil;
    if (left <= 0) clearInterval(clock);
  }, 250);
}
export const stopPace = () => { clearInterval(clock); clearTimeout(auto); };

async function nextQuestion() {
  const res = await ask('pace:next');
  if (res.error) { toast(res.error, true); return; }
  Object.assign(P, { q: res.question, view: 'question', answered: null, outcomes: null, picked: null, result: null, fish: null });
  rerender();
}

// ---------- vista ----------
export function paceView(root) {
  const mode = P.info?.mode;
  const w = worldOf(mode);
  const me = P.standings.find(p => p.id === S.you) || { score: 0, pos: 0 };
  const goal = P.info?.goal;
  root.innerHTML = `
    <div class="pace-hud" style="--c:${w.color}">
      <div><div class="small">${w.icon} ${esc(w.name)}</div><div class="pscore num">${esc(fmtScore(mode, me, goal))}</div></div>
      <div class="pace-meta">${P.streak >= 2 ? `<span class="streak">🔥 ×${P.streak}</span>` : ''}${mode === 'fish' ? `<span class="lure" title="Cebo">${'◆'.repeat(P.lure)}${'◇'.repeat(5 - P.lure)}</span>` : ''}${mode === 'hack' && P.info.password ? `<span class="pw">🔑 ${esc(P.info.password)}</span>` : ''}</div>
      <div class="ptimer num" id="ptimer">--:--</div>
    </div>
    ${mode === 'fish' ? '<div class="frenzy" id="frenzy" hidden>🌊 ¡FRENESÍ! Todo pesa el doble</div>' : ''}
    ${mode === 'race' ? `<div class="track" id="track">${trackHtml()}</div>` : ''}
    <section class="card pace-card" id="pace-card">${cardHtml(mode)}</section>
    <div class="feed" id="feed">${P.events.map(e => `<div>${esc(e)}</div>`).join('')}</div>`;
  startClock();
}

export function trackHtml() {
  const goal = P.info?.goal || 15;
  return P.standings.map(p => `<div class="lane ${p.id === S.you ? 'me' : ''}"><span class="lane-name">${esc(p.name)}</span><div class="lane-road"><div class="lane-bot" style="left:${Math.min(100, (p.pos / goal) * 100)}%">${botSvg(p.avatar, { size: 'sm' })}</div><span class="flag">🏁</span></div></div>`).join('');
}

function cardHtml(mode) {
  const q = P.q;
  switch (P.view) {
    case 'loading': return '<div class="skeleton" style="min-height:220px"></div>';
    case 'question':
    case 'feedback':
      return `${q.image ? `<img class="qimg" src="${esc(q.image)}" alt="Imagen de la pregunta">` : ''}<div class="small">Pregunta ${q.n}</div><h1 class="question q3d">${esc(q.text)}</h1>
        <div class="options">${q.options.map((o, i) => {
          const cls = P.view === 'feedback' ? (i === P.answered.correctIndex ? 'right' : i === P.answered.choice ? 'wrong' : '') : '';
          return `<button class="option ${cls}" data-act="pans" data-i="${i}" ${P.view === 'feedback' ? 'disabled' : ''}><b>${'ABCD'[i]}</b>&nbsp;${esc(o)}</button>`;
        }).join('')}</div>`;
    case 'capsules':
      return `<div class="small" style="text-align:center">¡Correcto! Elige una cápsula</div>
        <div class="capsules">${[0, 1, 2].map(i => `<button class="cap" data-act="ppick" data-i="${i}" aria-label="Cápsula ${i + 1}"><span class="cap-glow"></span><span class="cap-ico">?</span></button>`).join('')}</div>`;
    case 'reveal':
      return `<div class="capsules revealed">${P.outcomes.map((o, i) => { const [ico, label] = OUTCOME[o.type](o); return `<div class="cap open ${i === P.picked ? 'picked' : ''} t-${o.type}"><span class="cap-ico">${ico}</span><span class="cap-label">${esc(label)}</span></div>`; }).join('')}</div>
        <p class="result-line">${esc(P.result || '')}</p>
        ${P.targets ? `<div class="small" style="text-align:center">Elige a quién</div><div class="targets">${P.targets.map(t => `<button class="target" data-act="ptarget" data-id="${t.id}">${botSvg(t.avatar, { size: 'sm' })}<span>${esc(t.name)}</span><b class="num">${Math.round(t.score)}</b></button>`).join('')}</div>` : '<div class="row center"><button data-act="pnext">Siguiente ▶</button></div>'}`;
    case 'catch': {
      const f = P.fish;
      return `<div class="catch" style="--rc:${RARITY_COLOR[f.rarity]}"><div class="fish">${FISH_ICON[f.rarity]}</div><div class="small" style="color:var(--rc)">${f.rarity}</div><h2>${esc(f.name)}</h2><div class="kg num">${f.kg} kg</div></div><div class="row center"><button data-act="pnext">Seguir pescando ▶</button></div>`;
    }
    case 'wrong':
      return `<div class="catch bad"><div class="fish">✖</div><h2>Fallaste</h2><p class="muted">${mode === 'fish' ? 'El cebo vuelve a nivel 1.' : mode === 'race' ? 'Tu racha se reinicia.' : 'Sin premio esta vez.'}</p></div><div class="row center"><button data-act="pnext">Siguiente ▶</button></div>`;
    case 'race':
      return `<div class="catch"><div class="fish">${P.answered.boost ? '🚀' : '➡️'}</div><h2>${P.answered.boost ? '¡Turbo! +2' : '+1 casilla'}</h2></div>`;
    case 'hackchoice': {
      const victims = P.standings.filter(p => p.id !== S.you);
      return `<div class="catch"><div class="fish">⛏</div><h2>+${P.mined} bits</h2><p class="muted">Puedes seguir minando o intentar hackear a alguien.</p></div>
        <div class="targets">${victims.map(t => `<button class="target" data-act="phack" data-id="${t.id}">${botSvg(t.avatar, { size: 'sm' })}<span>Hackear a ${esc(t.name)}</span><b class="num">${Math.round(t.score)}</b></button>`).join('')}</div>
        <div class="row center"><button class="alt" data-act="pnext">Seguir minando ▶</button></div>`;
    }
    case 'hackguess':
      return `<div class="small" style="text-align:center">Adivina la contraseña de ${esc(P.hackTarget?.name || '')}</div><div class="pw-options">${P.hackOptions.map(pw => `<button class="pw-btn" data-act="pguess" data-pw="${esc(pw)}">${esc(pw)}</button>`).join('')}</div>`;
    case 'hackresult':
      return `<div class="catch ${P.result?.ok ? '' : 'bad'}"><div class="fish">${P.result?.ok ? (P.result.blocked ? '🛡' : '💾') : '🚫'}</div><h2>${P.result?.ok ? (P.result.blocked ? 'Bloqueado por su firewall' : `¡Robaste ${P.result.stolen} bits!`) : 'Contraseña incorrecta'}</h2></div><div class="row center"><button data-act="pnext">Siguiente ▶</button></div>`;
    default: return '';
  }
}

// ---------- acciones ----------
export async function paceAct(act, el) {
  if (act === 'pans') {
    if (P.view !== 'question') return true;
    const choice = Number(el.dataset.i);
    P.view = 'feedback';
    const res = await ask('pace:answer', { answer: choice });
    if (res.error) { P.view = 'question'; toast(res.error, true); rerender(); return true; }
    P.answered = { ...res, choice };
    const gain = res.score != null ? Math.round(res.score - (P.lastScore ?? 0)) : 0;
    if (res.score != null) P.lastScore = res.score;
    if (gain > 0) setTimeout(() => floatScore(document.querySelector('.pscore'), `+${gain}`), 300);
    P.streak = res.streak ?? P.streak;
    flash(res.correct ? 'ok' : 'bad'); buzz(res.correct ? 25 : 70); audio.sfx(res.correct ? 'correct' : 'wrong');
    rerender();
    const mode = P.info.mode;
    later(() => {
      if (!res.correct) { P.view = 'wrong'; rerender(); later(nextQuestion, 1400); return; }
      if (mode === 'chips') P.view = 'capsules';
      else if (mode === 'fish') { P.fish = res.fish; P.lure = res.lure; P.view = 'catch'; audio.sfx('join'); if (res.fish.rarity === 'mítico' || res.fish.rarity === 'legendario') confetti(); }
      else if (mode === 'hack') { P.mined = res.mined; P.view = 'hackchoice'; }
      else if (mode === 'race') { P.view = 'race'; if (res.boost) audio.sfx('power'); rerender(); later(nextQuestion, 700); return; }
      rerender();
    }, 650);
    if (res.lure) P.lure = res.lure;
    if (!res.correct && P.info.mode === 'fish') P.lure = 1;
    return true;
  }
  if (act === 'ppick') {
    const res = await ask('chips:pick', { index: Number(el.dataset.i) });
    if (res.error) { toast(res.error, true); return true; }
    P.outcomes = res.outcomes; P.picked = res.picked; P.targets = res.needsTarget ? res.targets : null;
    const o = res.outcomes[res.picked];
    P.result = res.needsTarget ? (o.type === 'steal' ? 'Has sacado un robo' : 'Has sacado un intercambio') : resultText(o, res.result);
    P.view = 'reveal';
    if (res.result?.delta) { setTimeout(() => floatScore(document.querySelector('.pscore'), `${res.result.delta > 0 ? '+' : ''}${res.result.delta}`, res.result.delta > 0 ? 'var(--lime)' : 'var(--magenta)'), 500); P.lastScore = res.score; }
    audio.sfx(['lose', 'nothing'].includes(o.type) ? 'wrong' : 'power');
    if (o.type === 'lose') flash('bad');
    rerender();
    if (!res.needsTarget) later(nextQuestion, 2200);
    return true;
  }
  if (act === 'ptarget') {
    const res = await ask('chips:target', { target: el.dataset.id });
    if (res.error) { toast(res.error, true); return true; }
    P.targets = null;
    P.result = res.result.type === 'blocked' ? 'Su escudo te ha bloqueado' : res.result.type === 'steal' ? `Has robado ${res.result.amount} chips` : 'Habéis intercambiado los chips';
    audio.sfx(res.result.type === 'blocked' ? 'wrong' : 'correct');
    rerender();
    later(nextQuestion, 1800);
    return true;
  }
  if (act === 'phack') {
    const res = await ask('hack:begin', { target: el.dataset.id });
    if (res.error) { toast(res.error, true); return true; }
    P.hackOptions = res.options; P.hackTarget = P.standings.find(p => p.id === el.dataset.id); P.view = 'hackguess';
    rerender();
    return true;
  }
  if (act === 'pguess') {
    const res = await ask('hack:guess', { password: el.dataset.pw });
    if (res.error) { toast(res.error, true); return true; }
    P.result = res; P.view = 'hackresult';
    audio.sfx(res.ok && !res.blocked ? 'correct' : 'wrong');
    if (res.ok && !res.blocked) flash('ok');
    rerender();
    later(nextQuestion, 2000);
    return true;
  }
  if (act === 'pnext') { clearTimeout(auto); nextQuestion(); return true; }
  return false;
}

function resultText(o, r) {
  if (!r) return '';
  switch (o.type) {
    case 'gain': case 'pct': return `+${r.delta} chips`;
    case 'double': return `Has duplicado: +${r.delta} chips`;
    case 'lose': return `Has perdido ${-r.delta} chips`;
    case 'shield': return 'Escudo activado: el próximo robo rebotará';
    default: return 'Nada esta vez';
  }
}

// ---------- eventos del servidor ----------
socket.on('pace:start', info => { if (S.you) startPace(info); });
socket.on('pace:standings', data => {
  syncClock(data.now);
  P.standings = data.players;
  if (S.phase !== 'pace') return;
  const track = document.querySelector('#track');
  if (track) track.innerHTML = trackHtml();
  const me = P.standings.find(p => p.id === S.you);
  const sc = document.querySelector('.pscore');
  if (sc && me) sc.textContent = fmtScore(P.info.mode, me, P.info.goal);
  window.dispatchEvent(new Event('pg:side'));
});
socket.on('pace:event', e => {
  if (S.phase !== 'pace') return;
  if (e.kind === 'frenzy') { syncClock(e.now); P.frenzyUntil = e.until; audio.sfx('go'); window.__scene?.pulse(); }
  P.events.unshift(e.text);
  P.events = P.events.slice(0, 5);
  const feed = document.querySelector('#feed');
  if (feed) feed.innerHTML = P.events.map(t => `<div>${esc(t)}</div>`).join('');
  if (e.target === S.you || e.kind === 'hacking') { toast(e.text, e.kind !== 'blocked'); flash('bad'); buzz(120); }
});
