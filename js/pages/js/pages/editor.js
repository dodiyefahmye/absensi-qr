import * as api from '../lib/api.js';
import { h, toast, modal, errMsg, navigate, spinner, confirmDialog, switchEl, copyText, promptDialog, fmtDate, hhmm } from '../lib/ui.js';
import { normalizeTheme, FONTS, DEFAULT_THEME, applyTheme, contrastInk } from '../lib/theme.js';
import { formBuilder } from '../components/form-builder.js';
import { participantsTab } from '../components/participants.js';
import { ticketDesignerTab } from '../components/ticket-designer.js';
import { renderForm } from '../lib/form.js';
import { drawQR, joinUrl, publicFormUrl } from '../lib/qr.js';

const TABS = [
  ['info', '📄 Info'], ['branding', '🎨 Tampilan'], ['form', '🧾 Formulir'],
  ['peserta', '👥 Peserta'], ['kartu', '🎫 Kartu'], ['operator', '📱 Operator'], ['settings', '⚙️ Pengaturan'],
];

export default async function editor(root, { params, query }) {
  const wrap = h('div', { class: 'container' });
  root.appendChild(wrap);
  wrap.appendChild(spinner());

  let ev, role;
  try {
    [ev, role] = await Promise.all([api.getEvent(params.id), api.myRole(params.id)]);
  } catch (e) {
    wrap.replaceChildren(h('div', { class: 'card empty' }, h('p', null, 'Acara tidak ditemukan atau Anda tidak punya akses.'), h('a', { class: 'btn', href: '#/' }, 'Kembali')));
    return;
  }
  if (role === 'scanner') { navigate(`/event/${ev.id}/${ev.mode === 'participant_qr' ? 'scan' : 'display'}`); return; }

  let current = TABS.some(([k]) => k === query.tab) ? query.tab : 'info';
  let tabCleanup = null;
  const title = h('h1', { style: { margin: 0 } }, ev.name);
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('div');

  const quick = () => h('div', { class: 'row' },
    ev.mode === 'participant_qr' ? h('a', { class: 'btn sm primary', href: `#/event/${ev.id}/scan` }, '📷 Scanner') : null,
    h('a', { class: 'btn sm', href: `#/event/${ev.id}/display` }, '🖥️ Layar tampilan'),
    h('a', { class: 'btn sm', href: `#/event/${ev.id}/report` }, '📊 Laporan'),
    ev.mode === 'event_qr' ? h('button', { class: 'btn sm', onclick: () => copyText(publicFormUrl(ev.public_token)) }, '🔗 Salin link formulir') : null);
  const quickBox = h('div');
  wrap.replaceChildren(
    h('div', { class: 'row', style: { marginBottom: '.25rem' } }, h('a', { href: '#/', class: 'small' }, '← Semua acara')),
    h('div', { class: 'row between', style: { marginBottom: '1rem' } }, title, quickBox),
    tabsEl, body);

  async function save(patch, msg = 'Tersimpan') {
    try {
      ev = await api.updateEvent(ev.id, patch);
      title.textContent = ev.name;
      quickBox.replaceChildren(quick());
      toast(msg, 'ok');
      return ev;
    } catch (e) { toast(errMsg(e), 'err'); throw e; }
  }
  const ctx = { get ev() { return ev; }, save, role };

  function show(tab) {
    current = tab;
    history.replaceState(null, '', `#/event/${ev.id}?tab=${tab}`);
    if (tabCleanup) { try { tabCleanup(); } catch (e) { /* */ } tabCleanup = null; }
    tabsEl.replaceChildren(...TABS.map(([k, l]) => h('button', { class: k === tab ? 'active' : '', role: 'tab', onclick: () => show(k) }, l)));
    body.replaceChildren();
    const fn = { info: infoTab, branding: brandingTab, form: formTab, peserta: participantsTab, kartu: ticketDesignerTab, operator: operatorTab, settings: settingsTab }[tab];
    const r = fn(body, ctx);
    if (typeof r === 'function') tabCleanup = r;
  }
  quickBox.replaceChildren(quick());
  show(current);
  return () => { if (tabCleanup) tabCleanup(); };
}

