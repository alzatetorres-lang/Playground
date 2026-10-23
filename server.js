const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const { server } = createApp({ secureCookie: process.env.COOKIE_SECURE === '1', dbFile: process.env.DB_FILE });

server.listen(PORT, () => console.log(`Playground listo en http://localhost:${PORT}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
