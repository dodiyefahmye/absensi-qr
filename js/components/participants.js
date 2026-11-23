// Tab manajemen peserta: CRUD, import Excel/CSV, e-ticket & QR massal.
import * as api from '../lib/api.js';
import { h, toast, modal, errMsg, spinner, confirmDialog, copyText, debounce, fmtTime, downloadBlob } from '../lib/ui.js';
import { renderForm, displayValue } from '../lib/form.js';
import { renderTicket, ticketUrl, safeFileName } from '../lib/qr.js';
import { categoryColor, contrastInk } from '../lib/theme.js';
import { toExcel, readSpreadsheet } from '../lib/exporter.js';
import { loadJSZip } from '../lib/vendor.js';

export function participantsTab(body, { ev }) {
  let people = [], attended = new Map(), shown = 200;
  const q = h('input', { type: 'search', placeholder: 'Cari nama / data…', style: { maxWidth: '260px' } });
  const cat = h('select', { style: { maxWidth: '180px' } }, h('option', { value: '' }, 'Semua kategori'), (ev.categories || []).map((c) => h('option', { value: c.name }, c.name)));
  const status = h('select', { style: { maxWidth: '160px' } }, h('option', { value: '' }, 'Semua status'), h('option', { value: 'hadir' }, 'Sudah hadir'), h('option', { value: 'belum' }, 'Belum hadir'));
  const summary = h('span', { class: 'small muted' });
  const tableBox = h('div', null, spinner());
  const extraFields = (ev.form_schema || []).filter((f) => f.key !== 'nama' && !['signature', 'photo'].includes(f.type));

  const note = ev.mode === 'event_qr'
    ? h('div', { class: 'card flat small', style: { marginBottom: '1rem', background: 'var(--surface-2)' } },
      'ℹ️ Acara ini memakai mode QR Acara: peserta tidak perlu didaftarkan, mereka mengisi formulir sendiri. Daftar peserta di sini opsional (mis. untuk undangan khusus yang dipindai panitia).')
    : null;

  body.append(note || '',
    h('div', { class: 'row between', style: { marginBottom: '1rem' } },
      h('div', { class: 'row' }, q, cat, status),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => edit() }, '＋ Tambah'),
        h('button', { class: 'btn', onclick: importDialog }, '⬆ Import Excel/CSV'),
        h('button', { class: 'btn', onclick: bulkTickets }, '⬇ Semua e-ticket (ZIP)'),
        h('button', { class: 'btn ghost', onclick: moreMenu }, '⋯'))),
    summary, h('div', { style: { height: '.5rem' } }), tableBox);

  async function load() {
    try {
      const [p, a] = await Promise.all([api.listParticipants(ev.id), api.listAttendances(ev.id)]);
      people = p;
      attended = new Map(a.filter((x) => x.participant_id).map((x) => [x.participant_id, x]));
      render();
    } catch (e) { tableBox.replaceChildren(h('p', { class: 'muted' }, errMsg(e))); }
  }

  function filtered() {
    const s = q.value.trim().toLowerCase();
    return people.filter((p) => {
      if (cat.value && p.category !== cat.value) return false;
      if (status.value === 'hadir' && !attended.has(p.id)) return false;
      if (status.value === 'belum' && attended.has(p.id)) return false;
      if (!s) return true;
      return (p.name + ' ' + (p.email || '') + ' ' + (p.phone || '') + ' ' + Object.values(p.data || {}).join(' ')).toLowerCase().includes(s);
    });
  }

  function render() {
    const list = filtered();
    summary.textContent = `${people.length} peserta · ${attended.size} sudah hadir · menampilkan ${Math.min(list.length, shown)} dari ${list.length}`;
    if (!people.length) {
      tableBox.replaceChildren(h('div', { class: 'card empty' }, h('div', { class: 'big' }, '👥'), h('p', null, 'Belum ada peserta. Tambahkan manual atau import dari Excel.')));
      return;
    }
    const rows = list.slice(0, shown).map((p) => {
      const a = attended.get(p.id);
      const col = categoryColor(ev, p.category);
      return h('tr', null,
        h('td', null, h('strong', null, p.name), p.email || p.phone ? h('div', { class: 'small muted' }, [p.email, p.phone].filter(Boolean).join(' · ')) : null),
        h('td', null, p.category ? h('span', { class: 'badge', style: { background: col, color: contrastInk(col), borderColor: col } }, p.category) : ''),
        ...extraFields.slice(0, 2).map((f) => h('td', { class: 'small hide-sm' }, displayValue(f, p.data?.[f.key]))),
        h('td', null, a ? h('span', { class: 'badge ok' }, '✓ ' + fmtTime(a.checked_in_at)) : h('span', { class: 'badge' }, 'Belum')),
        h('td', { class: 'actions' },
          h('button', { class: 'btn sm', title: 'E-ticket & QR', onclick: () => ticketDialog(p) }, '🎫'),
          h('button', { class: 'btn sm ghost', title: 'Ubah', onclick: () => edit(p) }, '✏️'),
          h('button', { class: 'btn sm ghost', title: 'Hapus', onclick: () => remove(p) }, '🗑')));
    });
    tableBox.replaceChildren(
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Nama'), h('th', null, 'Kategori'), ...extraFields.slice(0, 2).map((f) => h('th', { class: 'hide-sm' }, f.label)), h('th', null, 'Status'), h('th', null, ''))),
        h('tbody', null, rows))),
      list.length > shown ? h('div', { class: 'center', style: { marginTop: '.75rem' } }, h('button', { class: 'btn', onclick: () => { shown += 300; render(); } }, 'Tampilkan lebih banyak')) : '');
  }

  const rerender = debounce(() => { shown = 200; render(); }, 150);
  q.addEventListener('input', rerender); cat.addEventListener('change', rerender); status.addEventListener('change', rerender);

  function edit(p = null) {
    const values = { nama: p?.name || '', ...(p?.data || {}) };
    const form = renderForm(ev.form_schema, values);
    const catSel = h('select', null, h('option', { value: '' }, '— Tanpa kategori —'), (ev.categories || []).map((c) => h('option', { value: c.name }, c.name)));
    catSel.value = p?.category || (ev.categories?.[0]?.name ?? '');
    const email = h('input', { type: 'email', value: p?.email || '' });
    const phone = h('input', { type: 'tel', value: p?.phone || '' });
    const hasEmailField = ev.form_schema.some((f) => f.type === 'email');
    const hasPhoneField = ev.form_schema.some((f) => f.type === 'tel');
    modal({
      title: p ? 'Ubah peserta' : 'Tambah peserta', wide: true,
      body: h('div', { class: 'stack' }, form.el,
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Kategori'), catSel),
        !hasEmailField || !hasPhoneField ? h('div', { class: 'grid grid-2' },
          !hasEmailField ? h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Email (opsional)'), email) : null,
          !hasPhoneField ? h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'No. HP (opsional)'), phone) : null) : null),
      actions: [{ label: 'Batal' }, { label: 'Simpan', class: 'primary', onClick: async () => {
        if (!form.validate()) return false;
        const v = form.getValues();
        const { nama, ...data } = v;
        const emailVal = hasEmailField ? (ev.form_schema.filter((f) => f.type === 'email').map((f) => v[f.key]).find(Boolean) || null) : email.value.trim() || null;
        const phoneVal = hasPhoneField ? (ev.form_schema.filter((f) => f.type === 'tel').map((f) => v[f.key]).find(Boolean) || null) : phone.value.trim() || null;
        const row = await api.saveParticipant({ ...(p ? { id: p.id } : { event_id: ev.id }), name: nama, category: catSel.value || null, email: emailVal, phone: phoneVal, data });
        const i = people.findIndex((x) => x.id === row.id);
        if (i >= 0) people[i] = row; else people.unshift(row);
        render();
        toast('Peserta tersimpan', 'ok');
      } }],
    });
  }

  async function remove(p) {
    if (!(await confirmDialog(`Hapus peserta "${p.name}"? Data kehadirannya juga ikut terhapus.`, { danger: true, okLabel: 'Hapus' }))) return;
    try { await api.deleteParticipant(p.id); people = people.filter((x) => x.id !== p.id); attended.delete(p.id); render(); } catch (e) { toast(errMsg(e), 'err'); }
  }

  async function ticketDialog(p) {
    const canvas = h('canvas', { class: 'ticket-canvas' });
    const url = ticketUrl(p.qr_token);
    const msg = `Halo ${p.name}, berikut e-ticket Anda untuk "${ev.name}". Tunjukkan QR ini saat registrasi: ${url}`;
    const phone = (p.phone || '').replace(/\D/g, '').replace(/^0/, '62');
    modal({
      title: 'E-ticket ' + p.name,
      body: h('div', { class: 'stack' }, canvas,
        h('div', { class: 'row', style: { justifyContent: 'center' } },
          h('button', { class: 'btn primary', onclick: () => canvas.toBlob((b) => downloadBlob(b, `tiket_${safeFileName(p.name)}.png`)) }, '⬇ Unduh PNG'),
          h('button', { class: 'btn', onclick: () => copyText(url) }, '🔗 Salin link'),
          h('a', { class: 'btn', target: '_blank', rel: 'noopener', href: `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` }, '💬 WhatsApp'),
          p.email ? h('a', { class: 'btn', href: `mailto:${p.email}?subject=${encodeURIComponent('E-ticket ' + ev.name)}&body=${encodeURIComponent(msg)}` }, '✉️ Email') : null)),
    });
    try { await renderTicket(p, ev, canvas); } catch (e) { toast(errMsg(e), 'err'); }
  }

  async function bulkTickets() {
    const list = filtered();
    if (!list.length) return toast('Tidak ada peserta', 'warn');
    const prog = h('div', null, 'Menyiapkan…');
    const m = modal({ title: 'Membuat e-ticket', body: prog });
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      const canvas = document.createElement('canvas');
      const used = new Set();
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        await renderTicket(p, ev, canvas);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        let name = `${String(i + 1).padStart(3, '0')}_${safeFileName(p.name)}.png`;
        while (used.has(name)) name = name.replace('.png', '_1.png');
        used.add(name);
        zip.file(name, blob);
        prog.textContent = `Membuat tiket ${i + 1} dari ${list.length}…`;
      }
      prog.textContent = 'Mengompres ZIP…';
      const out = await zip.generateAsync({ type: 'blob' });
      downloadBlob(out, `e-ticket_${safeFileName(ev.name)}.zip`);
      m.close();
    } catch (e) { m.close(); toast(errMsg(e), 'err'); }
  }

  function templateColumns() {
    return ['Nama', 'Kategori', 'Email', 'No HP', ...extraFields.filter((f) => !['email', 'tel'].includes(f.type)).map((f) => f.label)];
  }

  async function downloadTemplate() {
    const cols = templateColumns();
    const sample = Object.fromEntries(cols.map((c) => [c, '']));
    sample.Nama = 'Contoh Nama Peserta'; sample.Kategori = ev.categories?.[0]?.name || '';
    try { await toExcel([{ name: 'Peserta', rows: [sample] }], `template_peserta_${safeFileName(ev.name)}.xlsx`); } catch (e) { toast(errMsg(e), 'err'); }
  }

  function importDialog() {
    const input = h('input', { type: 'file', accept: '.xlsx,.xls,.csv' });
    const info = h('div', { class: 'small muted' });
    let rows = [];
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      info.textContent = 'Membaca file…';
      try {
        rows = mapRows(await readSpreadsheet(f));
        info.replaceChildren(h('strong', null, `${rows.length} baris valid ditemukan.`), h('br'),
          ...rows.slice(0, 5).map((r) => h('div', null, '• ' + r.name + (r.category ? ` (${r.category})` : ''))), rows.length > 5 ? h('div', null, '…') : '');
      } catch (e) { info.textContent = errMsg(e); rows = []; }
    });
    modal({
      title: 'Import peserta', wide: true,
      body: h('div', { class: 'stack' },
        h('p', null, 'Gunakan file Excel (.xlsx) atau CSV dengan baris pertama berisi judul kolom. Kolom wajib: ', h('b', null, 'Nama'), '. Kolom lain dicocokkan otomatis dengan label/kunci field formulir.'),
        h('p', { class: 'small muted' }, 'Kolom yang dikenali: ' + templateColumns().join(', ')),
        h('button', { class: 'btn sm', onclick: downloadTemplate }, '⬇ Unduh template Excel'),
        input, info),
      actions: [{ label: 'Batal' }, { label: 'Import', class: 'primary', onClick: async ({ button }) => {
        if (!rows.length) { toast('Pilih file terlebih dahulu', 'err'); return false; }
        const inserted = await api.insertParticipants(rows, (d, t) => { button.textContent = `Mengimpor ${d}/${t}…`; });
        people = people.concat(inserted).sort((a, b) => a.name.localeCompare(b.name));
        render();
        toast(`${inserted.length} peserta diimpor`, 'ok');
      } }],
    });
  }

  function mapRows(raw) {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const fieldMap = new Map();
    for (const f of extraFields) { fieldMap.set(norm(f.label), f); fieldMap.set(norm(f.key), f); }
    const NAME = ['nama', 'name', 'namalengkap', 'fullname'];
    const CAT = ['kategori', 'category', 'jenis', 'tipe'];
    const EMAIL = ['email', 'surel', 'emailaddress'];
    const PHONE = ['nohp', 'hp', 'phone', 'telepon', 'notelp', 'whatsapp', 'wa', 'nowa', 'nomorhp'];
    const out = [];
    for (const r of raw) {
      const row = { event_id: ev.id, name: '', category: null, email: null, phone: null, data: {} };
      for (const [k, v] of Object.entries(r)) {
        const nk = norm(k), val = String(v ?? '').trim();
        if (!val) continue;
        if (NAME.includes(nk)) row.name = val;
        else if (CAT.includes(nk)) row.category = val;
        else if (fieldMap.has(nk)) {
          const f = fieldMap.get(nk);
          row.data[f.key] = f.type === 'checkbox' ? val.split(/,\s*/) : val;
          if (f.type === 'email') row.email = val;
          if (f.type === 'tel') row.phone = val;
        } else if (EMAIL.includes(nk)) row.email = val;
        else if (PHONE.includes(nk)) row.phone = val;
        else row.data[k] = val;
      }
      for (const f of extraFields) {
        if (f.type === 'email' && row.email && !row.data[f.key]) row.data[f.key] = row.email;
        if (f.type === 'tel' && row.phone && !row.data[f.key]) row.data[f.key] = row.phone;
      }
      if (row.name) out.push(row);
    }
    return out;
  }

  function moreMenu() {
    modal({
      title: 'Tindakan lain',
      body: h('div', { class: 'stack' },
        h('button', { class: 'btn block', onclick: downloadTemplate }, '⬇ Unduh template Excel'),
        h('button', { class: 'btn block', onclick: async () => {
          const rows = people.map((p) => ({ Nama: p.name, Kategori: p.category || '', Email: p.email || '', 'No HP': p.phone || '',
            ...Object.fromEntries(extraFields.map((f) => [f.label, displayValue(f, p.data?.[f.key])])), 'Link e-ticket': ticketUrl(p.qr_token) }));
          try { await toExcel([{ name: 'Peserta', rows }], `peserta_${safeFileName(ev.name)}.xlsx`); } catch (e) { toast(errMsg(e), 'err'); }
        } }, '⬇ Ekspor peserta + link e-ticket (Excel)'),
        h('button', { class: 'btn block', onclick: async () => {
          if (!(await confirmDialog('Buat ulang QR semua peserta? QR/e-ticket lama tidak berlaku lagi dan harus dibagikan ulang.', { danger: true }))) return;
          try { await api.regenerateTokens(ev.id); toast('QR baru dibuat', 'ok'); load(); } catch (e) { toast(errMsg(e), 'err'); }
        } }, '↻ Buat ulang semua QR'),
        h('button', { class: 'btn block danger', onclick: async () => {
          if (!(await confirmDialog(`Hapus SEMUA ${people.length} peserta beserta data kehadirannya?`, { danger: true, okLabel: 'Hapus semua' }))) return;
          try { await api.deleteAllParticipants(ev.id); people = []; attended.clear(); render(); toast('Semua peserta dihapus', 'ok'); } catch (e) { toast(errMsg(e), 'err'); }
        } }, '🗑 Hapus semua peserta')),
      actions: [{ label: 'Tutup' }],
    });
  }

  const unsub = api.subscribeEvent(ev.id, {
    attendance: (type, row, old) => {
      if (type === 'DELETE') { for (const [k, v] of attended) if (v.id === old?.id) attended.delete(k); }
      else if (row?.participant_id) attended.set(row.participant_id, row);
      render();
    },
  });

  load();
  return unsub;
}
