# Playground

Quiz social en directo con rondas de dibujo. Se juega desde el móvil o el ordenador: un anfitrión crea la partida, comparte un código de 5 caracteres y entran hasta 10 jugadores. Entre pregunta y pregunta, un jugador al azar dibuja con el ratón una palabra secreta y los demás la adivinan contra reloj.

## El universo Circuitia
El Rey Glitch rompió el Núcleo en siete chips. Volt y su dron Chispa recorren siete mundos para recuperarlos, y cada mundo es un modo de juego (inspirados en Blooket y mejorados; ver `SPEC-v2.md`):

| Mundo | Modo |
|---|---|
| ⚡ Arena Neón | Quiz a la vez para todos, con poderes y rondas de dibujo |
| 💠 Mina de Chips | A tu ritmo: cápsulas que suman, duplican, roban o intercambian |
| 🏁 Autopista Turbo | Carrera a la meta con turbo y pulso EMP |
| 🐟 Mar de Datos | Pesca de peces-robot por rareza, cebo por racha y Frenesí |
| 🔓 Fortaleza Firewall | Mina bits y hackea contraseñas ajenas |
| 🎨 Taller de Grafitis | Solo rondas de dibujo |
| 👑 Coliseo de Glitch | Eliminación con 3 vidas |

Los robots son 3D y coleccionables: cada partida da tuercas que se abren en cápsulas del Taller (11 acabados, de común a mítico).

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