/* ------------------------------ INFO ------------------------------ */
function infoTab(body, { ev, save }) {
  const f = {
    name: h('input', { type: 'text', value: ev.name }),
    organizer: h('input', { type: 'text', value: ev.organizer || '', placeholder: 'mis. Bagian Umum / Panitia HUT' }),
    location: h('input', { type: 'text', value: ev.location || '', placeholder: 'mis. Aula Utama' }),
    event_date: h('input', { type: 'date', value: ev.event_date || '' }),
    start_time: h('input', { type: 'time', value: hhmm(ev.start_time) }),
    end_time: h('input', { type: 'time', value: hhmm(ev.end_time) }),
    description: h('textarea', { placeholder: 'Deskripsi singkat yang tampil di formulir & layar' }, ev.description || ''),
  };
  const L = (label, el) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), el);
  body.appendChild(h('div', { class: 'card stack', style: { maxWidth: '760px' } },
    L('Nama acara *', f.name),
    h('div', { class: 'grid grid-2' }, L('Penyelenggara', f.organizer), L('Lokasi', f.location)),
    h('div', { class: 'grid grid-4' }, L('Tanggal', f.event_date), L('Jam mulai', f.start_time), L('Jam selesai', f.end_time)),
    L('Deskripsi', f.description),
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => {
      if (!f.name.value.trim()) return toast('Nama acara wajib diisi', 'err');
      await save({
        name: f.name.value.trim(), organizer: f.organizer.value.trim() || null, location: f.location.value.trim() || null,
        event_date: f.event_date.value || null, start_time: f.start_time.value || null, end_time: f.end_time.value || null,
        description: f.description.value.trim() || null,
      });
    } }, 'Simpan'))));
}

/* ---------------------------- BRANDING ---------------------------- */
function brandingTab(body, { ev, save }) {
  const theme = normalizeTheme(ev.theme);
  const preview = h('div', { class: 'preview-frame' });

  function colorRow(key, label) {
    const color = h('input', { type: 'color', value: theme[key] });
    const text = h('input', { type: 'text', value: theme[key], maxlength: 7 });
    color.addEventListener('input', () => { theme[key] = color.value; text.value = color.value; renderPreview(); });
    text.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(text.value)) { theme[key] = text.value; color.value = text.value; renderPreview(); } else text.value = theme[key]; });
    return h('div', { class: 'field' }, h('span', { class: 'lbl' }, label), h('div', { class: 'color-row' }, color, text));
  }

  function imageField(key, label, hint) {
    const box = h('div', { class: 'logo-box' });
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml,image/webp', class: 'hidden' });
    const status = h('span', { class: 'small muted' });
    const paint = () => box.replaceChildren(theme[key] ? h('img', { src: theme[key], alt: label }) : h('span', { class: 'small muted' }, 'Belum ada'));
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) return toast('Ukuran maksimal 3 MB', 'err');
      status.textContent = 'Mengunggah…';
      try {
        theme[key] = await api.uploadAsset(ev.id, file, key.replace('_url', ''));
        paint(); renderPreview(); status.textContent = 'Terunggah — klik Simpan';
      } catch (e) { status.textContent = ''; toast(errMsg(e), 'err'); }
      input.value = '';
    });
    paint();
    return h('div', { class: 'field' }, h('span', { class: 'lbl' }, label),
      h('div', { class: 'row' }, box, h('div', { class: 'stack' },
        h('button', { class: 'btn sm', onclick: () => input.click() }, 'Pilih gambar'),
        h('button', { class: 'btn sm ghost', onclick: () => { theme[key] = ''; paint(); renderPreview(); } }, 'Hapus'),
        status)),
      h('div', { class: 'help' }, hint), input);
  }

  const fontSel = h('select', { onchange: () => { theme.font = fontSel.value; renderPreview(); } }, Object.keys(FONTS).map((f) => h('option', { value: f }, f)));
  fontSel.value = theme.font in FONTS ? theme.font : 'Inter';

  function renderPreview() {
    const page = h('div', { style: { minHeight: '440px' } });
    applyTheme(page, theme);
    const form = renderForm(ev.form_schema.slice(0, 3), {});
    page.append(
      h('div', { class: 't-hero' + (theme.banner_url ? ' has-banner' : ''), style: theme.banner_url ? { backgroundImage: `url("${theme.banner_url}")` } : null },
        theme.logo_url ? h('img', { class: 't-logo', src: theme.logo_url, alt: '' }) : null,
        h('h1', null, ev.name), h('div', { class: 'meta' }, [ev.event_date ? fmtDate(ev.event_date) : '', ev.location].filter(Boolean).join(' · '))),
      h('div', { class: 't-card', style: { margin: '-2.5rem 1rem 1rem' } }, h('h3', null, 'Daftar Hadir'), form.el,
        h('button', { class: 'btn primary block', style: { marginTop: '1rem' } }, 'Kirim Kehadiran')),
      h('div', { class: 't-footer' }, ev.organizer || ''));
    preview.replaceChildren(page);
  }

  body.appendChild(h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' } },
    h('div', { class: 'card stack' },
      h('h3', null, 'Identitas visual'),
      imageField('logo_url', 'Logo', 'PNG transparan disarankan, maks. 3 MB.'),
      imageField('banner_url', 'Gambar banner (opsional)', 'Tampil sebagai latar header formulir & tiket.'),
      h('div', { class: 'grid grid-2' }, colorRow('primary', 'Warna utama'), colorRow('secondary', 'Warna aksen')),
      h('div', { class: 'grid grid-2' }, colorRow('background', 'Warna latar'), colorRow('text', 'Warna teks')),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Font'), fontSel),
      h('div', { class: 'row end' },
        h('button', { class: 'btn ghost', onclick: () => { Object.assign(theme, { ...DEFAULT_THEME, logo_url: theme.logo_url, banner_url: theme.banner_url }); body.replaceChildren(); brandingTab(body, { ev: { ...ev, theme }, save }); } }, 'Reset warna'),
        h('button', { class: 'btn', onclick: () => saveAsTemplate(ev, theme) }, 'Simpan sbg template'),
        h('button', { class: 'btn primary', onclick: () => save({ theme }) }, 'Simpan tampilan'))),
    h('div', { class: 'stack' }, h('div', { class: 'small muted', style: { fontWeight: 600 } }, 'Pratinjau langsung'), preview)));
  renderPreview();
}

