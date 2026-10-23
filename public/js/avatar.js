// Robots amistosos en SVG por piezas. Animados con CSS (flotar, parpadear, antena, saludo).
export const COLORS = ['#cbf231', '#cbbeff', '#ffb5a0', '#7fe0ff', '#ff8ad6', '#ffd166', '#7dffb2', '#ff7a7a'];
export const PARTS = {
  body: ['Cuadrado', 'Redondo', 'Alto', 'Hexágono', 'Cápsula'],
  eyes: ['Puntos', 'Grandes', 'Visor', 'Felices', 'LED'],
  antenna: ['Bola', 'Doble', 'Estrella', 'Muelle', 'Luz'],
  mouth: ['Sonrisa', 'Rejilla', 'Abierta', 'Zigzag'],
  accessory: ['Ninguno', 'Cascos', 'Pajarita', 'Mofletes', 'Tornillos', 'Gorra'],
  color: COLORS.map((_, i) => `Color ${i + 1}`),
};
const INK = '#17171a';

const head = (kind, c) => {
  const f = `fill="${c}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
  switch (kind) {
    case 1: return `<ellipse cx="50" cy="50" rx="27" ry="25" ${f}/>`;
    case 2: return `<rect x="26" y="26" width="48" height="52" rx="14" ${f}/>`;
    case 3: return `<polygon points="50,24 74,36 74,64 50,76 26,64 26,36" ${f}/>`;
    case 4: return `<rect x="22" y="32" width="56" height="40" rx="20" ${f}/>`;
    default: return `<rect x="24" y="30" width="52" height="46" rx="10" ${f}/>`;
  }
};
const topY = kind => ({ 0: 30, 1: 25, 2: 26, 3: 24, 4: 32 })[kind] ?? 30;

const antenna = (kind, y, c) => {
  const stem = `<line x1="50" y1="${y}" x2="50" y2="${y - 12}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  const top = y - 12;
  const inner = {
    0: `${stem}<circle cx="50" cy="${top - 3}" r="5" fill="#fff" stroke="${INK}" stroke-width="3"/>`,
    1: `<line x1="44" y1="${y}" x2="40" y2="${top}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><line x1="56" y1="${y}" x2="60" y2="${top}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="${top - 2}" r="4" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="60" cy="${top - 2}" r="4" fill="#fff" stroke="${INK}" stroke-width="3"/>`,
    2: `${stem}<polygon points="50,${top - 11} 53,${top - 4} 60,${top - 4} 54,${top} 56,${top + 6} 50,${top + 2} 44,${top + 6} 46,${top} 40,${top - 4} 47,${top - 4}" fill="#ffd166" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`,
    3: `<polyline points="50,${y} 44,${y - 3} 56,${y - 6} 44,${y - 9} 56,${y - 12} 50,${y - 15}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="50" cy="${y - 18}" r="4" fill="${c}" stroke="${INK}" stroke-width="3"/>`,
    4: `${stem}<circle cx="50" cy="${top - 3}" r="5" fill="#ff5e5e" stroke="${INK}" stroke-width="3"/>`,
  }[kind] ?? '';
  return `<g class="tip">${inner}</g>`;
};

