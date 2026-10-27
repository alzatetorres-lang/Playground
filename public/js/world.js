// El universo de Circuitia: mundos (modos de juego), personajes, prólogo y mapa.
import { botSvg } from './avatar.js';
import { onBot3D } from './avatar.js';
import { esc, store } from './ui.js';

export const CHARACTERS = {
  volt: { name: 'Volt', avatar: { body: 0, eyes: 1, antenna: 0, mouth: 0, accessory: 1, color: 3, skin: 0 } },
  chispa: { name: 'Chispa', avatar: { body: 1, eyes: 4, antenna: 4, mouth: 2, accessory: 3, color: 0, skin: 3 } },
  glitch: { name: 'Rey Glitch', avatar: { body: 3, eyes: 2, antenna: 2, mouth: 3, accessory: 5, color: 4, skin: 10 } },
};

export const WORLDS = [
  { mode: 'classic', n: 1, name: 'Arena Neón', icon: '⚡', color: 'var(--lime)', solo: true, x: 90, y: 470,
    story: 'La primera parada. El público de la Arena aplaude cada respuesta rápida, y entre ronda y ronda alguien tiene que pintar en la pantalla gigante.',
    rules: ['Preguntas a la vez para todos, con cuenta atrás.', 'Doble apuesta, Escudo y Robo de tiempo.', 'Rondas de dibujo: uno dibuja y el resto adivina.'] },
  { mode: 'chips', n: 2, name: 'Mina de Chips', icon: '💠', color: 'var(--cyan)', solo: true, x: 250, y: 330,
    story: 'En las cuevas de cristal, el Rey Glitch escondió cápsulas trampa. Algunas multiplican tus chips; otras te dejan robar al vecino.',
    rules: ['Cada uno va a su ritmo durante el tiempo de la partida.', 'Al acertar eliges 1 de 3 cápsulas: ganar, duplicar, perder, robar, intercambiar o escudo.', 'Gana quien tenga más chips al final.'] },
  { mode: 'race', n: 3, name: 'Autopista Turbo', icon: '🏁', color: 'var(--amber)', solo: true, x: 420, y: 430,
    story: 'Una autopista de luz cruza el sistema. Los robots compiten por llegar primero al Chip de la Velocidad.',
    rules: ['Cada acierto te adelanta una casilla.', 'Tres seguidos: turbo. Cinco seguidos: pulso EMP al líder.', 'Gana quien llega antes a la meta.'] },
  { mode: 'fish', n: 4, name: 'Mar de Datos', icon: '🐟', color: '#5ee7ff', solo: true, x: 560, y: 270,
    story: 'Un océano de información brillante. Ahí abajo nadan peces-robot raros… y dicen que hasta un Kraken Cuántico.',
    rules: ['Cada acierto pesca un pez con su peso.', 'Las rachas mejoran el cebo; fallar lo reinicia.', 'Durante el Frenesí, todo pesa el doble.'] },
  { mode: 'hack', n: 5, name: 'Fortaleza Firewall', icon: '🔓', color: 'var(--magenta)', solo: false, x: 730, y: 380,
    story: 'Los guardianes del Firewall protegen sus bits con contraseñas. Mina los tuyos y prueba a colarte en los de los demás.',
    rules: ['Acertar mina bits; la racha multiplica.', 'Tras un acierto puedes hackear: adivina su contraseña entre 3.', 'Si aciertas, le robas el 20 % de sus bits.'] },
  { mode: 'draw', n: 6, name: 'Taller de Grafitis', icon: '🎨', color: '#b06bff', solo: false, x: 860, y: 220,
    story: 'Los muros del Taller cambian de color con cada trazo. Aquí el chip solo aparece cuando todos adivinan el dibujo.',
    rules: ['Solo rondas de dibujo.', 'Un jugador al azar dibuja; nadie repite hasta que todos han dibujado.', 'Acertar antes da más puntos; el dibujante gana por cada acierto.'] },
  { mode: 'battle', n: 7, name: 'Coliseo de Glitch', icon: '👑', color: '#ff5e5e', solo: false, x: 700, y: 90,
    story: 'El trono del Rey Glitch. Tres vidas, ni una más. Quien quede en pie recupera el último chip y repara el Núcleo.',
    rules: ['Preguntas a la vez para todos.', 'Fallar o no responder quita una vida (si fallan todos, nadie pierde).', 'Gana el último robot en pie.'] },
];
// Ilustraciones en WebP: 'sm' (400 px) para miniaturas, completa (1280 px) para banners.
export const worldArt = (mode, size = '') => `/img/worlds/${mode || 'classic'}${size === 'sm' ? '-sm' : size === 'xs' ? '-xs' : ''}.webp`;
export const worldSrcset = mode => `${worldArt(mode, 'sm')} 400w, /img/worlds/${mode || 'classic'}-md.webp 720w, ${worldArt(mode)} 1280w`;
export const worldOf = mode => WORLDS.find(w => w.mode === mode) || WORLDS[0];

