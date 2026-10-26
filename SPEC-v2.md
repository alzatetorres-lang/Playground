# Spec v2: Playground · El universo Circuitia

Estado: aprobado por delegación del equipo (2026-10-23, "desarrolla todo, continúa en este modo").

## Objetivo
Convertir Playground en un videojuego de fiesta con varios modos, inspirado en lo que funciona de Blooket y mejorado, dentro de un universo propio de robots con historia, mapa de mundos, avatares 3D coleccionables y una web inmersiva.

## Qué tomamos de Blooket y cómo lo mejoramos
| Blooket | Idea clave | Nuestra versión (mejora) |
|---|---|---|
| Classic | Preguntas sincronizadas | **Arena Neón**: quiz + poderes + rondas de dibujo (ya existe) |
| Gold Quest | Acierto → elegir cofre (oro, robar, intercambiar) | **Mina de Chips**: 3 cápsulas con efectos visibles, robo y cambio con objetivo elegido, escudo contra robos |
| Racing | Primero en N aciertos | **Autopista Turbo**: pista con robots, turbo por racha y pulso EMP al líder |
| Fishing Frenzy | Acierto → pez; rachas mejoran el cebo | **Mar de Datos**: peces-robot por rareza y peso, cebo por racha, eventos de Frenesí para toda la sala |
| Crypto Hack | Minar y hackear contraseñas ajenas | **Fortaleza Firewall**: minar bits, mejorar minero con racha, hackear adivinando la contraseña entre 3 |
| Battle Royale | Eliminación | **Coliseo**: 3 vidas; fallar o no responder quita una; si fallan todos, nadie pierde |
| — | (no existe en Blooket) | **Taller de Grafitis**: partida solo de dibujo |
| Blooks + packs | Coleccionables por rareza | **Bots coleccionables**: robots 3D con acabados (común → mítico) que se abren en cápsulas pagadas con Tuercas ganadas jugando |

Mejoras sobre Blooket: modos con la misma sala y código, todo en español, historia que da sentido a cada modo, interacción con objetivo elegido (no al azar), y cuenta atrás y marcador en directo en todos los modos.

## Historia (original)
El sistema **Circuitia** funciona gracias al **Núcleo**, un cristal de datos. El **Rey Glitch**, un virus con corona, lo rompió en siete **Chips del Núcleo** y los escondió en siete mundos. **Volt**, un pequeño robot de reparación, y su dron **Chispa** recorren el mapa para recuperarlos. Cada mundo es un modo de juego. Al terminar una partida de un modo, ese mundo queda **liberado** en el mapa. Al liberar los siete, se ve el final con el Núcleo reparado.

Mundos: 1 Arena Neón · 2 Mina de Chips · 3 Autopista Turbo · 4 Mar de Datos · 5 Fortaleza Firewall · 6 Taller de Grafitis · 7 Coliseo de Glitch.

## Módulos
| Id | Responsabilidad | Depende de |
|---|---|---|
| `modes` | Modos en la sala: Arena (actual), Coliseo, Taller (solo dibujo) y modos a ritmo propio (Mina, Turbo, Mar, Firewall) con su motor | sala actual |
| `collection` | Tuercas por partida, cápsulas, acabados de robot, propiedad validada en servidor | identity |
| `avatars3d` | Robot 3D con Three.js a partir de la config; imagen cacheada para listas y visor vivo | collection |
| `universe` | Fondo espacial 3D, historia, mapa de mundos con Volt, progreso por mundo | modes |

## Criterios de aceptación
- **modes:** el anfitrión elige modo al crear la sala. Los modos a ritmo propio duran el tiempo elegido (2–10 min; Turbo termina al llegar a la meta). Cada jugador recibe sus preguntas. El servidor decide aciertos, recompensas, robos y hackeos. La respuesta correcta nunca llega antes de responder. Ranking final por la puntuación del modo, y se guardan estadísticas.
- **Mina:** tras acertar, 3 cápsulas ocultas. Al elegir una se revelan las tres. Robo e intercambio piden objetivo. El escudo protege del siguiente robo o intercambio.
- **Turbo:** cada acierto avanza 1; una racha de 3 da +1 extra; cada 5 aciertos seguidos, EMP al líder (−1). Gana quien llega primero a la meta.
- **Mar:** las capturas siguen una tabla de rareza; el cebo sube con la racha y baja al fallar; el Frenesí duplica las capturas 15 s.
- **Firewall:** acertar mina bits (multiplicador por racha); hackear exige adivinar la contraseña entre 3; acertar roba el 20 % y fallar pierde el turno.
- **Coliseo:** 3 vidas; los eliminados miran; termina con 1 superviviente o sin preguntas.
- **collection:** las cuentas ganan Tuercas según el puesto. Una cápsula cuesta 100 y da un acabado por rareza; un repetido devuelve 30. Un acabado no propio se ignora en servidor.
- **avatars3d:** el robot 3D se ve en lobby, marcadores y podio. Sin WebGL, cae al robot SVG.
- **universe:** portada con historia, mapa con los 7 mundos y progreso. Volt camina por el camino del mapa. Fondo espacial que reacciona a la fase.

## Fuera de alcance
Pagos, intercambio de bots entre jugadores, IA para generar preguntas.

## Pruebas
Unitarias de reglas de cada modo (`node --test`), integración con varios clientes por modo, y recorrido en navegador (escritorio y móvil).
