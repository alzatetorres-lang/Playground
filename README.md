# Playground

Quiz social en directo con rondas de dibujo. Se juega desde el móvil o el ordenador: un anfitrión crea la partida, comparte un código de 5 caracteres y entran hasta 10 jugadores. Entre pregunta y pregunta, un jugador al azar dibuja con el ratón una palabra secreta y los demás la adivinan contra reloj.

## Qué incluye
- Quiz en vivo con puntuación por rapidez y tres poderes (Doble apuesta, Escudo, Robo de tiempo).
- Rondas de dibujo con 1500 palabras del banco de preguntas del equipo.
- Cuentas de anfitrión, invitados por nombre, quizzes privados o públicos, biblioteca con búsqueda y duplicado.
- Avatares: robots animados, aleatorios y personalizables.
- Banda sonora synthwave generada en el navegador (WebAudio), con ambientes por fase, silencio y volumen.
- Fondo 3D con Three.js (horizonte synthwave que reacciona a la partida) y animaciones 3D en la interfaz.
- Instalable en el móvil (PWA), con vibración, pantalla siempre encendida y compartir nativo.
- Modo individual, reconexión, revancha y récords.

## Arrancar
```
npm install
npm run dev     # http://localhost:3000
npm test
```
Necesita Node 22.5 o superior (usa `node:sqlite`). La base se crea sola en `data/` y se rellena con el banco de preguntas la primera vez.

## Estructura
- `src/`: servidor (db, auth, salas y reglas, API).
- `public/`: frontend sin framework.
- `banco-preguntas/`: banco de 1500 conceptos (Excel, JSON y scripts).
- `stitch_screens/`, `index.html`: diseños de referencia de Google Stitch.
- `SPEC.md`, `tasks/plan.md`: especificación y plan.

## Despliegue
`docker-compose.yml` despliega en el VPS detrás de Traefik, con HTTPS. Variables: `PORT`, `DB_FILE`, `COOKIE_SECURE=1`.
