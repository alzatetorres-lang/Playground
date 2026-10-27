// Genera las ilustraciones de los 7 mundos con el motor 3D del juego (sin IA ni imágenes externas).
// Uso: se inyecta en la página del juego con Playwright (bypassCSP) y devuelve JPEG en dataURL.
import * as THREE from '/vendor/three/three.module.js';
import { RoomEnvironment } from '/vendor/three-addons/environments/RoomEnvironment.js';
import { buildBot } from '/js/bot3d.js';

const W = 1280, H = 720;
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

function skyTexture(c1, c2, seed) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); const r = rng(seed);
  g.fillStyle = '#06070d'; g.fillRect(0, 0, W, H);
  for (const [x, y, rad, col] of [[W * 0.78, H * 0.18, 520, c1], [W * 0.12, H * 0.1, 460, c2], [W * 0.5, H * 1.05, 520, c1]]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col + 'aa'); gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  for (let i = 0; i < 380; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.9})`; const s = r() < 0.1 ? 2.4 : 1.2; g.fillRect(r() * W, r() * H * 0.8, s, s); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const glowMat = c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.35 });
const wire = (c, o = 0.6) => new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: o });
function halo(c, s) { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(s); return sp; }

const PROPS = {
  classic(g, r) { // focos y cubos de pregunta
    for (let i = 0; i < 5; i++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#c8ff2e', transparent: true, opacity: 0.08, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); cone.position.set(-4 + i * 2, 2.4, -2); cone.rotation.z = (i - 2) * 0.18; g.add(cone); }
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), glowMat(['#c8ff2e', '#27f3ff', '#ff2e93'][i % 3])); b.position.set((r() - 0.5) * 7, 0.6 + r() * 2.4, -1 - r() * 2); b.rotation.set(r() * 3, r() * 3, 0); g.add(b); }
  },
  chips(g, r) { for (let i = 0; i < 14; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.25 + r() * 0.55), new THREE.MeshPhysicalMaterial({ color: '#27c8e0', emissive: '#0aa7c0', emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.2, transmission: 0.3, thickness: 1 })); const side = i % 2 ? 1 : -1; c.position.set(side * (2.1 + r() * 2.4), -0.9 + r() * 1.6, -1.6 - r() * 1.6); c.scale.y = 1.6; c.rotation.z = (r() - 0.5) * 0.8; g.add(c); } },
  race(g) { for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.06, 8, 60, Math.PI), glowMat(i % 2 ? '#ffc83d' : '#ff2e93')); t.position.set(0, -1.1, 2 - i * 2.2); g.add(t); } const road = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 16), new THREE.MeshBasicMaterial({ color: '#1a1030' })); road.rotation.x = -Math.PI / 2; road.position.set(0, -1.12, -4); g.add(road); for (let i = 0; i < 10; i++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.7), glowMat('#ffffff')); d.rotation.x = -Math.PI / 2; d.position.set(0, -1.1, 2 - i * 1.6); g.add(d); } },
  fish(g, r) { const geo = new THREE.PlaneGeometry(16, 8, 80, 40); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 1.3) * 0.18 + Math.cos(p.getY(i) * 1.7) * 0.15); const sea = new THREE.Mesh(geo, wire('#5ee7ff', 0.5)); sea.rotation.x = -Math.PI / 2; sea.position.y = -1.2; g.add(sea); for (let i = 0; i < 7; i++) { const f = new THREE.Group(); f.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), glowMat(['#5ee7ff', '#ff6fd0', '#ffc83d'][i % 3]))); const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 4), glowMat('#ffffff')); tail.rotation.z = Math.PI / 2; tail.position.x = -0.3; f.add(tail); f.scale.x = 1.4; f.position.set((r() - 0.5) * 7, -0.4 + r() * 2.8, -1 - r() * 2); f.rotation.y = r() * 3; g.add(f); } },
  hack(g, r) { for (let x = -4; x <= 4; x++) for (let y = 0; y < 5; y++) { if (Math.abs(x) < 2 && y < 3) continue; const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.4), new THREE.MeshStandardMaterial({ color: '#1c1f28', emissive: r() < 0.3 ? '#ff2e93' : '#000000', emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 })); b.position.set(x * 0.95, -1 + y * 0.6, -2.4); g.add(b); } const lock = new THREE.Group(); lock.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.3), glowMat('#ff2e93'))); const sh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 10, 30, Math.PI), glowMat('#ffd166')); sh.position.y = 0.38; lock.add(sh); lock.position.set(2.8, 2.2, -1.6); lock.rotation.y = -0.4; g.add(lock); },
  draw(g, r) { for (let i = 0; i < 16; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.12 + r() * 0.4, 20, 14), glowMat(['#ff2e93', '#27f3ff', '#c8ff2e', '#b06bff', '#ffc83d'][i % 5])); s.scale.z = 0.3; s.position.set((r() - 0.5) * 8, -0.8 + r() * 3.6, -2.2); g.add(s); } const brush = new THREE.Group(); brush.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 12), glowMat('#ffffff'))); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 12), glowMat('#b06bff')); tip.position.y = -0.95; tip.rotation.x = Math.PI; brush.add(tip); brush.position.set(-2.6, 1.4, -0.5); brush.rotation.z = 0.8; g.add(brush); },
  battle(g) { for (let i = 0; i < 8; i++) { const a = Math.PI + (i / 7) * Math.PI; const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.2, 12), new THREE.MeshStandardMaterial({ color: '#2a1d3a', emissive: '#ff5e5e', emissiveIntensity: 0.15, roughness: 0.6 })); col.position.set(Math.cos(a) * 4.4, 0.4, -2.2 + Math.sin(a) * 1.6); g.add(col); } const crown = new THREE.Group(); crown.add(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 10, 40), glowMat('#ffc83d'))); for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 8), glowMat('#ffc83d')); const a = (i / 5) * Math.PI * 2; sp.position.set(Math.cos(a) * 0.55, 0.25, Math.sin(a) * 0.55); crown.add(sp); } crown.rotation.x = 0.3; crown.position.set(0, 2.9, -0.6); g.add(crown); },
};

const HERO = {
  classic: { body: 0, eyes: 1, antenna: 0, mouth: 0, accessory: 1, color: 3, skin: 0 },
  chips: { body: 1, eyes: 3, antenna: 2, mouth: 2, accessory: 4, color: 5, skin: 6 },
  race: { body: 4, eyes: 2, antenna: 3, mouth: 0, accessory: 0, color: 2, skin: 5 },
  fish: { body: 2, eyes: 4, antenna: 1, mouth: 2, accessory: 3, color: 3, skin: 7 },
  hack: { body: 3, eyes: 2, antenna: 4, mouth: 1, accessory: 4, color: 4, skin: 4 },
  draw: { body: 1, eyes: 1, antenna: 2, mouth: 2, accessory: 5, color: 1, skin: 3 },
  battle: { body: 3, eyes: 2, antenna: 2, mouth: 3, accessory: 5, color: 4, skin: 10 },
};
const COLORS = { classic: ['#c8ff2e', '#27f3ff'], chips: ['#27f3ff', '#b06bff'], race: ['#ffc83d', '#ff2e93'], fish: ['#5ee7ff', '#2a6bff'], hack: ['#ff2e93', '#6a1bff'], draw: ['#b06bff', '#ff2e93'], battle: ['#ff5e5e', '#ffc83d'] };

export function renderWorld(mode, seed = 7) {
  const r = rng(seed + mode.length * 31);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false); renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.78; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const [c1, c2] = COLORS[mode];
  scene.background = skyTexture(c1, c2, seed);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1030, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(c1, 3.2); rim.position.set(-4, 2, -3); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(c2, 2.4); rim2.position.set(4, 0, -3); scene.add(rim2);
  const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100); camera.position.set(0, 1.2, 8.2); camera.lookAt(0, 0.7, 0);
  // Planeta del mundo al fondo
  const planet = new THREE.Mesh(new THREE.SphereGeometry(2.6, 48, 32), new THREE.MeshStandardMaterial({ color: new THREE.Color(c2).multiplyScalar(0.55), emissive: c1, emissiveIntensity: 0.06, roughness: 0.75 }));
  planet.position.set(-5.2, 3.2, -9); scene.add(planet);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.3, 4.4, 80), new THREE.MeshBasicMaterial({ color: c1, side: THREE.DoubleSide, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending })); ring.position.copy(planet.position); ring.rotation.set(1.2, 0.2, 0.3); scene.add(ring);
  // Plataforma hexagonal brillante
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.35, 6), new THREE.MeshStandardMaterial({ color: '#141830', metalness: 0.6, roughness: 0.35 })); plat.position.y = -1.35; scene.add(plat);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.04, 8, 6), glowMat(c1)); edge.rotation.x = Math.PI / 2; edge.position.y = -1.17; scene.add(edge);
  const props = new THREE.Group(); PROPS[mode](props, r); scene.add(props);
  const { root, parts } = buildBot(HERO[mode]);
  root.scale.setScalar(1.55); root.position.y = 0.05; root.rotation.y = -0.3;
  parts.armR.rotation.z = 2.2;
  scene.add(root);
  const h1 = halo(c1, 5); h1.material.opacity = 0.55; h1.position.set(0, 0.6, -1.5); scene.add(h1);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/jpeg', 0.84);
  renderer.dispose();
  return url;
}