async function saveAsTemplate(ev, theme) {
  const name = await promptDialog('Simpan sebagai template', { label: 'Nama template', value: ev.name });
  if (!name) return;
  try {
    await api.createTemplate({ name, mode: ev.mode, theme: theme || ev.theme, form_schema: ev.form_schema, settings: ev.settings, categories: ev.categories });
    toast('Template tersimpan', 'ok');
  } catch (e) { toast(errMsg(e), 'err'); }
}

/* ------------------------------ FORM ------------------------------ */
function formTab(body, { ev, save }) {
  let dirty = false;
  const saveBtn = h('button', { class: 'btn primary' }, 'Simpan formulir');
  const fb = formBuilder(ev.form_schema, () => { dirty = true; saveBtn.textContent = 'Simpan formulir •'; });
  saveBtn.addEventListener('click', async () => {
    const schema = fb.get();
    const keys = schema.map((f) => f.key);
    if (new Set(keys).size !== keys.length) return toast('Ada kunci field yang sama', 'err');
    if (schema.some((f) => f.options && !f.options.length)) return toast('Field pilihan harus punya minimal 1 opsi', 'err');
    await save({ form_schema: schema }, 'Formulir tersimpan');
    dirty = false; saveBtn.textContent = 'Simpan formulir';
  });
  const info = ev.mode === 'event_qr'
    ? 'Formulir ini diisi peserta di HP masing-masing setelah memindai QR acara.'
    : 'Field ini menjadi kolom data peserta (untuk input manual & import Excel) dan ikut tampil di laporan.';
  body.appendChild(h('div', { style: { maxWidth: '820px' } },
    h('div', { class: 'row between', style: { marginBottom: '1rem' } },
      h('p', { class: 'muted', style: { margin: 0, flex: 1, minWidth: '240px' } }, info),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: fb.preview }, '👁 Pratinjau'), saveBtn)),
    fb.el));
  const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);
  return () => window.removeEventListener('beforeunload', warn);
}

