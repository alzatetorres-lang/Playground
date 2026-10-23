const { Room } = require('./room');

const MAX_ROOMS = 300;
const IDLE_EMPTY_MS = 10 * 60_000;
const IDLE_ANY_MS = 3 * 60 * 60_000;

function createManager({ emitter, nextWord, onFinish, limits }) {
  const rooms = new Map();

  function newCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c;
    do {
      c = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    } while (rooms.has(c));
    return c;
  }

  function create({ quiz, settings }) {
    if (rooms.size >= MAX_ROOMS) return { error: 'Hay demasiadas partidas activas. Inténtalo en unos minutos.' };
    const room = new Room({ code: newCode(), quiz, settings, emitter, nextWord, onFinish, limits });
    rooms.set(room.code, room);
    return { room };
  }

  const get = code => rooms.get(String(code || '').trim().toUpperCase());

  function sweep(now = Date.now()) {
    for (const [code, room] of rooms) {
      const idle = now - room.touchedAt;
      if ((room.isEmpty() && idle > IDLE_EMPTY_MS) || idle > IDLE_ANY_MS) {
        room.destroy();
        rooms.delete(code);
      }
    }
  }

  const interval = setInterval(sweep, 60_000);
  interval.unref();

  return { create, get, sweep, size: () => rooms.size, stop: () => { clearInterval(interval); for (const r of rooms.values()) r.destroy(); rooms.clear(); } };
}

module.exports = { createManager };