export const freedWorlds = () => store.get('pg_worlds', []);
export function freeWorld(mode) {
  const list = freedWorlds();
  if (!list.includes(mode)) { list.push(mode); store.set('pg_worlds', list); return true; }
  return false;
}

// Camino curvo que une los mundos en orden (estilo mapa de plataformas clásico).
function pathD() {
  return WORLDS.reduce((d, w, i) => {
    if (i === 0) return `M${w.x},${w.y}`;
    const p = WORLDS[i - 1];
    const mx = (p.x + w.x) / 2;
    return `${d} C${mx},${p.y} ${mx},${w.y} ${w.x},${w.y}`;
  }, '');
}

const PROLOGUE = [
  { who: 'chispa', title: 'El Núcleo', text: 'En el sistema Circuitia, todo funciona gracias al Núcleo: un cristal de datos que da luz y energía a cada robot.' },
  { who: 'glitch', title: 'El Rey Glitch', text: 'Una noche, un virus con corona lo rompió en siete Chips del Núcleo y los escondió en siete mundos. Las luces empezaron a apagarse.' },
  { who: 'volt', title: 'Volt despierta', text: 'Volt, un pequeño robot de reparación, encendió su propulsor. Con su dron Chispa, salió a buscar los chips.' },
  { who: 'you', title: 'Ahora te toca a ti', text: 'Volt no puede solo. Reúne a tu equipo, crea una sala y recorred los mundos. Cada partida libera uno.' },
];

