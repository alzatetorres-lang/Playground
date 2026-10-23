// Escena 3D de fondo: horizonte synthwave con sol, rejilla que avanza, montañas y poliedros de neón.
// Se adapta a la fase del juego (menú, partida, cuenta atrás, dibujo, victoria) y se apaga si no hay WebGL.
import * as THREE from '/vendor/three/three.module.js';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = window.matchMedia('(pointer: coarse)').matches;
const MODES = {
  menu: { speed: 6, dim: mobile ? 0.8 : 1, hue: 0, fov: 62 },
  game: { speed: 3, dim: 0.45, hue: 0, fov: 62 },
  countdown: { speed: 38, dim: 0.85, hue: 0.06, fov: 78 },
  draw: { speed: 4, dim: 0.4, hue: -0.08, fov: 62 },
  win: { speed: 14, dim: 1, hue: 0.12, fov: 66 },
};

let api = { setMode() {}, pulse() {} };

function makeSun() {
  const geo = new THREE.CircleGeometry(16, 64);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime;
      void main(){
        vec3 top = vec3(1.0, 0.86, 0.24); vec3 bottom = vec3(1.0, 0.18, 0.58);
        vec3 col = mix(bottom, top, smoothstep(0.1, 0.95, vUv.y));
        float bands = step(0.5, fract(vUv.y * 18.0 - uTime * 0.25));
        float cut = vUv.y < 0.48 ? mix(1.0, bands, smoothstep(0.48, 0.1, vUv.y)) : 1.0;
        gl_FragColor = vec4(col, cut);
      }`,
  });
  const sun = new THREE.Mesh(geo, mat);
  sun.position.set(0, 7, -120);
  return sun;
}

function makeGrid() {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x27f3ff, transparent: true, opacity: 0.55 });
  const pts = [];
  const size = 240, step = 6;
  for (let x = -size / 2; x <= size / 2; x += step) pts.push(x, 0, -size, x, 0, 10);
  for (let z = -size; z <= 10; z += step) pts.push(-size / 2, 0, z, size / 2, 0, z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.LineSegments(geo, mat));
  group.userData.step = step;
  return group;
}

function makeMountains() {
  const geo = new THREE.PlaneGeometry(320, 60, 64, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const side = Math.min(1, Math.max(0, (Math.abs(x) - 20) / 60));
    const h = side * (Math.sin(x * 0.11) * 6 + Math.sin(x * 0.27 + 1) * 4 + Math.random() * 5 + 6) * (1 - (y + 30) / 60);
    pos.setZ(i, Math.max(0, h));
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2e93, wireframe: true, transparent: true, opacity: 0.35 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, -0.2, -95);
  return mesh;
}

function makeShapes(count) {
  const geos = [new THREE.IcosahedronGeometry(1.6, 0), new THREE.OctahedronGeometry(1.5, 0), new THREE.TorusGeometry(1.3, 0.35, 8, 20), new THREE.TetrahedronGeometry(1.7, 0)];
  const colors = [0x27f3ff, 0xc8ff2e, 0xff2e93, 0xffc83d];
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geos[i % geos.length], new THREE.MeshBasicMaterial({ color: colors[i % colors.length], wireframe: true, transparent: true, opacity: 0.8 }));
    m.position.set((Math.random() - 0.5) * 70, 4 + Math.random() * 18, -20 - Math.random() * 80);
    m.userData = { spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.012), bob: Math.random() * Math.PI * 2 };
    group.add(m);
  }
  return group;
}

function makeStars(count) {
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { pts[i * 3] = (Math.random() - 0.5) * 300; pts[i * 3 + 1] = Math.random() * 90 + 5; pts[i * 3 + 2] = -Math.random() * 200; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe8ecff, size: 0.6, transparent: true, opacity: 0.7, sizeAttenuation: true }));
}

export function initScene() {
  let renderer;
  try {
    const canvas = document.createElement('canvas');
    canvas.id = 'scene';
    canvas.setAttribute('aria-hidden', 'true');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: 'low-power' });
    document.body.prepend(canvas);
  } catch {
    return api; // sin WebGL: se quedan los orbes CSS
  }
  document.body.classList.add('has-3d');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x06070d, 30, 150);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  camera.position.set(0, 4.2, 12);

  const sun = makeSun(), grid = makeGrid(), mountains = makeMountains();
  const shapes = makeShapes(mobile ? 9 : 16), stars = makeStars(mobile ? 500 : 1200);
  scene.add(sun, grid, mountains, shapes, stars);

  const state = { ...MODES.menu, speed: MODES.menu.speed, dim: MODES.menu.dim, fov: MODES.menu.fov, pulse: 0 };
  let target = MODES.menu, last = performance.now(), running = true;
  const pointer = { x: 0, y: 0 };

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);
  addEventListener('pointermove', ev => { pointer.x = ev.clientX / innerWidth - 0.5; pointer.y = ev.clientY / innerHeight - 0.5; }, { passive: true });
  addEventListener('deviceorientation', ev => { if (ev.gamma != null) { pointer.x = Math.max(-0.5, Math.min(0.5, ev.gamma / 60)); pointer.y = Math.max(-0.5, Math.min(0.5, (ev.beta - 45) / 90)); } }, { passive: true });
  document.addEventListener('visibilitychange', () => { running = document.visibilityState === 'visible'; if (running) { last = performance.now(); requestAnimationFrame(frame); } });

  const lerp = (a, b, k) => a + (b - a) * k;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const k = 1 - Math.pow(0.02, dt);
    state.speed = lerp(state.speed, target.speed, k);
    state.dim = lerp(state.dim, target.dim, k);
    state.fov = lerp(state.fov, target.fov, k);
    state.pulse = Math.max(0, state.pulse - dt * 1.6);

    grid.position.z = (grid.position.z + state.speed * dt) % grid.userData.step;
    sun.material.uniforms.uTime.value = now / 1000;
    sun.scale.setScalar(1 + state.pulse * 0.25);
    for (const m of shapes.children) {
      m.rotation.x += m.userData.spin.x; m.rotation.y += m.userData.spin.y; m.rotation.z += m.userData.spin.z;
      m.position.y += Math.sin(now / 900 + m.userData.bob) * 0.01;
      m.position.z += state.speed * dt * 0.6;
      // Se reciclan antes de acercarse a la cámara para no tapar la interfaz.
      if (m.position.z > -6) m.position.z = -100;
    }
    stars.rotation.y = Math.sin(now / 20000) * 0.05;
    camera.position.x = lerp(camera.position.x, pointer.x * 3, 0.04);
    camera.position.y = lerp(camera.position.y, 4.2 - pointer.y * 1.5, 0.04);
    camera.fov = state.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 4, -60);
    renderer.domElement.style.opacity = String(0.25 + state.dim * 0.75);
    renderer.render(scene, camera);
    if (!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  api = {
    setMode(mode) { target = MODES[mode] || MODES.menu; if (reduce) requestAnimationFrame(frame); },
    pulse() { state.pulse = 1; },
  };
  return api;
}

export const scene3d = { get: () => api };
