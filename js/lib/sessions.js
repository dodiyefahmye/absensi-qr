// Fungsi bantu sesi (cermin dari fungsi database active_session / in_session).
export const sortSessions = (list) => (list || []).slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

export function activeSession(sessions, at = new Date()) {
  const t = +new Date(at);
  return sortSessions(sessions).find((s) => t >= +new Date(s.starts_at) && t <= +new Date(s.ends_at)) || null;
}
export function nextSession(sessions, at = new Date()) {
  const t = +new Date(at);
  return sortSessions(sessions).find((s) => +new Date(s.starts_at) > t) || null;
}
export function sessionStatus(s, at = new Date()) {
  const t = +new Date(at);
  if (t < +new Date(s.starts_at)) return 'upcoming';
  if (t > +new Date(s.ends_at)) return 'done';
  return 'live';
}
export const STATUS_LABEL = { live: '● Berlangsung', upcoming: 'Akan datang', done: 'Selesai' };
export const STATUS_CLASS = { live: 'ok', upcoming: 'blue', done: '' };

/** Peserta termasuk sesi ini? (kategori kosong = semua) */
export function inSession(p, s) {
  if (!s) return true;
  const cats = s.categories || [];
  return !cats.length || cats.includes(p.category || '');
}

const pad = (n) => String(n).padStart(2, '0');
export function fmtSessionRange(s) {
  const a = new Date(s.starts_at), b = new Date(s.ends_at);
  const day = a.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
  const t = (d) => `${pad(d.getHours())}.${pad(d.getMinutes())}`;
  const sameDay = a.toDateString() === b.toDateString();
  return sameDay ? `${day}, ${t(a)}–${t(b)}` : `${day} ${t(a)} – ${b.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${t(b)}`;
}
/** ISO → nilai input datetime-local */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
