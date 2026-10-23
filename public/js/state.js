import { randomAvatar } from './avatar.js';
import { store } from './ui.js';

export const S = {
  user: null,
  name: store.get('pg_name', ''),
  avatar: store.get('pg_avatar', null) || randomAvatar(),
  room: null, you: null, phase: null, q: null, endsAt: 0, seconds: 0, picked: null, result: null, draw: null, announce: [], chat: [],
};

export function saveProfile() {
  store.set('pg_name', S.name);
  store.set('pg_avatar', S.avatar);
}
