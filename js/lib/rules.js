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

/* ---------- Verifikasi data pribadi (check-in mandiri) ---------- */
export const VERIFY_BUILTIN = [{ key: '_phone', label: 'No. HP', type: 'tel' }, { key: '_email', label: 'Email', type: 'email' }];

/** Field yang bisa dipakai untuk verifikasi. */
export function verifyFieldOptions(ev) {
  const fromForm = (ev.form_schema || [])
    .filter((f) => f.key !== 'nama' && ['text', 'number', 'tel', 'email', 'date'].includes(f.type))
    .map((f) => ({ key: f.key, label: f.label || f.key, type: f.type }));
  const out = [...fromForm];
  for (const b of VERIFY_BUILTIN) if (!fromForm.some((f) => f.type === b.type)) out.push(b);
  return out;
}

/** Konfigurasi verifikasi dari settings (pengelola) atau dari info publik (settings.verify). */
export function verifyConfig(ev) {
  const pub = ev?.settings?.verify;
  if (pub && pub.field) return { enabled: true, field: pub.field, mode: pub.mode || 'last4' };
  const v = ev?.settings?.self_checkin?.verify || {};
  return { enabled: !!v.enabled && !!v.field, field: v.field || '', mode: v.mode || 'last4' };
}

/** Teks & tipe input yang ditampilkan ke peserta. */
export function verifyPrompt(ev) {
  const c = verifyConfig(ev);
  if (!c.enabled) return null;
  const f = verifyFieldOptions(ev).find((x) => x.key === c.field) || { label: c.field, type: 'text' };
  if (c.mode === 'last4') {
    const digits = f.type === 'tel' || f.type === 'number' || /nim|nip|nik|nis|npm|hp|telp|phone/i.test(f.key + f.label);
    return { label: `4 ${digits ? 'digit' : 'karakter'} terakhir ${f.label}`, placeholder: '••••', inputType: 'text', inputmode: digits ? 'numeric' : 'text', maxlength: 4 };
  }
  return { label: f.label, placeholder: f.type === 'date' ? '' : `Ketik ${f.label} Anda`, inputType: f.type === 'date' ? 'date' : 'text', inputmode: f.type === 'tel' || f.type === 'number' ? 'numeric' : 'text', maxlength: 120 };
}
