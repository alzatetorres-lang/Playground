(() => {
  const app = document.getElementById('app');
  const KEY = 'pg-admin-token';
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    for (const k of kids) n.append(k);
    return n;
  };
  const fmtDay = d => d.slice(5).split('-').reverse().join('/');
  const MODES = { solo: 'Solo', live: 'En directo' };

  function kpi(value, label) { return el('div', { class: 'card kpi' }, el('b', {}, String(value)), el('span', {}, label)); }

  // Barras SVG: rellena los días sin datos con 0 para que el eje sea continuo.
  function bars(rows, days = 30) {
    const byDay = new Map(rows.map(r => [r.d, r.n]));
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      series.push([d, byDay.get(d) || 0]);
    }
    const max = Math.max(1, ...series.map(s => s[1]));
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${days * 10} 100`); svg.setAttribute('preserveAspectRatio', 'none');
    series.forEach(([d, n], i) => {
      const h = n ? Math.max(3, (n / max) * 92) : 0;
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', i * 10 + 1); r.setAttribute('y', 100 - h); r.setAttribute('width', 8); r.setAttribute('height', h);
      r.setAttribute('fill', '#27f3ff');
      const t = document.createElementNS(ns, 'title'); t.textContent = `${fmtDay(d)}: ${n}`; r.append(t);
      svg.append(r);
    });
    return svg;
  }

  function table(head, rows) {
    if (!rows.length) return el('p', { class: 'empty' }, 'Sin datos todavía.');
    const t = el('table', {}, el('tr', {}, ...head.map((h, i) => el('th', i ? { class: 'n', style: 'text-align:right' } : {}, h))));
    for (const r of rows) t.append(el('tr', {}, ...r.map((c, i) => el('td', i ? { class: 'n' } : {}, String(c)))));
    return t;
  }

  const section = (title, ...kids) => el('div', { class: 'card' }, el('h2', {}, title), ...kids);

  function render(d) {
    const t = d.totals;
    app.replaceChildren(
      el('h1', {}, 'Panel · Playground'),
      el('p', { class: 'sub' }, `Actualizado ${new Date(d.generatedAt).toLocaleString('es-ES')} · se refresca cada 30 s`),
      el('div', { class: 'grid' },
        kpi(d.activeRooms, 'Salas activas'), kpi(t.games24h, 'Partidas 24 h'), kpi(t.games, 'Partidas totales'),
        kpi(t.users, 'Usuarios'), kpi(t.users7d, 'Altas 7 días'), kpi(t.avgPlayers, 'Jugadores / partida'), kpi(t.quizzes, 'Quizzes')),
      el('div', { class: 'cols' },
        section('Partidas por día (30 d)', bars(d.gamesPerDay)),
        section('Altas por día (30 d)', bars(d.usersPerDay))),
      el('div', { class: 'cols' },
        section('Modos', table(['Modo', 'Partidas'], d.byMode.map(m => [MODES[m.mode] || m.mode, m.n]))),
        section('Quizzes más jugados', table(['Quiz', 'Partidas'], d.topQuizzes.map(q => [q.title, q.n])))),
      el('div', { class: 'cols' },
        section('Jugadores top', table(['Nombre', 'Partidas', 'Victorias', 'Mejor'], d.topPlayers.map(p => [p.name, p.games, p.wins, p.best]))),
        section('Últimas partidas', table(['Sala', 'Modo', 'Quiz', 'Jug.', 'Fecha'], d.recentGames.map(g => [g.code, MODES[g.mode] || g.mode, g.title || '-', g.players, new Date(g.at).toLocaleString('es-ES')])))),
      section('Tráfico web (Google)',
        el('p', {}, 'Visitas, países y dispositivos están en Google Analytics: ',
          el('a', { href: 'https://analytics.google.com/analytics/web/', target: '_blank', rel: 'noopener' }, 'Analytics'), ' · ',
          el('a', { href: 'https://search.google.com/search-console', target: '_blank', rel: 'noopener' }, 'Search Console'), '.')));
  }

  let timer = null;
  async function load(token) {
    const res = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new Error('Token incorrecto.');
    if (!res.ok) throw new Error('Error del servidor.');
    render(await res.json());
    clearTimeout(timer);
    timer = setTimeout(() => load(token).catch(() => {}), 30_000);
  }

  document.getElementById('login').addEventListener('submit', async e => {
    e.preventDefault();
    const token = document.getElementById('token').value.trim();
    try { await load(token); sessionStorage.setItem(KEY, token); }
    catch (err) { document.getElementById('err').textContent = err.message; }
  });
  const saved = sessionStorage.getItem(KEY);
  if (saved) load(saved).catch(() => sessionStorage.removeItem(KEY));
})();
