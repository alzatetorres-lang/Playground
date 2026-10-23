// Música de fondo generada con WebAudio: sin archivos. Arpegio suave sobre Am-F-C-G con bajo y pad.
const STORE = 'pg_audio';
const CHORDS = [
  { root: 57, notes: [57, 60, 64, 67] }, // Am
  { root: 53, notes: [53, 57, 60, 64] }, // F
  { root: 48, notes: [48, 52, 55, 59] }, // C
  { root: 55, notes: [55, 59, 62, 65] }, // G
];
const BPM = 92;
const STEP = 60 / BPM / 2; // corcheas
const midi = n => 440 * 2 ** ((n - 69) / 12);

let ctx = null, master = null, musicGain = null, sfxGain = null, timer = null, nextTime = 0, step = 0, playing = false;
const state = { muted: false, volume: 0.5 };
try { Object.assign(state, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch {}
const listeners = new Set();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} listeners.forEach(f => f(state)); };

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 2400;
  musicGain = ctx.createGain(); musicGain.gain.value = 0.55;
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9;
  musicGain.connect(filter); filter.connect(master); sfxGain.connect(master); master.connect(ctx.destination);
  applyVolume();
  return ctx;
}

function applyVolume() {
  if (!master) return;
  const v = state.muted ? 0 : state.volume * 0.35;
  master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

function tone(freq, when, dur, { type = 'triangle', gain = 0.2, attack = 0.01, dest = musicGain } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g); g.connect(dest);
  o.start(when); o.stop(when + dur + 0.05);
}

function schedule(s, when) {
  const bar = Math.floor(s / 8) % CHORDS.length;
  const chord = CHORDS[bar];
  const inBar = s % 8;
  // Arpegio
  const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
  const note = chord.notes[pattern[inBar]] + 12;
  tone(midi(note), when, STEP * 1.8, { type: 'triangle', gain: inBar % 2 ? 0.07 : 0.1 });
  // Bajo en tiempos 1 y 3
  if (inBar === 0 || inBar === 4) tone(midi(chord.root - 12), when, STEP * 3.6, { type: 'sine', gain: 0.22, attack: 0.02 });
  // Pad al inicio del compás
  if (inBar === 0) chord.notes.forEach(n => tone(midi(n), when, STEP * 7.5, { type: 'sine', gain: 0.04, attack: 0.4 }));
  // Melodía suave cada dos compases
  if (s % 16 === 6) tone(midi(chord.notes[3] + 24), when, STEP * 2.5, { type: 'sine', gain: 0.06 });
  // Percusión muy ligera
  if (inBar % 4 === 2) noise(when, 0.03, 0.04);
}

function noise(when, dur, gain) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 6000;
  src.buffer = buf; g.gain.value = gain;
  src.connect(hp); hp.connect(g); g.connect(musicGain);
  src.start(when);
}

function tick() {
  if (!playing) return;
  while (nextTime < ctx.currentTime + 0.25) {
    schedule(step, nextTime);
    nextTime += STEP;
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
    nextTime = ctx.currentTime + 0.1;
    step = 0;
    timer = setInterval(tick, 80);
  },
  toggleMute() { state.muted = !state.muted; ensure() && applyVolume(); save(); if (!state.muted) this.start(); },
  setVolume(v) { state.volume = Math.min(1, Math.max(0, v)); if (state.volume > 0 && state.muted) state.muted = false; ensure() && applyVolume(); save(); },
  sfx(name) {
    if (!ensure() || state.muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime + 0.01;
    const o = { dest: sfxGain, type: 'square' };
    const seq = {
      correct: [[659, 0], [880, 0.09], [1175, 0.18]],
      wrong: [[220, 0], [165, 0.12]],
      tick: [[880, 0]],
      power: [[392, 0], [523, 0.07], [784, 0.14], [1047, 0.21]],
      join: [[523, 0], [659, 0.08]],
      win: [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.3], [784, 0.42], [1047, 0.54]],
      go: [[440, 0], [587, 0.1]],
    }[name];
    seq?.forEach(([f, d]) => tone(f, t + d, name === 'tick' ? 0.06 : 0.16, { ...o, gain: name === 'tick' ? 0.05 : 0.09 }));
  },
};
