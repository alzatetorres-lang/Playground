// Robots 3D de Circuitia. Se construyen pieza a pieza a partir de la configuración del avatar.
// - botImage(): foto del robot (dataURL) cacheada, para listas, marcadores y podio.
// - mountBot(): visor vivo que flota, parpadea, saluda y se gira con el dedo o el ratón.
import * as THREE from '/vendor/three/three.module.js';
import { RoundedBoxGeometry } from '/vendor/three-addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from '/vendor/three-addons/environments/RoomEnvironment.js';

export const COLORS = ['#c8ff2e', '#b9a8ff', '#ffb5a0', '#5ee7ff', '#ff6fd0', '#ffd166', '#5dffb0', '#ff6b6b'];
export const SKIN_INFO = [
  { name: 'Estándar', rarity: 'común' }, { name: 'Pastel', rarity: 'común' }, { name: 'Mate', rarity: 'común' },
  { name: 'Neón', rarity: 'raro' }, { name: 'Carbono', rarity: 'raro' }, { name: 'Cromo', rarity: 'épico' }, { name: 'Oro', rarity: 'épico' },
  { name: 'Holograma', rarity: 'legendario' }, { name: 'Lava', rarity: 'legendario' }, { name: 'Galaxia', rarity: 'mítico' }, { name: 'Glitch', rarity: 'mítico' },
];
export const RARITY_COLOR = { común: '#9aa6cf', raro: '#27f3ff', épico: '#b06bff', legendario: '#ffc83d', mítico: '#ff2e93' };

let shared = null; // renderer de fotos compartido
let envTexture = null;
const cache = new Map();

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
export const has3D = webglOk();

function environment(renderer) {
  if (envTexture) return envTexture;
  const pmrem = new THREE.PMREMGenerator(renderer);
  envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return envTexture;
}

