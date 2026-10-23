// Efectos visuales y táctiles. Todo se apaga con prefers-reduced-motion.
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const buzz = ms => { try { if (!reduce()) navigator.vibrate?.(ms); } catch {} };

export function flash(kind) {
  if (reduce()) return;
  const el = document.createElement('div');
  el.className = `flash ${kind}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 750);
}

export function confetti() {
  if (reduce()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = (canvas.width = innerWidth * dpr), h = (canvas.height = innerHeight * dpr);
  const colors = ['#c8ff2e', '#27f3ff', '#ff2e93', '#ffc83d', '#ffffff'];
  const parts = Array.from({ length: 140 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.35, vx: (Math.random() - 0.5) * 16 * dpr, vy: (-Math.random() * 15 - 4) * dpr,
    s: (4 + Math.random() * 6) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0],
  }));
  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 0.38 * dpr; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - t / 3200);
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (t < 3200) requestAnimationFrame(frame); else canvas.remove();
  })(start);
}

// Onda al tocar botones y opciones, y foco de luz que sigue al puntero en los paneles.
export function initTouchFx() {
  document.addEventListener('pointerdown', ev => {
    const el = ev.target.closest('button, .btn, .option, #tabbar a');
    if (!el || el.disabled) return;
    buzz(6);
    if (reduce()) return;
    const r = el.getBoundingClientRect();
    const dot = document.createElement('span');
    dot.className = 'rip';
    dot.style.left = `${ev.clientX - r.left}px`;
    dot.style.top = `${ev.clientY - r.top}px`;
    el.appendChild(dot);
    setTimeout(() => dot.remove(), 650);
  }, { passive: true });

  document.addEventListener('pointermove', ev => {
    if (ev.pointerType !== 'mouse') return;
    const card = ev.target.closest?.('.card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${ev.clientX - r.left}px`);
    card.style.setProperty('--my', `${ev.clientY - r.top}px`);
  }, { passive: true });
}