/* ---------------------------- OPERATOR ---------------------------- */
function operatorTab(body, { ev, save, role }) {
  const codeEl = h('div', { class: 'mono', style: { fontSize: '2rem', fontWeight: 800, letterSpacing: '.15em' } }, ev.invite_code);
  const qrCanvas = h('canvas', { style: { width: '160px', height: '160px', borderRadius: '10px', border: '1px solid var(--border)' } });
  const paintQR = () => drawQR(qrCanvas, joinUrl(ev.invite_code), { size: 320 }).catch(() => {});
  paintQR();
  const members = h('div', null, spinner());

  async function loadMembers() {
    try {
      const rows = await api.listMembers(ev.id);
      const me = api.state.user.id;
      members.replaceChildren(h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Nama'), h('th', null, 'Email'), h('th', null, 'Peran'), h('th', null, ''))),
        h('tbody', null, rows.map((m) => {
          const sel = h('select', { disabled: role !== 'owner' || m.role === 'owner', style: { maxWidth: '150px' }, onchange: async () => {
            try { await api.updateMemberRole(ev.id, m.user_id, sel.value); toast('Peran diubah', 'ok'); } catch (e) { toast(errMsg(e), 'err'); }
          } }, m.role === 'owner' ? h('option', { value: 'owner' }, 'Pemilik') : null, h('option', { value: 'admin' }, 'Admin'), h('option', { value: 'scanner' }, 'Operator scan'));
          sel.value = m.role;
          return h('tr', null,
            h('td', null, m.profile?.full_name || '—', m.user_id === me ? h('span', { class: 'badge', style: { marginLeft: '.4rem' } }, 'Anda') : null),
            h('td', { class: 'small muted' }, m.profile?.email || ''),
            h('td', null, sel),
            h('td', { class: 'actions' }, m.role !== 'owner' ? h('button', { class: 'btn sm ghost', onclick: async () => {
              if (!(await confirmDialog(`Keluarkan ${m.profile?.full_name || 'anggota ini'} dari acara?`, { danger: true, okLabel: 'Keluarkan' }))) return;
              try { await api.removeMember(ev.id, m.user_id); loadMembers(); } catch (e) { toast(errMsg(e), 'err'); }
            } }, 'Keluarkan') : null));
        })))));
    } catch (e) { members.replaceChildren(h('p', { class: 'muted' }, errMsg(e))); }
  }

  body.appendChild(h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' } },
    h('div', { class: 'card stack' },
      h('h3', null, 'Undang operator scanner'),
      h('p', { class: 'muted small' }, 'Bagikan kode atau QR ini ke panitia lain. Setelah login dan memasukkan kode, mereka bisa memindai dari perangkat masing-masing secara bersamaan. Semua data tersinkron realtime.'),
      h('div', { class: 'row' }, qrCanvas, h('div', { class: 'stack' }, h('div', { class: 'small muted' }, 'Kode undangan'), codeEl)),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => copyText(ev.invite_code) }, 'Salin kode'),
        h('button', { class: 'btn sm', onclick: () => copyText(joinUrl(ev.invite_code)) }, 'Salin link'),
        h('a', { class: 'btn sm', target: '_blank', rel: 'noopener', href: 'https://wa.me/?text=' + encodeURIComponent(`Bergabung sebagai operator absensi "${ev.name}": ${joinUrl(ev.invite_code)} (kode: ${ev.invite_code})`) }, 'Kirim via WhatsApp'),
        h('button', { class: 'btn sm ghost', onclick: async () => {
          if (!(await confirmDialog('Buat kode baru? Kode lama tidak bisa dipakai lagi (operator yang sudah bergabung tetap aktif).'))) return;
          try { const code = await api.regenerateInvite(ev.id); ev.invite_code = code; codeEl.textContent = code; paintQR(); toast('Kode baru dibuat', 'ok'); } catch (e) { toast(errMsg(e), 'err'); }
        } }, '↻ Kode baru'))),
    h('div', { class: 'card stack' },
      h('div', { class: 'row between' }, h('h3', null, 'Tim panitia'), h('button', { class: 'btn sm ghost', onclick: loadMembers }, '↻')),
      h('p', { class: 'small muted' }, 'Admin: bisa mengubah acara & peserta. Operator scan: hanya scan, layar, dan laporan.'),
      members)));
  loadMembers();
}