let starTex = null;
function starsTexture() {
  if (starTex) return starTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 256); grad.addColorStop(0, '#1b0b3a'); grad.addColorStop(0.5, '#3a0f5c'); grad.addColorStop(1, '#071a3a');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 2 + 0.5, Math.random() * 2 + 0.5); }
  for (let i = 0; i < 6; i++) { const x = Math.random() * 256, y = Math.random() * 256; const r = g.createRadialGradient(x, y, 0, x, y, 40); r.addColorStop(0, 'rgba(255,46,147,.45)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256); }
  starTex = new THREE.CanvasTexture(c); starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

// Materiales por acabado: el cuerpo usa el color del avatar; los detalles, tonos fijos.
function materials(color, skin) {
  const c = new THREE.Color(color);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const ink = std({ color: 0x14161f, roughness: 0.4, metalness: 0.2 });
  const glow = (col, i = 1.6) => std({ color: col, emissive: col, emissiveIntensity: i, roughness: 0.3 });
  switch (skin) {
    case 1: return { body: std({ color: c.clone().lerp(new THREE.Color('#ffffff'), 0.45), roughness: 0.75 }), trim: std({ color: '#ffffff', roughness: 0.6 }), ink, glow };
    case 2: return { body: std({ color: c.clone().multiplyScalar(0.7), roughness: 1 }), trim: std({ color: '#2b2f3f', roughness: 1 }), ink, glow };
    case 3: return { body: std({ color: '#101320', roughness: 0.35, metalness: 0.4, emissive: c, emissiveIntensity: 0.35 }), trim: glow(c, 2.2), ink, glow };
    case 4: return { body: std({ color: '#1c1f28', roughness: 0.28, metalness: 0.7 }), trim: std({ color: c, roughness: 0.3, metalness: 0.4 }), ink, glow };
    case 5: return { body: std({ color: '#e8ecf5', roughness: 0.08, metalness: 1 }), trim: std({ color: c, roughness: 0.15, metalness: 1 }), ink, glow };
    case 6: return { body: std({ color: '#ffc83d', roughness: 0.18, metalness: 1 }), trim: std({ color: '#fff1b8', roughness: 0.2, metalness: 1 }), ink, glow };
    case 7: { const holo = new THREE.MeshStandardMaterial({ color: '#5ee7ff', emissive: '#27f3ff', emissiveIntensity: 0.9, transparent: true, opacity: 0.55, roughness: 0.2, depthWrite: false }); return { body: holo, trim: glow('#e8ffff', 1.8), ink: glow('#27f3ff', 2), glow, holo: true }; }
    case 8: return { body: std({ color: '#2a0d06', roughness: 0.9, emissive: '#ff3d00', emissiveIntensity: 0.55 }), trim: glow('#ff7a1a', 2), ink, glow };
    case 9: return { body: std({ map: starsTexture(), emissive: '#ffffff', emissiveMap: starsTexture(), emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.3 }), trim: glow('#ff2e93', 1.8), ink, glow };
    case 10: return { body: std({ color: '#ff2e93', emissive: '#ff2e93', emissiveIntensity: 0.3, roughness: 0.3 }), trim: glow('#27f3ff', 2.2), ink: glow('#c8ff2e', 1.6), glow, glitch: true };
    default: return { body: std({ color: c, roughness: 0.42, metalness: 0.12 }), trim: std({ color: '#f1f4ff', roughness: 0.5, metalness: 0.2 }), ink, glow };
  }
}

const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

function headGeometry(kind) {
  switch (kind) {
    case 1: return { geo: new THREE.SphereGeometry(0.62, 40, 28), top: 0.62, front: 0.6, w: 0.62 };
    case 2: return { geo: new RoundedBoxGeometry(1.0, 1.25, 0.9, 5, 0.26), top: 0.63, front: 0.45, w: 0.5 };
    case 3: { const g = new THREE.CylinderGeometry(0.66, 0.66, 0.95, 6); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 6); return { geo: g, top: 0.58, front: 0.48, w: 0.6 }; }
    case 4: { const g = new THREE.CapsuleGeometry(0.42, 0.62, 10, 24); g.rotateZ(Math.PI / 2); return { geo: g, top: 0.42, front: 0.4, w: 0.72 }; }
    default: return { geo: new RoundedBoxGeometry(1.25, 1.0, 0.95, 5, 0.22), top: 0.5, front: 0.48, w: 0.62 };
  }
}

// Construye el robot. Devuelve el grupo y las piezas que se animan.
export function buildBot(cfg = {}) {
  const a = { body: 0, eyes: 0, antenna: 0, mouth: 0, accessory: 0, color: 0, skin: 0, ...cfg };
  const mat = materials(COLORS[a.color] || COLORS[0], a.skin);
  const root = new THREE.Group();
  const floater = new THREE.Group(); root.add(floater);
  const headG = new THREE.Group(); headG.position.y = 0.55; floater.add(headG);
  const h = headGeometry(a.body);
  headG.add(mesh(h.geo, mat.body));
  if (mat.holo) headG.add(new THREE.Mesh(h.geo, new THREE.MeshBasicMaterial({ color: '#bffcff', wireframe: true, transparent: true, opacity: 0.35 })));
  // Pantalla de la cara
  const face = mesh(new RoundedBoxGeometry(h.w * 1.55, 0.62, 0.08, 3, 0.04), mat.ink, 0, 0.02, h.front);
  headG.add(face);

  // Ojos
  const eyes = new THREE.Group(); eyes.position.set(0, 0.08, h.front + 0.05); headG.add(eyes);
  const eyeX = 0.24;
  const glowEye = mat.glow(a.skin === 10 ? '#c8ff2e' : '#27f3ff', 2.4);
  for (const side of [-1, 1]) {
    let e;
    if (a.eyes === 1) { e = new THREE.Group(); e.add(mesh(new THREE.SphereGeometry(0.13, 20, 16), mat.glow('#ffffff', 0.6))); e.add(mesh(new THREE.SphereGeometry(0.065, 16, 12), mat.ink, 0.01 * side, -0.01, 0.1)); }
    else if (a.eyes === 2) { e = mesh(new RoundedBoxGeometry(0.22, 0.08, 0.05, 2, 0.03), glowEye); }
    else if (a.eyes === 3) { const g = new THREE.TorusGeometry(0.09, 0.025, 8, 20, Math.PI); e = mesh(g, glowEye); }
    else if (a.eyes === 4) { e = mesh(new THREE.BoxGeometry(0.14, 0.14, 0.04), mat.glow('#c8ff2e', 2.2)); }
    else e = mesh(new THREE.SphereGeometry(0.075, 16, 12), glowEye);
    e.position.x = eyeX * side;
    eyes.add(e);
  }
  // Boca
  let mouth;
  const my = -0.17, mz = h.front + 0.06;
  if (a.mouth === 1) { mouth = new THREE.Group(); for (let i = -1; i <= 1; i++) mouth.add(mesh(new THREE.BoxGeometry(0.06, 0.07, 0.03), glowEye, i * 0.08, 0, 0)); }
  else if (a.mouth === 2) { mouth = mesh(new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat.glow('#ff6b8b', 1.2)); mouth.rotation.x = Math.PI; }
  else if (a.mouth === 3) { const pts = [-0.12, -0.06, 0, 0.06, 0.12].map((x, i) => new THREE.Vector3(x, i % 2 ? 0.03 : -0.02, 0)); mouth = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.014, 6), glowEye); }
  else { mouth = mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 20, Math.PI), glowEye); mouth.rotation.z = Math.PI; }
  mouth.position.set(0, my, mz);
  headG.add(mouth);

  // Antena
  const antenna = new THREE.Group(); antenna.position.y = h.top; headG.add(antenna);
  const stem = (x = 0, tilt = 0) => { const s = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 8), mat.trim, x, 0.16, 0); s.rotation.z = tilt; return s; };
  if (a.antenna === 1) { antenna.add(stem(-0.16, 0.3), stem(0.16, -0.3)); antenna.add(mesh(new THREE.SphereGeometry(0.07, 16, 12), mat.glow('#ff2e93', 1.8), -0.21, 0.33, 0), mesh(new THREE.SphereGeometry(0.07, 16, 12), mat.glow('#ff2e93', 1.8), 0.21, 0.33, 0)); }
  else if (a.antenna === 2) { antenna.add(stem()); const st = mesh(new THREE.OctahedronGeometry(0.13), mat.glow('#ffc83d', 1.6), 0, 0.4, 0); antenna.add(st); antenna.userData.spin = st; }
  else if (a.antenna === 3) { const curve = new THREE.CatmullRomCurve3(Array.from({ length: 30 }, (_, i) => new THREE.Vector3(Math.cos(i * 0.9) * 0.06, i * 0.013, Math.sin(i * 0.9) * 0.06))); antenna.add(mesh(new THREE.TubeGeometry(curve, 60, 0.015, 6), mat.trim)); antenna.add(mesh(new THREE.SphereGeometry(0.07, 16, 12), mat.body, 0, 0.42, 0)); }
  else if (a.antenna === 4) { antenna.add(stem()); antenna.add(mesh(new THREE.SphereGeometry(0.08, 16, 12), mat.glow('#ff3b3b', 2.5), 0, 0.36, 0)); }
  else { antenna.add(stem()); antenna.add(mesh(new THREE.SphereGeometry(0.08, 16, 12), mat.trim, 0, 0.36, 0)); }

  // Accesorios
  if (a.accessory === 1) { const band = mesh(new THREE.TorusGeometry(h.w + 0.12, 0.04, 8, 30, Math.PI), mat.ink); headG.add(band); for (const s of [-1, 1]) { const cup = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 20), mat.trim, (h.w + 0.12) * s, 0, 0); cup.rotation.z = Math.PI / 2; headG.add(cup); } }
  else if (a.accessory === 2) { const bow = new THREE.Group(); for (const s of [-1, 1]) { const c = mesh(new THREE.ConeGeometry(0.1, 0.18, 4), mat.glow('#ff2e5e', 0.8), 0.09 * s, 0, 0); c.rotation.z = (Math.PI / 2) * s; bow.add(c); } bow.position.set(0, -0.08, 0.36); floater.add(bow); }
  else if (a.accessory === 3) { for (const s of [-1, 1]) { const d = mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshBasicMaterial({ color: '#ff7aa8', transparent: true, opacity: 0.8 }), 0.36 * s, -0.12, h.front + 0.06); headG.add(d); } }
  else if (a.accessory === 4) { for (const s of [-1, 1]) { const b = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 6), mat.trim, (h.w + 0.06) * s, 0, 0); b.rotation.z = Math.PI / 2; headG.add(b); } }
  else if (a.accessory === 5) { const cap = mesh(new THREE.SphereGeometry(h.w * 0.95, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.glow('#4a1dc2', 0.5), 0, h.top - 0.12, 0); headG.add(cap); headG.add(mesh(new THREE.CylinderGeometry(h.w * 0.6, h.w * 0.6, 0.04, 24, 1, false, 0, Math.PI), mat.glow('#4a1dc2', 0.5), 0, h.top - 0.12, 0.25)); }

  // Cuerpo, brazos y propulsor
  const torso = mesh(new RoundedBoxGeometry(0.7, 0.5, 0.55, 4, 0.16), mat.body, 0, -0.3, 0); floater.add(torso);
  floater.add(mesh(new THREE.CircleGeometry(0.12, 20), mat.glow(a.skin === 8 ? '#ff7a1a' : '#27f3ff', 2), 0, -0.28, 0.28));
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.45, -0.22, 0); armR.position.set(0.45, -0.22, 0);
  armL.add(mesh(new THREE.CapsuleGeometry(0.08, 0.26, 6, 12), mat.trim, 0, -0.16, 0));
  armR.add(mesh(new THREE.CapsuleGeometry(0.08, 0.26, 6, 12), mat.trim, 0, -0.16, 0));
  armL.rotation.z = -0.35; armR.rotation.z = 0.35;
  floater.add(armL, armR);
  const thruster = mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 30), mat.glow(a.skin === 8 ? '#ff7a1a' : '#27f3ff', 2.4), 0, -0.66, 0);
  thruster.rotation.x = Math.PI / 2; floater.add(thruster);

  if (mat.glitch) root.traverse(o => { if (o.isMesh && Math.random() < 0.25) o.position.x += (Math.random() - 0.5) * 0.06; });
  return { root, parts: { floater, headG, eyes, antenna, armR, thruster } };
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1030, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 3, 4); scene.add(key);
  const rimA = new THREE.DirectionalLight(0x27f3ff, 2.5); rimA.position.set(-4, 1, -2); scene.add(rimA);
  const rimB = new THREE.DirectionalLight(0xff2e93, 2); rimB.position.set(4, -1, -3); scene.add(rimB);
}

