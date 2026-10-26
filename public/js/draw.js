// Lienzo de dibujo. Coordenadas normalizadas 0..1 para que cualquier pantalla vea lo mismo.
export const PALETTE = ['#111111', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#a16207', '#ffffff'];

export function createCanvas(host, { canDraw, onStroke, onClear }) {
  const wrap = document.createElement('div');
  wrap.className = 'canvas-wrap' + (canDraw ? '' : ' locked');
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  host.appendChild(wrap);
  const ctx = canvas.getContext('2d');
  let color = PALETTE[0], size = 6, drawing = false, last = null, buffer = [], started = false;
  const history = [];

  function fit() {
    const r = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    redraw();
  }

  function paintSegment(pts, c, s, start) {
    const w = canvas.width, h = canvas.height;
    const scale = canvas.width / 800;
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = Math.max(1, s * scale); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (pts.length === 1 && start) {
      ctx.beginPath(); ctx.arc(pts[0][0] * w, pts[0][1] * h, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * w, pts[i][1] * h);
    ctx.stroke();
  }

  function redraw() {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const e of history) paintSegment(e.pts, e.color, e.size, e.start);
  }

  function point(ev) {
    const r = canvas.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))];
  }

  function flush() {
    if (!buffer.length) return;
    const e = { pts: buffer, start: started, color, size };
    started = false;
    onStroke(e);
    buffer = last ? [last] : [];
  }

  if (canDraw) {
    canvas.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      canvas.setPointerCapture(ev.pointerId);
      drawing = true; started = true;
      last = point(ev); buffer = [last];
      const e = { pts: [last], start: true, color, size };
      history.push(e); paintSegment(e.pts, color, size, true);
    });
    canvas.addEventListener('pointermove', ev => {
      if (!drawing) return;
      const p = point(ev);
      const e = { pts: [last, p], start: false, color, size };
      history.push(e); paintSegment(e.pts, color, size, false);
      last = p; buffer.push(p);
      if (buffer.length >= 12) flush();
    });
    const end = () => { if (!drawing) return; drawing = false; flush(); buffer = []; last = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);
  }

  const ro = new ResizeObserver(fit);
  ro.observe(wrap);
  fit();

  return {
    remote(e) { history.push(e); paintSegment(e.pts, e.color, e.size, e.start); },
    load(list) { history.length = 0; history.push(...list); redraw(); },
    clear() { history.length = 0; redraw(); },
    setColor(c) { color = c; },
    setSize(s) { size = s; },
    clearLocal() { history.length = 0; redraw(); onClear(); },
    destroy() { ro.disconnect(); wrap.remove(); },
  };
}
