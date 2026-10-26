import { io } from '/socket.io/socket.io.esm.min.js';

export const socket = io({ autoConnect: true });

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Algo ha fallado.');
  return data;
}

export const ask = (event, payload) => new Promise(resolve => {
  const t = setTimeout(() => resolve({ error: 'El servidor no responde.' }), 8000);
  socket.emit(event, payload, res => { clearTimeout(t); resolve(res || {}); });
});

// Diferencia entre el reloj del servidor y el nuestro, para que el temporizador coincida.
let offset = 0;
export const syncClock = serverNow => { if (serverNow) offset = serverNow - Date.now(); };
export const serverTime = () => Date.now() + offset;
