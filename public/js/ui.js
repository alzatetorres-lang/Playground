import { botSvg, PARTS, COLORS } from './avatar.js';
import { SKIN_INFO, RARITY_COLOR } from './skins.js';
import { onBot3D } from './avatar.js';

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

// Editor de avatar: robot vivo en 3D (o SVG), flechas por pieza, colores, acabados y azar.
export function avatarEditor(host, avatar, onChange, randomize, owned = [0]) {
  const keys = ['body', 'eyes', 'antenna', 'mouth', 'accessory'];
  const labels = { body: 'Cuerpo', eyes: 'Ojos', antenna: 'Antena', mouth: 'Boca', accessory: 'Extra' };
  host.innerHTML = '<div class="bot-stage"><div class="bot-view"></div><div class="bot-floor"></div></div><div class="bot-controls stack" style="margin-top:12px"></div>';
  const view = host.querySelector('.bot-view');
  const controls = host.querySelector('.bot-controls');
  let live = null;
  view.innerHTML = botSvg(avatar, { size: 'lg' });
  onBot3D(m => { if (document.body.contains(view)) live = m.mountBot(view, avatar, { size: 220 }); });
  function draw() {
    const skin = SKIN_INFO[avatar.skin || 0];
    controls.innerHTML = `
      ${keys.map(k => `<div class="picker"><span class="lbl">${labels[k]}: <span class="muted">${esc(PARTS[k][avatar[k]])}</span></span>
        <button class="alt" data-k="${k}" data-d="-1" aria-label="${labels[k]} anterior">‹</button>
        <button class="alt" data-k="${k}" data-d="1" aria-label="${labels[k]} siguiente">›</button></div>`).join('')}
      <div><div class="small">Color</div><div class="swatches">${COLORS.map((c, i) => `<button class="swatch ${avatar.color === i ? 'on' : ''}" style="background:${c}" data-c="${i}" aria-label="Color ${i + 1}"></button>`).join('')}</div></div>
      <div><div class="small">Acabado · <span style="color:${RARITY_COLOR[skin.rarity]}">${esc(skin.name)} (${skin.rarity})</span></div>
        <div class="skins">${SKIN_INFO.map((s, i) => owned.includes(i)
          ? `<button class="skin-chip ${avatar.skin === i ? 'on' : ''}" data-s="${i}" style="--rc:${RARITY_COLOR[s.rarity]}">${esc(s.name)}</button>`
          : `<span class="skin-chip locked" title="Consíguelo en el Taller" style="--rc:${RARITY_COLOR[s.rarity]}">🔒 ${esc(s.name)}</span>`).join('')}</div></div>
      <button class="violet" data-rand>🎲 Aleatorio</button>`;
  }
  controls.onclick = ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.rand !== undefined) Object.assign(avatar, randomize(), { skin: avatar.skin || 0 });
    else if (b.dataset.c !== undefined) avatar.color = Number(b.dataset.c);
    else if (b.dataset.s !== undefined) avatar.skin = Number(b.dataset.s);
    else if (b.dataset.k) { const n = PARTS[b.dataset.k].length; avatar[b.dataset.k] = (avatar[b.dataset.k] + Number(b.dataset.d) + n) % n; }
    draw();
    if (live) live.update(avatar); else view.innerHTML = botSvg(avatar, { size: 'lg' });
    onChange(avatar);
  };
  draw();
}
