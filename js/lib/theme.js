// Tema, font, dan template bawaan acara.

export const DEFAULT_THEME = {
  primary: '#1d4ed8',
  secondary: '#f59e0b',
  background: '#eef2ff',
  text: '#0f172a',
  font: 'Inter',
  logo_url: '',
  banner_url: '',
};

export const FONTS = {
  'Inter': 'Inter:wght@400;600;700;800',
  'Poppins': 'Poppins:wght@400;600;700;800',
  'Montserrat': 'Montserrat:wght@400;600;700;800',
  'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@400;600;700;800',
  'Playfair Display': 'Playfair+Display:wght@400;600;700;800',
  'Merriweather': 'Merriweather:wght@400;700;900',
  'Lora': 'Lora:wght@400;600;700',
  'Sistem (tanpa unduh)': '',
};

export const DEFAULT_CATEGORIES = [
  { name: 'Peserta', color: '#2563eb' },
];

export function nameField() {
  return { key: 'nama', label: 'Nama Lengkap', type: 'text', required: true, placeholder: 'Tulis nama lengkap', locked: true };
}

export const BUILTIN_TEMPLATES = [
  {
    id: 'builtin-rapat',
    name: 'Rapat Internal',
    description: 'Peserta scan QR di layar lalu isi daftar hadir + tanda tangan.',
    mode: 'event_qr',
    theme: { ...DEFAULT_THEME, primary: '#0f3d7a', secondary: '#38bdf8', background: '#eef4fb', font: 'Plus Jakarta Sans' },
    categories: [{ name: 'Peserta', color: '#0f3d7a' }, { name: 'Pimpinan', color: '#b45309' }, { name: 'Notulis', color: '#047857' }],
    settings: { rotating_qr: true, rotate_seconds: 30, one_submit_per_device: false, unique_field: 'nip', success_message: 'Terima kasih, kehadiran Anda sudah tercatat.' },
    form_schema: [
      nameField(),
      { key: 'nip', label: 'NIP / No. Pegawai', type: 'text', required: true, placeholder: '' },
      { key: 'jabatan', label: 'Jabatan', type: 'text', required: true },
      { key: 'unit_kerja', label: 'Unit Kerja / Bagian', type: 'text', required: false },
      { key: 'ttd', label: 'Tanda Tangan', type: 'signature', required: true },
    ],
  },
  {
    id: 'builtin-seminar',
    name: 'Seminar / Workshop',
    description: 'Peserta terdaftar mendapat e-ticket QR, panitia scan di pintu masuk.',
    mode: 'participant_qr',
    theme: { ...DEFAULT_THEME, primary: '#4f46e5', secondary: '#f59e0b', background: '#f5f3ff', font: 'Poppins' },
    categories: [{ name: 'Peserta', color: '#4f46e5' }, { name: 'Pembicara', color: '#db2777' }, { name: 'Panitia', color: '#059669' }, { name: 'Media', color: '#0891b2' }],
    settings: { rotating_qr: false, success_message: 'Selamat datang! Silakan menuju ruangan.' },
    form_schema: [
      nameField(),
      { key: 'instansi', label: 'Instansi / Kampus', type: 'text', required: false },
      { key: 'email', label: 'Email', type: 'email', required: false },
      { key: 'no_hp', label: 'No. HP / WhatsApp', type: 'tel', required: false },
    ],
  },
  {
    id: 'builtin-formal',
    name: 'Acara Formal / Pelantikan',
    description: 'Tamu undangan VIP & umum, tampilan elegan, layar sambutan.',
    mode: 'participant_qr',
    theme: { ...DEFAULT_THEME, primary: '#7f1d1d', secondary: '#d4af37', background: '#fbf7ef', text: '#1c1917', font: 'Playfair Display' },
    categories: [{ name: 'VIP', color: '#b8860b' }, { name: 'Undangan', color: '#7f1d1d' }, { name: 'Panitia', color: '#166534' }, { name: 'Media', color: '#1e3a8a' }],
    settings: { rotating_qr: false, success_message: 'Selamat datang, terima kasih atas kehadiran Anda.' },
    form_schema: [
      nameField(),
      { key: 'jabatan', label: 'Jabatan', type: 'text', required: false },
      { key: 'instansi', label: 'Instansi', type: 'text', required: false },
      { key: 'meja', label: 'No. Meja / Kursi', type: 'text', required: false },
    ],
  },
  {
    id: 'builtin-campuran',
    name: 'Wisuda / Campuran',
    description: 'Panitia scan e-ticket + tamu tertentu bisa check-in mandiri dengan HP.',
    mode: 'hybrid',
    theme: { ...DEFAULT_THEME, primary: '#0f766e', secondary: '#38bdf8', background: '#eff6ff', font: 'Inter' },
    categories: [{ name: 'Wisudawan', color: '#1e3a8a' }, { name: 'Orang Tua', color: '#b45309' }, { name: 'Undangan', color: '#7c3aed' }, { name: 'Panitia', color: '#047857' }],
    settings: { rotating_qr: true, rotate_seconds: 30, success_message: 'Selamat datang, terima kasih atas kehadiran Anda.',
      self_checkin: { enabled: true, who: 'categories', categories: ['Orang Tua', 'Undangan'] },
      walkin: { enabled: false, category: 'Tamu tambahan' } },
    form_schema: [
      nameField(),
      { key: 'nim', label: 'NIM', type: 'text', required: false },
      { key: 'fakultas', label: 'Fakultas', type: 'text', required: false },
      { key: 'prodi', label: 'Program Studi', type: 'text', required: false },
      { key: 'no_hp', label: 'No. HP / WhatsApp', type: 'tel', required: false },
    ],
  },
  {
    id: 'builtin-kosong',
    name: 'Kosong',
    description: 'Mulai dari nol, atur semuanya sendiri.',
    mode: 'participant_qr',
    theme: { ...DEFAULT_THEME },
    categories: DEFAULT_CATEGORIES,
    settings: {},
    form_schema: [nameField()],
  },
];

export function normalizeTheme(t) { return { ...DEFAULT_THEME, ...(t || {}) }; }

const loadedFonts = new Set();
export function loadFont(name) {
  const spec = FONTS[name];
  if (!spec || loadedFonts.has(name)) return;
  loadedFonts.add(name);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  document.head.appendChild(l);
}

export function contrastInk(hex) {
  const c = String(hex || '#000').replace('#', '');
  const n = c.length === 3 ? c.split('').map((x) => x + x).join('') : c.padEnd(6, '0');
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#111827' : '#ffffff';
}

export function fontStack(name) {
  if (!name || !FONTS[name]) return 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const serif = /Playfair|Merriweather|Lora/.test(name);
  return `"${name}", ${serif ? 'Georgia, serif' : 'system-ui, sans-serif'}`;
}

/** Terapkan tema acara ke elemen (pakai class .themed). */
export function applyTheme(el, theme) {
  const t = normalizeTheme(theme);
  loadFont(t.font);
  el.classList.add('themed');
  el.style.setProperty('--t-primary', t.primary);
  el.style.setProperty('--t-secondary', t.secondary);
  el.style.setProperty('--t-bg', t.background);
  el.style.setProperty('--t-text', t.text);
  el.style.setProperty('--t-ink', contrastInk(t.primary));
  el.style.setProperty('--t-font', fontStack(t.font));
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = t.primary;
  return t;
}

export function categoryColor(event, name) {
  const c = (event?.categories || []).find((x) => x.name === name);
  return c?.color || '#64748b';
}