export function homeHtml({ nameField, robotCard }) {
  const freed = freedWorlds();
  const voltImg = botSvg(CHARACTERS.volt.avatar, { size: 'lg', mood: 'happy' });
  return `
  <section class="intro">
    <div class="intro-copy">
      <div class="small">Episodio 1 · El Núcleo roto</div>
      <h1 class="title-glitch" data-text="Salva Circuitia" data-decode>Salva <span>Circuitia</span></h1>
      <p>Un videojuego de preguntas y dibujo para jugar en grupo. Siete mundos, siete modos de juego y un rey virus al que vencer. Hasta 10 jugadores desde el móvil.</p>
      <div class="row"><a class="btn" href="#/" data-act="tomap">Ver el mapa</a><a class="btn violet" href="#/library">Crear partida</a></div>
      <div class="progress-chips" aria-label="Chips recuperados">${WORLDS.map(w => `<i class="${freed.includes(w.mode) ? 'on' : ''}" style="--c:${w.color}" title="${esc(w.name)}"></i>`).join('')}<span class="small">${freed.length}/7 chips</span></div>
    </div>
    <div class="intro-hero">
      <div class="volt-stage"><div id="volt-live">${voltImg}</div><div class="bot-floor"></div></div>
      <div class="bubble" id="volt-say" aria-live="polite"></div>
    </div>
  </section>

  <section class="cinema reveal" aria-label="Tráiler">
    <video class="cinema-video" data-src="/video/trailer.mp4" poster="/video/trailer-poster-960.webp" muted loop playsinline preload="none" aria-hidden="true"></video>
    <div class="cinema-ui"><div class="small">Tráiler · Episodio 1</div><button class="violet" data-act="trailer">▶ Ver tráiler</button></div>
  </section>
  <dialog class="trailer-dialog" id="trailer-dialog"><video src="/video/trailer.mp4" controls playsinline preload="none"></video><button class="ghost" data-act="closetrailer" aria-label="Cerrar tráiler">✕ Cerrar</button></dialog>

  <section class="prologue" aria-label="Prólogo">
    ${PROLOGUE.map((p, i) => `<article class="panel reveal" style="--i:${i}">
      <div class="panel-art">${p.who === 'you' ? '<div class="you-crew">' + [0, 1, 2].map(() => botSvg({ body: Math.floor(Math.random() * 5), eyes: Math.floor(Math.random() * 5), antenna: Math.floor(Math.random() * 5), mouth: Math.floor(Math.random() * 4), accessory: Math.floor(Math.random() * 6), color: Math.floor(Math.random() * 8) })).join('') + '</div>' : botSvg(CHARACTERS[p.who].avatar, { mood: p.who === 'glitch' ? undefined : 'happy' })}</div>
      <div><div class="small">Capítulo ${i + 1}</div><h2 class="panel-title">${esc(p.title)}</h2><p>${esc(p.text)}</p></div>
    </article>`).join('')}
  </section>

  <section class="card map-card" id="map">
    <div class="row between"><h2 data-decode>Mapa de Circuitia</h2><span class="small">${freed.length === 7 ? 'Núcleo reparado' : `${7 - freed.length} mundos por liberar`}</span></div>
    <div class="map-wrap">
      <svg class="map" viewBox="0 0 1000 560" role="group" aria-label="Mapa de mundos">
        <defs>
          <linearGradient id="road" x1="0" x2="1"><stop offset="0" stop-color="#c8ff2e"/><stop offset=".5" stop-color="#27f3ff"/><stop offset="1" stop-color="#ff2e93"/></linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <path d="${pathD()}" class="road-shadow"/>
        <path d="${pathD()}" class="road" stroke="url(#road)"/>
        <path d="${pathD()}" class="road-dash"/>
        ${WORLDS.map(w => `<g class="node ${freed.includes(w.mode) ? 'freed' : ''}" data-act="world" data-mode="${w.mode}" tabindex="0" role="button" aria-label="Mundo ${w.n}: ${esc(w.name)}" transform="translate(${w.x} ${w.y})" style="--c:${w.color}">
          <circle r="46" class="halo"/><clipPath id="cp-${w.mode}"><circle r="34"/></clipPath><circle r="34" class="planet"/>
          <image href="${worldArt(w.mode, 'sm')}" x="-60" y="-34" width="121" height="68" clip-path="url(#cp-${w.mode})" preserveAspectRatio="xMidYMid slice" class="planet-art"/>
          <ellipse rx="54" ry="12" class="ring"/>
          <text class="ico" x="26" y="34" text-anchor="middle">${w.icon}</text>
          <text class="lbl" y="72" text-anchor="middle">${w.n}. ${esc(w.name)}</text>
          ${freed.includes(w.mode) ? '<text class="ok" x="30" y="-28">✔</text>' : ''}
        </g>`).join('')}
        <g id="map-volt" class="map-volt" style="transform:translate(${WORLDS[0].x}px, ${WORLDS[0].y - 70}px)"><image href="" width="76" height="76" x="-38" y="-46"/></g>
      </svg>
    </div>
    <div id="world-detail"></div>
  </section>

  <div class="ticker" aria-hidden="true"><div>${[0, 1].map(() => WORLDS.map(w => `<span>${w.icon} ${esc(w.name)}</span>`).join('')).join('')}</div></div>

  <div class="split">
    <section class="card"><h2>Unirme con código</h2>${nameField()}
      <label for="code">Código de sala</label><input id="code" maxlength="5" placeholder="ABCDE" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase;letter-spacing:.3em;font-family:var(--font-mono);font-weight:700">
      <button class="wide" data-act="join">Entrar a la sala</button></section>
    ${robotCard()}
  </div>`;
}

