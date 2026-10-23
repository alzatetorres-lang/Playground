# Plan de construcción

Decisiones (delegadas por el equipo, 2026-10-23):
- Runtime: Node 24 LTS en Docker (`node:24-alpine`). SQLite con `node:sqlite` integrado, hash con `crypto.scrypt`: sin dependencias nativas. Dependencias de producción: express y socket.io.
- Música: generada en el navegador con WebAudio (sin archivos de audio).
- Avatares: robots amistosos en SVG por piezas con animación CSS.
- Despliegue: VPS Hostinger KVM 2 (Ubuntu 24.04 + Docker + Traefik ya existentes y compartidos con otros proyectos). Proyecto Compose propio `playground`, dominio `playground.srv1964559.hstgr.cloud` con HTTPS por Traefik. No se toca ningún otro proyecto.
- Palabras de dibujo: las 1500 soluciones de Pictionary del banco de preguntas del equipo.
- Imágenes del banco: son miniaturas de Wikipedia mal emparejadas en parte (p. ej. Sagrada Familia). No se usan; las preguntas del banco se juegan como texto con la pista.

Orden: 1 platform+db → 2 identity → 3 content (seed) → 4 live (rooms) → 5 draw-guess → 6 avatars+audio+UI → 7 stats → 8 deploy.
Verificación por paso: `npm test` y comprobación en navegador.
