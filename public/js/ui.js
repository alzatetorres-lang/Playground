import { botSvg, PARTS, COLORS } from './avatar.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

let toastTimer;
export function toast(msg, bad = false) {
  const el = document.querySelector('#toast');
  el.textContent = msg;
  el.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2800);
}

export const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

// Editor de avatar: flechas por pieza, colores y botón de azar.
export function avatarEditor(host, avatar, onChange, randomize) {
  const keys = ['body', 'eyes', 'antenna', 'mouth', 'accessory'];
  const labels = { body: 'Cuerpo', eyes: 'Ojos', antenna: 'Antena', mouth: 'Boca', accessory: 'Extra' };
  function draw() {
    host.innerHTML = `
      <div>${botSvg(avatar, { size: 'lg' })}</div>
      <div class="stack" style="margin-top:12px">
        ${keys.map(k => `<div class="picker"><span class="lbl">${labels[k]}: <span class="muted">${esc(PARTS[k][avatar[k]])}</span></span>
          <button class="alt" data-k="${k}" data-d="-1" aria-label="${labels[k]} anterior">‹</button>
          <button class="alt" data-k="${k}" data-d="1" aria-label="${labels[k]} siguiente">›</button></div>`).join('')}
        <div><div class="small">Color</div><div class="swatches">${COLORS.map((c, i) => `<button class="swatch ${avatar.color === i ? 'on' : ''}" style="background:${c}" data-c="${i}" aria-label="Color ${i + 1}"></button>`).join('')}</div></div>
        <button class="violet" data-rand>🎲 Aleatorio</button>
      </div>`;
  }
  host.onclick = ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.rand !== undefined) Object.assign(avatar, randomize());
    else if (b.dataset.c !== undefined) avatar.color = Number(b.dataset.c);
    else if (b.dataset.k) { const n = PARTS[b.dataset.k].length; avatar[b.dataset.k] = (avatar[b.dataset.k] + Number(b.dataset.d) + n) % n; }
    draw();
    onChange(avatar);
  };
  draw();
}
