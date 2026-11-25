// Tab "Sesi": banyak sesi absensi dalam satu acara (mis. Hari 1 Pagi/Sore). Satu e-ticket untuk semua sesi.
import * as api from '../lib/api.js';
import { h, toast, modal, errMsg, spinner, confirmDialog } from '../lib/ui.js';
import { sortSessions, sessionStatus, STATUS_LABEL, STATUS_CLASS, fmtSessionRange, toLocalInput } from '../lib/sessions.js';
import { categoryColor, contrastInk } from '../lib/theme.js';

const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toISO = (date, time) => new Date(`${date}T${time || '00:00'}`).toISOString();
const timeOf = (iso) => (iso ? toLocalInput(iso).slice(11, 16) : '');
const dateOf = (iso) => (iso ? toLocalInput(iso).slice(0, 10) : '');

export function sessionsTab(body, { ev }) {
  let sessions = [], counts = new Map();
  const listBox = h('div', null, spinner());
  const cats = (ev.categories || []).filter((c) => c.name);

  body.appendChild(h('div', { style: { maxWidth: '900px' } },
    h('div', { class: 'card flat stack', style: { marginBottom: '1rem', background: 'var(--surface-2)' } },
      h('b', null, '🗓 Absensi lebih dari sekali dalam satu acara'),
      h('div', { class: 'small muted' }, 'Contoh: OSPEK absen pagi & sore selama 2 hari, atau kegiatan Seminar (hari 1) dan Workshop (hari 2). Peserta cukup memegang SATU e-ticket untuk semua sesi. Scanner otomatis memakai sesi yang sedang berlangsung.'),
      h('div', { class: 'small muted' }, 'Tanpa sesi, acara memakai absensi sekali saja seperti biasa.')),
    h('div', { class: 'row', style: { marginBottom: '1rem' } },
      h('button', { class: 'btn primary', onclick: () => edit() }, '＋ Tambah sesi'),
      h('button', { class: 'btn', onclick: generator }, '⚡ Buat sesi cepat (beberapa hari)')),
    listBox));

  async function load() {
    try {
      const [s, a] = await Promise.all([api.listSessions(ev.id), api.listAttendances(ev.id)]);
      sessions = sortSessions(s);
      counts = new Map();
      for (const x of a) if (x.session_id) counts.set(x.session_id, (counts.get(x.session_id) || 0) + 1);
      render();
    } catch (e) { listBox.replaceChildren(h('p', { class: 'muted' }, errMsg(e))); }
  }

  function catBadges(list) {
    if (!list?.length) return [h('span', { class: 'badge' }, 'Semua peserta')];
    return list.map((n) => { const c = categoryColor(ev, n); return h('span', { class: 'badge', style: { background: c, color: contrastInk(c), borderColor: c } }, n); });
  }

  function render() {
    if (!sessions.length) {
      listBox.replaceChildren(h('div', { class: 'card empty' }, h('div', { class: 'big' }, '🗓'),
        h('p', null, 'Belum ada sesi. Acara ini memakai absensi sekali saja.'),
        h('p', { class: 'small' }, 'Tambahkan sesi jika peserta perlu absen lebih dari sekali.')));
      return;
    }
    let lastDay = '';
    const rows = [];
    for (const s of sessions) {
      const day = new Date(s.starts_at).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      if (day !== lastDay) { rows.push(h('div', { class: 'small muted', style: { fontWeight: 700, margin: '.9rem 0 .4rem' } }, day)); lastDay = day; }
      const st = sessionStatus(s);
      rows.push(h('div', { class: 'card', style: { padding: '.9rem 1rem', marginBottom: '.5rem' } },
        h('div', { class: 'row between' },
          h('div', { style: { flex: '1 1 260px', minWidth: 0 } },
            h('div', { class: 'row', style: { gap: '.5rem' } }, h('strong', { style: { fontSize: '1.05rem' } }, s.name), h('span', { class: 'badge ' + STATUS_CLASS[st] }, STATUS_LABEL[st])),
            h('div', { class: 'small muted', style: { marginTop: '.2rem' } }, fmtSessionRange(s),
              s.late_after ? ` · terlambat setelah ${timeOf(s.late_after).replace(':', '.')}` : ''),
            h('div', { class: 'row', style: { gap: '.3rem', marginTop: '.4rem' } }, ...catBadges(s.categories))),
          h('div', { class: 'row' },
            h('span', { class: 'small', style: { fontWeight: 700 } }, `${counts.get(s.id) || 0} hadir`),
            h('button', { class: 'btn sm ghost', title: 'Ubah', onclick: () => edit(s) }, '✏️'),
            h('button', { class: 'btn sm ghost', title: 'Hapus', onclick: () => remove(s) }, '🗑')))));
    }
    listBox.replaceChildren(...rows);
  }

  function catPicker(selected) {
    const sel = new Set(selected || []);
    const el = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '.35rem' } },
      cats.length ? cats.map((c) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: sel.has(c.name), onchange: (e) => { if (e.target.checked) sel.add(c.name); else sel.delete(c.name); } }),
        h('span', { class: 'dot', style: { background: c.color, marginTop: '.45rem' } }), h('span', null, c.name)))
        : h('span', { class: 'small muted' }, 'Belum ada kategori (atur di tab Pengaturan).'));
    return { el, get: () => [...sel] };
  }

  function edit(s = null) {
    const now = new Date();
    const name = h('input', { type: 'text', value: s?.name || '', placeholder: 'mis. Hari 1 – Pagi' });
    const date = h('input', { type: 'date', value: s ? dateOf(s.starts_at) : (ev.event_date || dateStr(now)) });
    const start = h('input', { type: 'time', value: s ? timeOf(s.starts_at) : '07:00' });
    const end = h('input', { type: 'time', value: s ? timeOf(s.ends_at) : '09:00' });
    const endDate = h('input', { type: 'date', value: s ? dateOf(s.ends_at) : '' });
    const late = h('input', { type: 'time', value: s?.late_after ? timeOf(s.late_after) : '' });
    const picker = catPicker(s?.categories);
    const L = (l, el, help) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, l), el, help ? h('div', { class: 'help' }, help) : null);
    modal({
      title: s ? 'Ubah sesi' : 'Tambah sesi', wide: true,
      body: h('div', { class: 'stack' },
        L('Nama sesi *', name),
        h('div', { class: 'grid grid-4' }, L('Tanggal', date), L('Mulai (absen dibuka)', start), L('Selesai (absen ditutup)', end), L('Terlambat setelah', late, 'Opsional')),
        L('Tanggal selesai (jika melewati tengah malam)', endDate, 'Kosongkan jika selesai di hari yang sama.'),
        h('div', null, h('span', { class: 'lbl', style: { fontWeight: 600, fontSize: '.9rem', display: 'block', marginBottom: '.3rem' } }, 'Peserta sesi ini'),
          picker.el, h('div', { class: 'help' }, 'Tidak dicentang sama sekali = semua peserta. Jika dicentang, hanya kategori itu yang bisa absen di sesi ini.'))),
      actions: [{ label: 'Batal' }, { label: 'Simpan', class: 'primary', onClick: async () => {
        if (!name.value.trim()) { toast('Nama sesi wajib diisi', 'err'); return false; }
        if (!date.value || !start.value || !end.value) { toast('Tanggal & jam wajib diisi', 'err'); return false; }
        const starts = toISO(date.value, start.value);
        const ends = toISO(endDate.value || date.value, end.value);
        if (new Date(ends) <= new Date(starts)) { toast('Jam selesai harus setelah jam mulai', 'err'); return false; }
        const lateISO = late.value ? toISO(date.value, late.value) : null;
        if (lateISO && (new Date(lateISO) < new Date(starts) || new Date(lateISO) > new Date(ends))) { toast('Jam terlambat harus di antara mulai dan selesai', 'err'); return false; }
        const overlap = sessions.find((x) => x.id !== s?.id && new Date(starts) < new Date(x.ends_at) && new Date(ends) > new Date(x.starts_at));
        if (overlap && !(await confirmDialog(`Waktu sesi ini bertabrakan dengan "${overlap.name}". Scanner otomatis akan memakai sesi yang mulai lebih dulu. Tetap simpan?`))) return false;
        await api.saveSession({ ...(s ? { id: s.id } : { event_id: ev.id }), name: name.value.trim(), starts_at: starts, ends_at: ends, late_after: lateISO, categories: picker.get() });
        toast('Sesi tersimpan', 'ok'); load();
      } }],
    });
  }

  async function remove(s) {
    const n = counts.get(s.id) || 0;
    if (!(await confirmDialog(`Hapus sesi "${s.name}"?${n ? ` ${n} data kehadiran di sesi ini ikut terhapus.` : ''}`, { danger: true, okLabel: 'Hapus' }))) return;
    try { await api.deleteSession(s.id); toast('Sesi dihapus', 'ok'); load(); } catch (e) { toast(errMsg(e), 'err'); }
  }

  function generator() {
    const startDate = h('input', { type: 'date', value: ev.event_date || dateStr(new Date()) });
    const days = h('input', { type: 'number', min: 1, max: 14, value: 2, style: { maxWidth: '100px' } });
    const slots = [
      { on: true, name: 'Pagi', start: '07:00', end: '09:00', late: '07:30' },
      { on: false, name: 'Siang', start: '12:00', end: '13:30', late: '' },
      { on: true, name: 'Sore', start: '15:30', end: '17:30', late: '' },
    ];
    const slotRows = h('div', { class: 'stack', style: { gap: '.4rem' } }, slots.map((sl) => h('div', { class: 'row', style: { gap: '.4rem' } },
      h('input', { type: 'checkbox', checked: sl.on, onchange: (e) => { sl.on = e.target.checked; } }),
      h('input', { type: 'text', value: sl.name, style: { flex: '1 1 110px' }, oninput: (e) => { sl.name = e.target.value; } }),
      h('input', { type: 'time', value: sl.start, style: { flex: '0 1 120px' }, oninput: (e) => { sl.start = e.target.value; } }),
      h('span', null, '–'),
      h('input', { type: 'time', value: sl.end, style: { flex: '0 1 120px' }, oninput: (e) => { sl.end = e.target.value; } }),
      h('span', { class: 'small muted' }, 'telat'),
      h('input', { type: 'time', value: sl.late, style: { flex: '0 1 120px' }, oninput: (e) => { sl.late = e.target.value; } }))));
    modal({
      title: 'Buat sesi cepat', wide: true,
      body: h('div', { class: 'stack' },
        h('div', { class: 'grid grid-2' },
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Mulai tanggal'), startDate),
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Jumlah hari'), days)),
        h('div', null, h('div', { class: 'small', style: { fontWeight: 600, marginBottom: '.35rem' } }, 'Sesi setiap hari (centang yang dipakai) — nama · mulai – selesai · terlambat setelah (opsional)'), slotRows),
        h('p', { class: 'small muted' }, 'Hasil: "Hari 1 – Pagi", "Hari 1 – Sore", "Hari 2 – Pagi", … Semua bisa diubah satu per satu setelah dibuat.')),
      actions: [{ label: 'Batal' }, { label: 'Buat sesi', class: 'primary', onClick: async () => {
        const n = Math.min(14, Math.max(1, Number(days.value) || 1));
        const used = slots.filter((x) => x.on && x.name.trim() && x.start && x.end);
        if (!used.length || !startDate.value) { toast('Pilih minimal satu sesi per hari', 'err'); return false; }
        if (used.some((x) => x.end <= x.start)) { toast('Jam selesai harus setelah jam mulai', 'err'); return false; }
        const rows = [];
        const base = new Date(startDate.value + 'T00:00');
        for (let d = 0; d < n; d++) {
          const day = new Date(base); day.setDate(base.getDate() + d);
          const ds = dateStr(day);
          for (const sl of used) rows.push({ event_id: ev.id, name: n > 1 ? `Hari ${d + 1} – ${sl.name.trim()}` : sl.name.trim(),
            starts_at: toISO(ds, sl.start), ends_at: toISO(ds, sl.end), late_after: sl.late ? toISO(ds, sl.late) : null, categories: [] });
        }
        await api.insertSessions(rows);
        toast(`${rows.length} sesi dibuat`, 'ok'); load();
      } }],
    });
  }

  const unsub = api.subscribeEvent(ev.id, { sessions: () => load() });
  load();
  return unsub;
}
