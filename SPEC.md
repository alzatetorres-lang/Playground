# Spec: Playground (Quiz Party + Draw & Guess)

Estado: **BORRADOR para aprobación**. Mapa de capacidades aprobado el 2026-10-23.

## Objetivo

Web de juegos sociales en tiempo real para grupos de amigos, en móvil y ordenador. Una sola partida mezcla dos tipos de ronda: preguntas de quiz y rondas de dibujo, en las que un jugador elegido al azar dibuja con el ratón y los demás adivinan la palabra contra reloj.

Flujo principal:
1. Un anfitrión crea una partida y el sistema genera un **código** (y enlace) para compartir.
2. Hasta **10 jugadores** entran desde la web con el código, un nombre y su avatar. Pueden entrar como invitados.
3. El anfitrión inicia. Se alternan rondas de quiz y rondas de dibujo; al final hay clasificación y revancha.

Usuarios: público general y grupos de amigos. Anfitriones con cuenta, jugadores invitados.

Fuera de alcance por ahora: generación de quizzes con IA (queda el hueco en la arquitectura), apps nativas, chat social, torneos, monetización, dominio y HTTPS.

## Supuestos

1. Node 20+, Express y Socket.io, como el MVP de la rama `rocio`.
2. SQLite en archivo (`better-sqlite3`) para cuentas, quizzes, partidas y estadísticas. Los JSON actuales no sirven para cuentas ni récords.
3. Sesión por cookie `httpOnly` y contraseñas con hash (argon2 o bcrypt). Sin OAuth.
4. Frontend en HTML/JS sin framework, con el diseño de Stitch. Tailwind sale del CDN a CSS generado para producción.
5. Despliegue en el VPS de Hostinger, por IP y HTTP. Las contraseñas viajan sin cifrar hasta que haya dominio con HTTPS, y eso se documenta como riesgo.
6. Estado de las partidas en memoria del servidor (una sola instancia). Si el servidor se reinicia, se pierden las partidas en curso.
7. Los efectos de los 3 poderes siguen el docx, que los marca como propuesta, no como reglas cerradas.

## Mapa de capacidades

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `platform` | Servidor base, SQLite, sesiones, configuración. Marca Playground con diseño mezclado (Stitch oscuro/lima + Quiz Party), navegación y Home. | — |
| `identity` | Cuenta de anfitrión (registro, login, logout). Entrada de invitado con nombre. | platform |
| `avatars` | Avatar aleatorio al entrar, personalizable después. Personajes con estética neón oscura de Stitch, no cyberpunk literal. | identity |
| `audio` | Música de fondo con silencio y volumen, y efectos de sonido de partida. | platform |
| `quiz-content` | Crear, editar y borrar quizzes, privados o públicos, y biblioteca con búsqueda por texto y categoría. Importa las 60 preguntas de `preguntas_trivia.json` con sus imágenes. | identity |
| `quiz-live` | Salas con código, hasta 10 jugadores, rondas de quiz, puntuación, 3 poderes, reconexión, revancha, modo individual. | identity, avatars, quiz-content |
| `draw-guess` | Ronda de dibujo: dibujante al azar, canvas con ratón (y táctil), palabra secreta, adivinanzas con tiempo, puntuación. | quiz-live |
| `stats` | Estadísticas y récords por jugador y globales, para los dos tipos de ronda. | quiz-live, draw-guess |
| `deploy` | Despliegue en VPS Hostinger: Node, proceso persistente, puerto, acceso por IP. | todos |

Orden de construcción: `platform` → `identity` → (`avatars`, `audio`, `quiz-content` en paralelo) → `quiz-live` → `draw-guess` → `stats` → `deploy`.
`deploy` se prepara desde el principio (script, variables de entorno) para desplegar versiones parciales.

## Criterios de aceptación por módulo

**platform**
- `npm start` levanta el servidor y `/` muestra la Home con el diseño unificado en móvil y ordenador.
- La base SQLite se crea sola al arrancar y no se versiona.

**identity**
- Un anfitrión se registra e inicia sesión; la cookie persiste entre recargas.
- Un invitado entra a una partida solo con nombre, sin cuenta.
- Las contraseñas nunca se guardan ni se registran en claro.

**avatars**
- Al entrar se asigna un avatar aleatorio.
- Puedo cambiar color, rasgos y accesorios antes de empezar la partida y mi elección se guarda (cuenta) o se recuerda en el navegador (invitado).
- Todos ven los avatares de la sala. Los avatares se generan como SVG por piezas, sin imágenes externas.

**audio**
- La música arranca tras el primer gesto del usuario (los navegadores bloquean el autoplay), con botón de silencio y control de volumen que se recuerdan.
- La música se detiene en silencio total si el usuario la apaga y no se reinicia entre pantallas.

**quiz-content**
- Importar `preguntas_trivia.json` crea las 60 preguntas con su categoría; `respuesta_correcta` (texto) se convierte al índice correcto.
- Las 8 preguntas con imagen (ids 6, 12, 20, 28, 34, 43, 51, 57) muestran su imagen. Si falta el archivo, la pregunta se oculta, no se rompe.
- Un anfitrión crea, edita y borra sus quizzes, y elige privado o público. Los públicos aparecen en la biblioteca con búsqueda y filtro por categoría. Se puede duplicar uno público.