export function worldDetailHtml(mode) {
  const w = worldOf(mode);
  const freed = freedWorlds().includes(w.mode);
  return `<div class="world-detail" style="--c:${w.color}">
    <div class="wd-art"><img src="${worldArt(w.mode, 'sm')}" srcset="${worldSrcset(w.mode)}" sizes="(max-width: 720px) 92vw, 340px" width="400" height="225" alt="Ilustración de ${esc(w.name)}" loading="lazy" decoding="async"><span class="wd-icon">${w.icon}</span></div>
    <div class="wd-body">
      <div class="small">Mundo ${w.n}${freed ? ' · liberado' : ''}</div>
      <h3>${esc(w.name)}</h3>
      <p>${esc(w.story)}</p>
      <ul class="rules">${w.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="row"><a class="btn" href="#/library?mode=${w.mode}">Jugar en directo</a>${w.solo ? `<a class="btn violet" href="#/library?mode=${w.mode}&solo=1">Jugar solo</a>` : '<span class="pill">Mínimo 2 jugadores</span>'}</div>
    </div>
  </div>`;
}

// Animaciones de la portada: Volt habla, camina por el mapa y los capítulos aparecen al hacer scroll.
let voltViewer = null, sayTimer = null;
export function mountHome() {
  // El tráiler solo se descarga y reproduce cuando entra en pantalla (y nunca si el usuario ahorra datos o prefiere menos movimiento).
  const cine = document.querySelector('.cinema-video');
  if (cine && !navigator.connection?.saveData && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) { if (!cine.src) cine.src = cine.dataset.src; cine.play().catch(() => {}); } else if (cine.src) cine.pause();
      }
    }, { threshold: 0.5 });
    // Se empieza a vigilar cuando la página ya terminó de cargar, para no robarle ancho de banda.
    // El tráiler también espera a la primera interacción.
    window.addEventListener('pg:enhance', () => io.observe(cine), { once: true });
  }
  const live = document.querySelector('#volt-live');
  voltViewer = null;
  onBot3D(m => {
    if (!live || !document.body.contains(live)) return;
    const img = document.querySelector('#map-volt image');
    if (img) img.setAttribute('href', m.botImage(CHARACTERS.volt.avatar, 'happy'));
    voltViewer = m.mountBot(live, CHARACTERS.volt.avatar, { size: Math.min(300, window.innerWidth * 0.62) });
  });
  const lines = ['¡Hola! Soy Volt.', 'El Rey Glitch rompió el Núcleo en siete chips.', '¿Me ayudas a recuperarlos?', 'Crea una sala y trae a tus amigos.', 'Tócame si quieres que salude.'];
  const say = document.querySelector('#volt-say');
  let li = 0;
  clearInterval(sayTimer);
  const type = () => {
    if (!document.body.contains(say)) return clearInterval(sayTimer);
    const text = lines[li++ % lines.length];
    let i = 0;
    const t = setInterval(() => { say.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(t); }, 28);
  };
  // Volt empieza a hablar con la primera interacción (o ya, si la página ya estaba activa).
  const startTalking = () => { type(); sayTimer = setInterval(type, 3600); };
  if (document.body.classList.contains('enhanced')) startTalking(); else { say.textContent = lines[0]; window.addEventListener('pg:enhance', startTalking, { once: true }); }

  const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.2 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  const firstOpen = WORLDS.find(w => !freedWorlds().includes(w.mode)) || WORLDS[0];
  selectWorld(firstOpen.mode, false);
}

export function selectWorld(mode, walk = true) {
  const w = worldOf(mode);
  const volt = document.querySelector('#map-volt');
  if (volt) {
    volt.classList.toggle('walking', walk);
    volt.style.transform = `translate(${w.x}px, ${w.y - 70}px)`;
    setTimeout(() => volt.classList.remove('walking'), 900);
  }
  document.querySelectorAll('.map .node').forEach(n => n.classList.toggle('sel', n.dataset.mode === mode));
  const detail = document.querySelector('#world-detail');
  if (detail) detail.innerHTML = worldDetailHtml(mode);
  voltViewer?.wave();
}