function makeRenderer(size, preserve) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: preserve });
  r.setPixelRatio(1);
  r.setSize(size, size, false);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

const keyOf = (cfg, mood) => JSON.stringify([cfg?.body, cfg?.eyes, cfg?.antenna, cfg?.mouth, cfg?.accessory, cfg?.color, cfg?.skin, mood || '']);

// Foto del robot. Se renderiza una vez por configuración y se guarda.
export function botImage(cfg, mood) {
  if (!has3D) return null;
  const key = keyOf(cfg, mood);
  if (cache.has(key)) return cache.get(key);
  if (!shared) {
    const renderer = makeRenderer(256, true);
    const scene = new THREE.Scene();
    scene.environment = environment(renderer);
    lights(scene);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(1.1, 0.7, 4.6);
    camera.lookAt(0, 0.12, 0);
    shared = { renderer, scene, camera };
  }
  const { renderer, scene, camera } = shared;
  const { root, parts } = buildBot(cfg);
  root.rotation.y = -0.35;
  if (mood === 'happy') { parts.armR.rotation.z = 2.3; parts.headG.rotation.z = 0.12; }
  if (mood === 'sad') { parts.headG.rotation.x = 0.35; parts.headG.position.y -= 0.05; parts.armR.rotation.z = 0.1; }
  scene.add(root);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(root);
  root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
  cache.set(key, url);
  return url;
}

