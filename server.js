const { createApp } = require('./src/app');
const { buildAssets } = require('./src/build');

const PORT = Number(process.env.PORT) || 3000;

(async () => {
  // En producción se empaqueta el frontend al arrancar; en desarrollo se sirven los fuentes tal cual.
  const assets = process.env.NODE_ENV === 'production' || process.env.BUILD === '1' ? await buildAssets() : null;
  if (assets) console.log('Frontend empaquetado:', assets.js, assets.css);
  const { server } = createApp({ secureCookie: process.env.COOKIE_SECURE === '1', dbFile: process.env.DB_FILE, assets });
  server.listen(PORT, () => console.log(`Playground listo en http://localhost:${PORT}`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
})();
