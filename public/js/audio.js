// Banda sonora synthwave generada con WebAudio (sin archivos).
// Pistas: bombo, caja, charles, bajo, pad, arpegio con eco y melodía. Cada ambiente tiene su tempo y acordes.
// El cambio de ambiente espera al siguiente compás para que no se corte la música.
const STORE = 'pg_audio';
const midi = n => 440 * 2 ** ((n - 69) / 12);

// Acordes como notas MIDI (raíz en la 1.ª posición). 16 semicorcheas por compás.
const MOODS = {
  menu: { bpm: 96, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]], kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x..x..x.x..x..x.', arp: [0, 1, 2, 3, 2, 1, 2, 3], arpEvery: 2, lead: true, pad: 0.05 },
  game: { bpm: 118, chords: [[50, 53, 57, 60], [46, 50, 53, 57], [53, 57, 60, 64], [48, 52, 55, 60]], kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', bass: 'x.xxx.xxx.xxx.xx', arp: [0, 2, 1, 3, 0, 2, 1, 3], arpEvery: 1, lead: false, pad: 0.035 },
  draw: { bpm: 108, chords: [[48, 52, 55, 60], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]], kick: 'x.....x.x.......', snare: '....x.......x...', hat: '..x.x...x.x...x.', bass: 'x...x.x.x...x.x.', arp: [0, 1, 2, 3, 3, 2, 1, 0], arpEvery: 2, lead: true, pad: 0.04 },
  win: { bpm: 124, chords: [[48, 52, 55, 60], [53, 57, 60, 65], [55, 59, 62, 67], [48, 52, 55, 60]], kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.', arp: [0, 1, 2, 3, 2, 3, 2, 1], arpEvery: 1, lead: true, pad: 0.05 },
};

let ctx = null, master, musicBus, duck, sfxBus, delay, delayFb, noiseBuf;
let timer = null, nextTime = 0, step = 0, playing = false, mood = 'menu', pendingMood = null;
const state = { muted: false, volume: 0.5 };
try { Object.assign(state, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch {}
const listeners = new Set();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ muted: state.muted, volume: state.volume })); } catch {} listeners.forEach(f => f(state)); };

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  musicBus = ctx.createGain(); musicBus.gain.value = 0.7;
  duck = ctx.createGain(); // se agacha con cada bombo: efecto "pumping" de la música electrónica
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
  delay = ctx.createDelay(1); delayFb = ctx.createGain(); delayFb.gain.value = 0.32;
  const delayTone = ctx.createBiquadFilter(); delayTone.type = 'lowpass'; delayTone.frequency.value = 2600;
  delay.connect(delayTone); delayTone.connect(delayFb); delayFb.connect(delay); delayTone.connect(duck);
  musicBus.connect(duck); duck.connect(comp); sfxBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolume();
  return ctx;
}

function applyVolume() {
  if (!master) return;
  master.gain.setTargetAtTime(state.muted ? 0 : state.volume * 0.5, ctx.currentTime, 0.05);
}

const stepDur = () => 60 / MOODS[mood].bpm / 4;

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function osc(type, freq, t, dur, peak, dest, { attack = 0.005, detune = 0, cutoff = null } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  let node = o;
  if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff / 4), t + dur); o.connect(f); node = f; }
  node.connect(g); g.connect(dest);
  env(g, t, attack, peak, dur);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(t, dur, peak, dest, type = 'highpass', freq = 7000) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
  s.connect(f); f.connect(g); g.connect(dest);
  env(g, t, 0.002, peak, dur);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

function kick(t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  o.connect(g); g.connect(sfxBusOrMusic());
  env(g, t, 0.002, 0.9, 0.28);
  o.start(t); o.stop(t + 0.3);
  duck.gain.cancelScheduledValues(t);
  duck.gain.setValueAtTime(0.35, t);
  duck.gain.linearRampToValueAtTime(1, t + stepDur() * 3);
}
// El bombo va directo al compresor para que no se agache a sí mismo.
const sfxBusOrMusic = () => sfxBus;