/* ---------------------------- SETTINGS ---------------------------- */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function settingsTab(body, { ev, save }) {
  const s = { rotating_qr: false, rotate_seconds: 30, one_submit_per_device: false, unique_field: '', success_message: '', scan_reset_ms: 1600, ...(ev.settings || {}) };
  let mode = ev.mode;
  let categories = JSON.parse(JSON.stringify(ev.categories || []));

  const modeBox = h('div', { class: 'grid grid-2' });
  const renderMode = () => modeBox.replaceChildren(...[
    ['participant_qr', '🎫 QR Peserta', 'Setiap peserta punya QR/e-ticket unik. Panitia memindai di meja registrasi. Cocok untuk acara formal & undangan.'],
    ['event_qr', '🖥️ QR Acara', 'Satu QR ditampilkan di layar. Peserta memindai dengan HP lalu mengisi formulir. Cocok untuk rapat & acara terbuka.'],
  ].map(([k, t, d]) => h('button', { type: 'button', class: 'card flat', style: { textAlign: 'left', cursor: 'pointer', borderWidth: '2px', borderColor: mode === k ? 'var(--primary)' : 'var(--border)', font: 'inherit', color: 'inherit' }, onclick: () => { mode = k; renderMode(); syncVis(); } },
    h('strong', null, t), h('p', { class: 'small muted', style: { margin: '.3rem 0 0' } }, d))));
  renderMode();

  const catList = h('div', { class: 'stack' });
  const renderCats = () => catList.replaceChildren(...categories.map((c, i) => h('div', { class: 'row' },
    h('input', { type: 'color', value: c.color || '#2563eb', oninput: (e) => { c.color = e.target.value; } }),
    h('input', { type: 'text', value: c.name, style: { flex: 1, minWidth: '140px' }, oninput: (e) => { c.name = e.target.value; } }),
    h('button', { class: 'btn ghost icon sm', title: 'Hapus', onclick: () => { categories.splice(i, 1); renderCats(); } }, '🗑'))),
  h('button', { class: 'btn sm', onclick: () => { categories.push({ name: 'Kategori ' + (categories.length + 1), color: '#64748b' }); renderCats(); } }, '＋ Tambah kategori'));
  renderCats();

  const isOpen = switchEl(ev.is_open, 'Absensi dibuka');
  const isActive = switchEl(ev.is_active, 'Acara aktif (nonaktif = link & QR tidak bisa dipakai)');
  const openAt = h('input', { type: 'datetime-local', value: toLocalInput(ev.open_at) });
  const closeAt = h('input', { type: 'datetime-local', value: toLocalInput(ev.close_at) });
  const rot = switchEl(s.rotating_qr, 'QR berganti otomatis (anti titip absen)');
  const rotSec = h('input', { type: 'number', min: 10, max: 600, value: s.rotate_seconds, style: { maxWidth: '120px' } });
  const perDevice = switchEl(s.one_submit_per_device, 'Satu kali isi per perangkat (HP)');
  const uniq = h('select', null, h('option', { value: '' }, '— Tidak ada —'),
    (ev.form_schema || []).filter((f) => ['text', 'email', 'tel', 'number'].includes(f.type) && f.key !== 'nama').map((f) => h('option', { value: f.key }, `${f.label} (${f.key})`)));
  uniq.value = s.unique_field || '';
  const success = h('input', { type: 'text', value: s.success_message || '', placeholder: 'Terima kasih, kehadiran Anda sudah tercatat.' });
  const resetMs = h('input', { type: 'number', min: 600, max: 5000, step: 100, value: s.scan_reset_ms, style: { maxWidth: '120px' } });

  const eqBox = h('div', { class: 'card stack' },
    h('h3', null, 'Pengaturan QR Acara'),
    h('div', { class: 'row' }, rot.el, h('label', { class: 'row small' }, 'tiap', rotSec, 'detik')),
    perDevice.el,
    h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Cegah isi ganda berdasarkan field'), uniq, h('div', { class: 'help' }, 'Mis. NIP atau email: orang yang sama tidak bisa absen dua kali.')));
  const pqBox = h('div', { class: 'card stack' },
    h('h3', null, 'Pengaturan Scanner'),
    h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Lama tampilan hasil scan (ms)'), resetMs, h('div', { class: 'help' }, 'Makin kecil makin cepat antrean. Disarankan 1200–2000.')));
  const syncVis = () => { eqBox.classList.toggle('hidden', mode !== 'event_qr'); pqBox.classList.toggle('hidden', mode !== 'participant_qr'); };
  syncVis();

  body.appendChild(h('div', { class: 'stack', style: { maxWidth: '860px' } },
    h('div', { class: 'card stack' }, h('h3', null, 'Mode absensi'), modeBox),
    h('div', { class: 'card stack' },
      h('h3', null, 'Waktu & status'),
      isActive.el, isOpen.el,
      h('div', { class: 'grid grid-2' },
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Buka otomatis mulai (opsional)'), openAt),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Tutup otomatis pada (opsional)'), closeAt)),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Pesan setelah berhasil absen'), success)),
    eqBox, pqBox,
    h('div', { class: 'card stack' }, h('h3', null, 'Kategori peserta'), h('p', { class: 'small muted' }, 'Warna kategori tampil sebagai badge saat scan, di tiket, dan laporan.'), catList),
    h('div', { class: 'row end' }, h('button', { class: 'btn primary lg', onclick: async () => {
      if (openAt.value && closeAt.value && new Date(openAt.value) >= new Date(closeAt.value)) return toast('Waktu tutup harus setelah waktu buka', 'err');
      await save({
        mode, categories: categories.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), color: c.color })),
        is_open: isOpen.input.checked, is_active: isActive.input.checked,
        open_at: openAt.value ? new Date(openAt.value).toISOString() : null,
        close_at: closeAt.value ? new Date(closeAt.value).toISOString() : null,
        settings: { ...s, rotating_qr: rot.input.checked, rotate_seconds: Math.max(10, Number(rotSec.value) || 30),
          one_submit_per_device: perDevice.input.checked, unique_field: uniq.value, success_message: success.value.trim(),
          scan_reset_ms: Math.min(5000, Math.max(600, Number(resetMs.value) || 1600)) },
      }, 'Pengaturan tersimpan');
    } }, 'Simpan pengaturan')),
    h('div', { class: 'card stack', style: { borderColor: 'var(--err)' } },
      h('h3', null, 'Lainnya'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: async () => {
          const name = await promptDialog('Duplikat acara', { label: 'Nama acara baru', value: ev.name + ' (salinan)' });
          if (!name) return;
          try {
            const n = await api.createEvent({ name, mode: ev.mode, theme: ev.theme, form_schema: ev.form_schema, settings: ev.settings, categories: ev.categories,
              organizer: ev.organizer, location: ev.location, description: ev.description, start_time: ev.start_time, end_time: ev.end_time });
            toast('Acara diduplikat (tanpa peserta)', 'ok'); navigate(`/event/${n.id}`);
          } catch (e) { toast(errMsg(e), 'err'); }
        } }, '⧉ Duplikat acara'),
        h('button', { class: 'btn', onclick: () => saveAsTemplate(ev) }, '💾 Simpan sebagai template'),
        api.state.user.id === ev.owner_id ? h('button', { class: 'btn danger', onclick: async () => {
          if (!(await confirmDialog(`Hapus acara "${ev.name}" beserta SEMUA peserta dan data absensinya? Tindakan ini tidak bisa dibatalkan.`, { danger: true, okLabel: 'Hapus permanen' }))) return;
          try { await api.deleteEvent(ev.id); toast('Acara dihapus', 'ok'); navigate('/'); } catch (e) { toast(errMsg(e), 'err'); }
        } }, '🗑 Hapus acara') : null))));
}
