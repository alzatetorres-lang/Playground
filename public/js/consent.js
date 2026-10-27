// Consentimiento de cookies (Consent Mode v2). Google Analytics no se descarga hasta que el visitante acepta.
(() => {
  const GA_ID = 'G-68NHYMQP3B';
  const KEY = 'pg_consent';
  const DENIED = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' };

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag('consent', 'default', DENIED);

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

  let loaded = false;
  function enableAnalytics() {
    window['ga-disable-' + GA_ID] = false;
    gtag('consent', 'update', { analytics_storage: 'granted' });
    if (loaded) return;
    loaded = true;
    gtag('js', new Date());
    gtag('config', GA_ID);
    const s = document.createElement('script');
    s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.append(s);
  }
  function disableAnalytics() {
    window['ga-disable-' + GA_ID] = true;
    gtag('consent', 'update', { analytics_storage: 'denied' });
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0].trim();
      if (name === '_ga' || name.startsWith('_ga_')) {
        for (const domain of [location.hostname, '.' + location.hostname]) document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domain}`;
        document.cookie = `${name}=; Max-Age=0; Path=/`;
      }
    }
  }

  let box = null;
  function close() { box?.remove(); box = null; }
  function choose(analytics) {
    write({ analytics, at: Date.now() });
    analytics ? enableAnalytics() : disableAnalytics();
    close();
  }

  function open() {
    if (box) return;
    const el = (tag, attrs = {}, ...kids) => {
      const n = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      n.append(...kids);
      return n;
    };
    const row = (a, b, c) => el('tr', {}, el('td', {}, a), el('td', {}, b), el('td', {}, c));
    const reject = el('button', { type: 'button', 'data-consent': 'no' }, 'Rechazar');
    const accept = el('button', { type: 'button', 'data-consent': 'yes' }, 'Aceptar');
    reject.addEventListener('click', () => choose(false));
    accept.addEventListener('click', () => choose(true));
    box = el('div', { class: 'consent', role: 'dialog', 'aria-labelledby': 'consent-title', 'aria-describedby': 'consent-text' },
      el('h2', { id: 'consent-title' }, 'Cookies'),
      el('p', { id: 'consent-text' }, 'Usamos una cookie técnica para mantener tu sesión y guardamos tus ajustes en tu dispositivo. Son necesarias y no piden permiso. ',
        'Con tu permiso, usamos también Google Analytics para contar visitas de forma agregada. Puedes cambiar de opinión cuando quieras desde «Cookies».'),
      el('details', {}, el('summary', {}, 'Ver qué se guarda'),
        el('table', {},
          el('tr', {}, el('th', {}, 'Nombre'), el('th', {}, 'Para qué'), el('th', {}, 'Duración')),
          row('pg_session', 'Mantener tu sesión (necesaria)', 'Sesión'),
          row('pg_avatar, ajustes de audio', 'Recordar tu avatar y tu volumen (necesarias)', 'Hasta que las borres'),
          row('_ga, _ga_*', 'Google Analytics: visitas y uso (solo si aceptas)', '2 años'))),
      el('div', { class: 'consent-actions' }, reject, accept));
    document.body.append(box);
  }

  window.pgConsent = { open };
  const saved = read();
  if (saved?.analytics) enableAnalytics();
  const start = () => {
    if (!saved) open();
    document.addEventListener('click', e => {
      const t = e.target.closest?.('[data-cookies]');
      if (t) { e.preventDefault(); open(); }
    });
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