function schedule(s, t) {
  const m = MOODS[mood];
  const i = s % 16;
  const bar = Math.floor(s / 16) % m.chords.length;
  const chord = m.chords[bar];
  if (m.kick[i] === 'x') kick(t);
  if (m.snare[i] === 'x') { noise(t, 0.16, 0.35, musicBus, 'bandpass', 1800); osc('triangle', 190, t, 0.1, 0.18, musicBus); }
  if (m.hat[i] === 'x') noise(t, 0.04, i % 4 === 2 ? 0.16 : 0.08, musicBus);
  if (m.bass[i] === 'x') osc('sawtooth', midi(chord[0] - 24 + (i % 8 === 6 ? 12 : 0)), t, stepDur() * 1.6, 0.22, musicBus, { cutoff: 900 });
  if (i % m.arpEvery === 0) {
    const n = chord[m.arp[(i / m.arpEvery) % m.arp.length]] + 12;
    const g = ctx.createGain(); g.gain.value = 1; g.connect(musicBus); g.connect(delay);
    osc('square', midi(n), t, stepDur() * 1.5, 0.05, g, { cutoff: 3200 });
  }
  if (i === 0) chord.forEach((n, k) => { osc('sawtooth', midi(n), t, stepDur() * 15, m.pad, musicBus, { attack: 0.5, detune: k % 2 ? 9 : -9, cutoff: 1500 }); });
  if (m.lead && bar % 2 === 1 && (i === 0 || i === 6 || i === 10)) {
    const g = ctx.createGain(); g.connect(musicBus); g.connect(delay);
    osc('triangle', midi(chord[(i / 2) % 4] + 24), t, stepDur() * 3, 0.07, g, { attack: 0.02 });
  }
}

function tick() {
  if (!playing) return;
  while (nextTime < ctx.currentTime + 0.2) {
    if (pendingMood && step % 16 === 0) { mood = pendingMood; pendingMood = null; delay.delayTime.value = stepDur() * 3; }
    schedule(step, nextTime);
    nextTime += stepDur();
    step++;
  }
}

export const audio = {
  state,
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  // Los navegadores exigen un gesto del usuario: se llama desde el primer clic o toque.
  start() {
    if (playing || !ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    playing = true;
    delay.delayTime.value = stepDur() * 3;
    nextTime = ctx.currentTime + 0.1;
    step = 0;
    timer = setInterval(tick, 50);
  },
  setMood(next) {
    if (!MOODS[next] || (next === mood && !pendingMood)) return;
    if (!playing) { mood = next; return; }
    pendingMood = next;
  },
  toggleMute() { state.muted = !state.muted; ensure() && applyVolume(); save(); if (!state.muted) this.start(); },
  setVolume(v) { state.volume = Math.min(1, Math.max(0, v)); if (state.volume > 0 && state.muted) state.muted = false; ensure() && applyVolume(); save(); },
  sfx(name) {
    if (!ensure() || state.muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime + 0.01;
    const g = ctx.createGain(); g.connect(sfxBus); g.connect(delay);
    const notes = (list, type = 'square', len = 0.14, peak = 0.12) => list.forEach(([n, d]) => osc(type, midi(n), t + d, len, peak, g, { cutoff: 4000 }));
    switch (name) {
      case 'correct': notes([[76, 0], [81, 0.07], [88, 0.14]], 'square', 0.18, 0.13); break;
      case 'wrong': { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.45); o.connect(og); og.connect(sfxBus); env(og, t, 0.01, 0.16, 0.5); o.start(t); o.stop(t + 0.55); break; }
      case 'tick': osc('square', 1320, t, 0.04, 0.06, sfxBus); break;
      case 'go': notes([[69, 0], [76, 0.08], [81, 0.16]], 'sawtooth', 0.2, 0.1); noise(t, 0.4, 0.12, sfxBus, 'bandpass', 3000); break;
      case 'power': { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(1800, t + 0.25); o.connect(og); og.connect(g); env(og, t, 0.01, 0.1, 0.3); o.start(t); o.stop(t + 0.35); break; }
      case 'join': notes([[72, 0], [79, 0.08]], 'triangle', 0.16, 0.14); break;
      case 'nav': noise(t, 0.18, 0.05, sfxBus, 'bandpass', 2400); break;
      case 'riser': { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain(); s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.Q.value = 6; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(6000, t + 4.8); s.connect(f); f.connect(ng); ng.connect(sfxBus); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.14, t + 4.6); ng.gain.exponentialRampToValueAtTime(0.0001, t + 5); s.start(t); s.stop(t + 5.1); break; }
      case 'win': notes([[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [79, 0.52], [84, 0.64], [88, 0.8]], 'square', 0.24, 0.12); break;
      default: break;
    }
  },
};