**quiz-live**
- Crear partida genera un código de 5 caracteres único y un enlace; otro dispositivo entra con él.
- Máximo 10 jugadores; el 11.º recibe un error claro.
- Puntos por acierto con bonus de rapidez, con desglose visible tras cada ronda.
- Poderes: Doble apuesta, Escudo y Robo de tiempo, uno de cada por jugador y partida, con efecto anunciado.
- Si un jugador se desconecta, puede volver con el mismo nombre mientras dure la partida.
- Al final: clasificación, revancha con los mismos jugadores y modo individual.
- La partida usa una copia congelada del quiz: editarlo no altera una partida en curso.

**draw-guess**
- Durante la partida, algunas rondas son de dibujo (el anfitrión fija cuántas; por defecto 1 cada 4 preguntas). El dibujante se elige al azar y ningún jugador repite hasta que todos han dibujado.
- Solo el dibujante ve la palabra. Los demás ven su longitud como pista.
- El dibujo se ve en directo en todos los dispositivos con ratón o toque.
- Los demás escriben su intento; el servidor lo compara sin distinguir mayúsculas ni tildes. Acertar antes da más puntos. El dibujante gana puntos por cada acierto.
- La ronda termina cuando todos aciertan o se acaba el tiempo (por defecto 60 s). Al terminar se revela la palabra.
- Solo el dibujante puede dibujar: el servidor ignora trazos de otros.

**stats**
- Tras cada partida se guardan puntos, aciertos y aciertos de dibujo por jugador con cuenta.
- La pantalla de estadísticas muestra récords globales y los míos.

**deploy**
- La app queda accesible por `http://<IP>:<puerto>` y se reinicia sola tras un fallo o reinicio del servidor.
- Los secretos van en variables de entorno, no en el repositorio.

## Comandos

```
Instalar:   npm install
Desarrollo: npm run dev
Producción: npm start
Tests:      npm test
Lint:       npm run lint
Importar:   npm run seed
```

(`test`, `lint` y `seed` aún no existen; se crean en `platform` y `quiz-content`.)

## Estructura del proyecto

```
server.js              → arranque y wiring
src/db/                → SQLite y migraciones
src/auth/              → cuentas y sesiones
src/rooms/             → salas, rondas, poderes, puntuación
src/draw/              → ronda de dibujo
src/api/               → rutas REST (quizzes, stats)
public/                → frontend estático (HTML/JS/CSS)
public/avatars/        → piezas SVG
public/audio/          → música y efectos
public/img/questions/  → imágenes de preguntas (<id>.jpg)
data/                  → base SQLite (ignorada por git)
tests/                 → unitarios e integración
stitch_screens/        → diseños de referencia de Stitch
```

## Estilo de código

Mismo estilo que el repo actual, pero con funciones cortas y una por línea de lógica. Ejemplo del estilo (CommonJS, comillas simples, español en textos de usuario, inglés o español claro en identificadores):

```js
function joinRoom(room, player) {
  if (room.players.size >= MAX_PLAYERS) return { error: 'La sala está completa.' };
  room.players.set(player.id, player);
  return { room };
}
```

La lógica de reglas (puntos, poderes, turnos de dibujo) va en funciones puras para poder probarlas sin sockets.

## Estrategia de pruebas

- Unitarias (`node --test`): puntuación, poderes, elección de dibujante, comparación de palabras sin tildes, conversión del JSON de trivia.
- Integración: dos o más clientes Socket.io contra el servidor real: crear sala, unirse, jugar una ronda de quiz y una de dibujo.
- Navegador (playwright-cli): flujo completo en móvil y ordenador, incluida música y dibujo con ratón.
- Antes de dar un módulo por terminado: tests en verde y comprobación en navegador.

## Límites

- **Siempre:** validar toda entrada en el servidor (nombre, código, trazos, intentos); mantener la respuesta correcta y la palabra secreta solo en el servidor hasta que termine la ronda; limitar tamaño y frecuencia de trazos; escapar texto de usuario.
- **Preguntar antes:** añadir dependencias; cambiar el esquema de la base; tocar la rama `main` o hacer force push; borrar datos del VPS.
- **Nunca:** subir secretos, claves o la base SQLite al repositorio; confiar en el cliente para puntuar; borrar tests que fallan sin aprobación; desplegar sobre algo existente en el VPS sin revisarlo.

## Criterios de éxito globales

- Un grupo de hasta 10 personas en móviles distintos juega una partida completa (quiz y dibujo) desde un código, sin ayuda.
- El avatar se ve bien en lobby, ronda y clasificación.
- Música y silencio funcionan en móvil y ordenador.
- Las 60 preguntas importadas se juegan; las 8 con imagen la muestran.
- La app corre en el VPS y sobrevive a un reinicio.

## Preguntas abiertas

1. **Música:** ¿tienes pistas propias o con licencia? Si no, uso pistas libres de derechos (hay que elegirlas) o genero un bucle sencillo con WebAudio.
2. **Avatares:** "personajes con estilo cyberpunk pero no cyberpunk". ¿Qué quieres exactamente: criaturas o animales estilizados, personajes humanos cartoon o robots amistosos? Mientras tanto asumo criaturas/personajes cartoon con paleta neón.
3. **Imágenes de trivia:** ¿en qué carpeta están y cómo se llama cada archivo (por id)?
4. **Palabras de dibujo:** no hay lista aún. Propongo ~150 palabras en español por categorías, y que el anfitrión pueda añadir las suyas.
5. **VPS:** sistema operativo, versión de Node, puerto libre, y si ya corre algo más.
6. **Equipo:** quién es dueño de cada parte, para no pisarse el trabajo.
