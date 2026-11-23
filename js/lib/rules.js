// Aturan mode acara & check-in mandiri (cermin dari fungsi database can_self_checkin).
export const MODE_LABEL = { participant_qr: 'QR Peserta', event_qr: 'QR Acara', hybrid: 'Campuran' };
export const usesParticipantScan = (ev) => ev.mode === 'participant_qr' || ev.mode === 'hybrid';
export const usesEventQR = (ev) => ev.mode === 'event_qr' || ev.mode === 'hybrid';

export function selfCheckinConfig(ev) {
  return { enabled: false, who: 'all', categories: [], ...(ev?.settings?.self_checkin || {}) };
}
export function walkinConfig(ev) {
  return { enabled: false, category: 'Tamu tambahan', ...(ev?.settings?.walkin || {}) };
}
/** true/false: apakah peserta boleh check-in mandiri. */
export function canSelfCheckin(p, ev) {
  const c = selfCheckinConfig(ev);
  if (ev.mode !== 'hybrid' || !c.enabled) return false;
  if (p.self_checkin === true || p.self_checkin === false) return p.self_checkin;
  if (c.who === 'all') return true;
  if (c.who === 'categories') return (c.categories || []).includes(p.category || '');
  return false;
}
export const SOURCE_LABEL = { scan: 'Scan panitia', form: 'Formulir', manual: 'Manual', self: 'Mandiri' };