const eyes = (kind, mood) => {
  const sad = mood === 'sad';
  const lid = inner => `<g class="lid">${inner}</g>`;
  switch (kind) {
    case 1: return lid(`<circle cx="40" cy="50" r="8" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="60" cy="50" r="8" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="${sad ? 41 : 42}" cy="${sad ? 53 : 51}" r="3.5" fill="${INK}"/><circle cx="${sad ? 61 : 62}" cy="${sad ? 53 : 51}" r="3.5" fill="${INK}"/>`);
    case 2: return `<rect x="31" y="43" width="38" height="13" rx="6.5" fill="${INK}"/>${lid('<rect x="36" y="47" width="10" height="5" rx="2.5" fill="#7fe0ff"/><rect x="54" y="47" width="10" height="5" rx="2.5" fill="#7fe0ff"/>')}`;
    case 3: return `<path d="M34 52 Q40 44 46 52" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><path d="M54 52 Q60 44 66 52" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
    case 4: return lid(`<rect x="34" y="45" width="10" height="10" rx="2" fill="${INK}"/><rect x="56" y="45" width="10" height="10" rx="2" fill="${INK}"/><rect x="36" y="47" width="3" height="3" fill="#cbf231"/><rect x="58" y="47" width="3" height="3" fill="#cbf231"/>`);
    default: return lid(`<circle cx="40" cy="50" r="4.5" fill="${INK}"/><circle cx="60" cy="50" r="4.5" fill="${INK}"/>`);
  }
};

const mouth = (kind, mood) => {
  if (mood === 'sad') return `<path d="M42 66 Q50 60 58 66" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
  switch (kind) {
    case 1: return `<rect x="40" y="61" width="20" height="8" rx="2" fill="#fff" stroke="${INK}" stroke-width="2.5"/><line x1="46" y1="61" x2="46" y2="69" stroke="${INK}" stroke-width="2"/><line x1="52" y1="61" x2="52" y2="69" stroke="${INK}" stroke-width="2"/><line x1="58" y1="61" x2="58" y2="69" stroke="${INK}" stroke-width="2" opacity="0"/>`;
    case 2: return `<path d="M41 61 Q50 74 59 61 Z" fill="${INK}"/><path d="M45 65 Q50 69 55 65" fill="#ff7a7a"/>`;
    case 3: return `<polyline points="40,66 45,61 50,66 55,61 60,66" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    default: return `<path d="M41 62 Q50 72 59 62" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
  }
};

const accessory = (kind, c) => {
  switch (kind) {
    case 1: return `<path d="M24 52 Q24 28 50 28 Q76 28 76 52" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><rect x="18" y="46" width="9" height="16" rx="4" fill="#fff" stroke="${INK}" stroke-width="3"/><rect x="73" y="46" width="9" height="16" rx="4" fill="#fff" stroke="${INK}" stroke-width="3"/>`;
    case 2: return `<polygon points="50,82 38,76 38,88" fill="#ff5e5e" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><polygon points="50,82 62,76 62,88" fill="#ff5e5e" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="50" cy="82" r="3.5" fill="#ff5e5e" stroke="${INK}" stroke-width="2.5"/>`;
    case 3: return `<ellipse cx="33" cy="60" rx="5" ry="3" fill="#ff7a9e" opacity=".75"/><ellipse cx="67" cy="60" rx="5" ry="3" fill="#ff7a9e" opacity=".75"/>`;
    case 4: return `<circle cx="22" cy="54" r="3.5" fill="#bbb" stroke="${INK}" stroke-width="2"/><circle cx="78" cy="54" r="3.5" fill="#bbb" stroke="${INK}" stroke-width="2"/>`;
    case 5: return `<path d="M28 36 Q50 16 72 36 Z" fill="#4a1dc2" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><rect x="26" y="34" width="48" height="5" rx="2.5" fill="#4a1dc2" stroke="${INK}" stroke-width="2.5"/>`;
    default: return '';
  }
};

// mood: 'happy' | 'sad' | undefined. size: 'sm' | 'lg' | undefined.
export function botSvg(avatar, { mood, size } = {}) {
  const a = { body: 0, eyes: 0, antenna: 0, mouth: 0, accessory: 0, color: 0, ...(avatar || {}) };
  const c = COLORS[a.color] || COLORS[0];
  const bodyTop = topY(a.body);
  const cls = ['bot', size, mood].filter(Boolean).join(' ');
  return `<svg class="${cls}" viewBox="0 0 100 100" role="img" aria-label="Robot">
    <circle cx="50" cy="52" r="47" fill="#cfc9ea"/>
    <g class="float">
      <rect x="38" y="76" width="24" height="14" rx="5" fill="${c}" stroke="${INK}" stroke-width="3"/>
      <g class="arm-l"><rect x="26" y="78" width="12" height="6" rx="3" fill="${c}" stroke="${INK}" stroke-width="2.5"/></g>
      <rect x="62" y="78" width="12" height="6" rx="3" fill="${c}" stroke="${INK}" stroke-width="2.5"/>
      ${antenna(a.antenna, bodyTop, c)}
      ${head(a.body, c)}
      ${a.accessory === 4 || a.accessory === 1 ? '' : ''}
      ${eyes(a.eyes, mood)}
      ${mouth(a.mouth, mood)}
      ${accessory(a.accessory, c)}
    </g>
  </svg>`;
}

export function randomAvatar() {
  const r = n => Math.floor(Math.random() * n);
  return { body: r(5), eyes: r(5), antenna: r(5), mouth: r(4), accessory: r(6), color: r(8) };
}