// Visor vivo. Devuelve un objeto con update(cfg) y destroy().
const viewers = new Set();
export function mountBot(container, cfg, { size = 240, drag = true } = {}) {
  if (!has3D) return null;
  const renderer = makeRenderer(size * Math.min(2, window.devicePixelRatio || 1), false);
  const canvas = renderer.domElement;
  canvas.className = 'bot3d';
  canvas.style.width = canvas.style.height = `${size}px`;
  container.innerHTML = '';
  container.appendChild(canvas);
  const scene = new THREE.Scene();
  scene.environment = environment(renderer);
  lights(scene);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.5, 4.8);
  camera.lookAt(0, 0.1, 0);
  let bot = buildBot(cfg);
  scene.add(bot.root);
  let spin = -0.4, vel = 0.004, dragging = false, lastX = 0, raf = 0, alive = true, wave = 0;
  if (drag) {
    canvas.addEventListener('pointerdown', ev => { dragging = true; lastX = ev.clientX; canvas.setPointerCapture(ev.pointerId); });
    canvas.addEventListener('pointermove', ev => { if (!dragging) return; vel = (ev.clientX - lastX) * 0.01; spin += vel; lastX = ev.clientX; });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('click', () => { wave = 1; });
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frame = t => {
    if (!alive) return;
    const s = t / 1000;
    if (!dragging) { vel *= 0.95; spin += vel + (Math.abs(vel) < 0.002 ? Math.sin(s * 0.6) * 0.004 : 0); }
    const p = bot.parts;
    bot.root.rotation.y = spin;
    p.floater.position.y = Math.sin(s * 2) * 0.06;
    p.antenna.rotation.z = Math.sin(s * 3) * 0.15;
    if (p.antenna.userData.spin) p.antenna.userData.spin.rotation.y = s * 2;
    p.eyes.scale.y = (s % 4) > 3.85 ? 0.15 : 1;
    p.thruster.scale.setScalar(1 + Math.sin(s * 12) * 0.06);
    wave = Math.max(0, wave - 0.012);
    p.armR.rotation.z = 0.35 + Math.sin(s * 10) * 0.5 * wave + wave * 1.8;
    renderer.render(scene, camera);
    if (!reduce) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  const api = {
    canvas,
    update(next) { scene.remove(bot.root); bot = buildBot(next); scene.add(bot.root); wave = 1; if (reduce) requestAnimationFrame(frame); },
    wave() { wave = 1; },
    destroy() { alive = false; cancelAnimationFrame(raf); renderer.dispose(); renderer.forceContextLoss?.(); canvas.remove(); viewers.delete(api); },
  };
  viewers.add(api);
  return api;
}

// Libera los visores que ya no están en pantalla (cada uno es un contexto WebGL).
export function sweepViewers() {
  for (const v of [...viewers]) if (!document.body.contains(v.canvas)) v.destroy();
}
