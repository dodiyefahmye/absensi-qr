// Tab "Kartu": desain kartu absen / e-ticket dengan pratinjau langsung.
import * as api from '../lib/api.js';
import { h, toast, errMsg, debounce, downloadBlob, modal, confirmDialog } from '../lib/ui.js';
import { renderTicket, ticketConfig, ticketFieldOptions, photoFieldOptions, ticketsToPDF, DEFAULT_TICKET } from '../lib/ticket.js';
import { safeFileName } from '../lib/qr.js';

export function ticketDesignerTab(body, { ev, save }) {
  let cfg = JSON.parse(JSON.stringify(ticketConfig(ev)));
  let people = [];
  let sample = null;
  let dirty = false;
  const opts = ticketFieldOptions(ev);
  const photoOpts = photoFieldOptions(ev);

  const canvas = h('canvas', { class: 'ticket-canvas', style: { maxWidth: '100%' } });
  const previewWrap = h('div', { class: 'ticket-preview' }, canvas);
  const sampleSel = h('select', { 'aria-label': 'Contoh peserta', style: { flex: '1 1 200px' } });
  const saveBtn = h('button', { class: 'btn primary', onclick: doSave }, 'Simpan kartu');

  const changed = () => { dirty = true; saveBtn.textContent = 'Simpan kartu •'; renderPreview(); };
  const set = (k, v) => { cfg[k] = v; changed(); };

  // ---------- kontrol ----------
  const L = (label, el, help) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), el, help ? h('div', { class: 'help' }, help) : null);
  const check = (key, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!cfg[key], onchange: (e) => set(key, e.target.checked) }), h('span', null, label));
  const select = (key, choices) => {
    const s = h('select', { onchange: () => set(key, s.value) }, choices.map(([v, l]) => h('option', { value: v }, l)));
    s.value = cfg[key];
    return s;
  };

  const layoutBox = h('div', { class: 'grid grid-2' });
  const renderLayout = () => layoutBox.replaceChildren(...[
    ['portrait', '📱 Potret', 'Cocok dibuka di HP & dikirim via WhatsApp'],
    ['landscape', '🪪 Lanskap', 'Cocok dicetak seperti kartu ID / name tag'],
  ].map(([k, t, d]) => h('button', { type: 'button', class: 'card flat', style: { textAlign: 'left', cursor: 'pointer', padding: '.7rem', borderWidth: '2px', borderColor: cfg.layout === k ? 'var(--primary)' : 'var(--border)', font: 'inherit', color: 'inherit' },
    onclick: () => { cfg.layout = k; renderLayout(); changed(); } }, h('strong', null, t), h('div', { class: 'small muted' }, d))));
  renderLayout();

  const fieldList = h('div', { class: 'stack', style: { gap: '.35rem' } });
  function renderFields() {
    const selected = cfg.fields.filter((k) => opts.some((o) => o.key === k));
    const ordered = [...selected.map((k) => opts.find((o) => o.key === k)), ...opts.filter((o) => !selected.includes(o.key))];
    fieldList.replaceChildren(...(ordered.length ? ordered.map((o) => {
      const on = selected.includes(o.key);
      const i = selected.indexOf(o.key);
      const move = (d) => { const arr = [...selected]; const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; cfg.fields = arr; renderFields(); changed(); };
      return h('div', { class: 'row', style: { gap: '.4rem', padding: '.35rem .5rem', border: '1px solid var(--border)', borderRadius: '10px', background: on ? 'color-mix(in srgb, var(--primary) 7%, transparent)' : 'transparent' } },
        h('label', { class: 'check', style: { flex: 1 } }, h('input', { type: 'checkbox', checked: on, onchange: (e) => {
          cfg.fields = e.target.checked ? [...selected, o.key] : selected.filter((k) => k !== o.key);
          renderFields(); changed();
        } }), h('span', null, o.label)),
        on ? h('button', { type: 'button', class: 'btn ghost icon sm', title: 'Naik', disabled: i === 0, onclick: () => move(-1) }, '↑') : null,
        on ? h('button', { type: 'button', class: 'btn ghost icon sm', title: 'Turun', disabled: i === selected.length - 1, onclick: () => move(1) }, '↓') : null);
    }) : [h('p', { class: 'small muted' }, 'Belum ada field data peserta. Tambahkan di tab Formulir.')]));
  }
  renderFields();

  const photoSel = h('select', { onchange: () => set('photo_field', photoSel.value) },
    h('option', { value: '' }, '— Tidak menampilkan foto —'), photoOpts.map((o) => h('option', { value: o.key }, o.label)));
  photoSel.value = cfg.photo_field || '';

  const labelIn = h('input', { type: 'text', value: cfg.label, placeholder: 'mis. KARTU WISUDAWAN', oninput: (e) => set('label', e.target.value) });
  const noteIn = h('textarea', { placeholder: 'mis. Harap hadir 30 menit sebelum acara • Kursi sesuai nomor urut', style: { minHeight: '64px' }, oninput: (e) => set('note', e.target.value) }, cfg.note || '');
  const footerIn = h('input', { type: 'text', value: cfg.footer, oninput: (e) => set('footer', e.target.value) });

  const controls = h('div', { class: 'card stack' },
    h('h3', null, 'Desain kartu'),
    L('Orientasi', layoutBox),
    L('Judul kecil di atas nama', labelIn),
    h('div', null, h('span', { class: 'lbl', style: { fontWeight: 600, fontSize: '.9rem', display: 'block', marginBottom: '.3rem' } }, 'Tampilkan'),
      h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '.35rem' } },
        check('show_logo', 'Logo'), check('show_banner', 'Banner'), check('show_category', 'Kategori'),
        check('show_date', 'Tanggal'), check('show_time', 'Jam'), check('show_location', 'Lokasi'))),
    h('div', null,
      h('div', { class: 'row between', style: { marginBottom: '.35rem' } },
        h('span', { style: { fontWeight: 600, fontSize: '.9rem' } }, 'Data peserta di kartu'),
        h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: !!cfg.show_field_labels, onchange: (e) => set('show_field_labels', e.target.checked) }), h('span', null, 'Tampilkan nama kolom'))),
      fieldList,
      h('div', { class: 'help' }, 'Centang data yang ingin dicetak, urutkan dengan ↑ ↓. Kolom diambil dari tab Formulir.')),
    L('Foto peserta', photoSel, photoOpts.length ? 'Foto diambil dari field Foto pada data peserta.' : 'Tambahkan field bertipe "Foto" di tab Formulir untuk menampilkan foto.'),
    h('div', { class: 'grid grid-2' },
      L('Ukuran nama', select('name_size', [['s', 'Kecil'], ['m', 'Sedang'], ['l', 'Besar']])),
      L('Ukuran QR', select('qr_size', [['s', 'Kecil'], ['m', 'Sedang'], ['l', 'Besar']]))),
    L('Gaya header', select('header_style', [['gradient', 'Gradasi'], ['solid', 'Warna polos']]), 'Warna mengikuti tab Tampilan.'),
    L('Teks tambahan', noteIn),
    L('Teks kaki', footerIn),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: async () => {
        if (!(await confirmDialog('Kembalikan desain kartu ke pengaturan bawaan?'))) return;
        cfg = JSON.parse(JSON.stringify(DEFAULT_TICKET)); body.replaceChildren(); dirty = false;
        const t = ticketDesignerTab(body, { ev: { ...ev, theme: { ...ev.theme, ticket: cfg } }, save });
        return t;
      } }, 'Reset'),
      saveBtn));

  const preview = h('div', { class: 'stack', style: { position: 'sticky', top: '76px' } },
    h('div', { class: 'row' }, h('span', { class: 'small muted', style: { fontWeight: 600 } }, 'Pratinjau dengan data:'), sampleSel),
    previewWrap,
    h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('button', { class: 'btn', onclick: () => canvas.toBlob((b) => downloadBlob(b, `kartu_${safeFileName(sample?.name || 'contoh')}.png`)) }, '⬇ Unduh PNG'),
      h('button', { class: 'btn', onclick: printAll }, '🖨 Cetak semua kartu (PDF A4)')));

  body.appendChild(h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' } }, controls, preview));

  // ---------- pratinjau ----------
  function dummy() {
    const data = {};
    for (const o of opts) if (o.field) data[o.key] = o.field.options?.[0] || 'Contoh ' + o.label;
    return { name: 'Nama Peserta Contoh', category: ev.categories?.[0]?.name || 'Peserta', qr_token: 'contoh-token-kartu', email: 'peserta@contoh.id', phone: '081234567890', data };
  }
  let seq = 0;
  const renderPreview = debounce(async () => {
    const my = ++seq;
    const off = document.createElement('canvas');
    try {
      await renderTicket(sample || dummy(), { ...ev, theme: { ...ev.theme, ticket: cfg } }, off);
      if (my !== seq) return;
      canvas.width = off.width; canvas.height = off.height;
      canvas.getContext('2d').drawImage(off, 0, 0);
      canvas.style.maxWidth = cfg.layout === 'landscape' ? '100%' : '380px';
    } catch (e) { toast(errMsg(e), 'err'); }
  }, 150);

  function fillSamples() {
    sampleSel.replaceChildren(h('option', { value: '' }, '(contoh)'), people.slice(0, 300).map((p, i) => h('option', { value: String(i) }, p.name)));
    sampleSel.value = sample ? String(people.indexOf(sample)) : '';
  }
  sampleSel.addEventListener('change', () => { sample = sampleSel.value === '' ? null : people[Number(sampleSel.value)]; renderPreview(); });

  api.listParticipants(ev.id).then((list) => {
    people = list;
    // pilih peserta yang datanya paling lengkap sebagai contoh
    sample = people.slice().sort((a, b) => Object.values(b.data || {}).filter(Boolean).length - Object.values(a.data || {}).filter(Boolean).length)[0] || null;
    fillSamples(); renderPreview();
  }).catch(() => { fillSamples(); renderPreview(); });

  async function doSave() {
    try {
      const fresh = await save({ theme: { ...ev.theme, ticket: cfg } }, 'Desain kartu tersimpan');
      ev = fresh; dirty = false; saveBtn.textContent = 'Simpan kartu';
    } catch (e) { /* toast sudah ditampilkan */ }
  }

  async function printAll() {
    if (!people.length) return toast('Belum ada peserta', 'warn');
    if (dirty) toast('Memakai desain yang sedang diedit (belum disimpan)', 'warn');
    const prog = h('div', null, 'Menyiapkan…');
    const m = modal({ title: 'Membuat PDF kartu', body: prog });
    try {
      await ticketsToPDF(people, { ...ev, theme: { ...ev.theme, ticket: cfg } }, `kartu_${safeFileName(ev.name)}.pdf`, (d, t) => { prog.textContent = `Membuat kartu ${d} dari ${t}…`; });
      m.close();
    } catch (e) { m.close(); toast(errMsg(e), 'err'); }
  }

  renderPreview();
  const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);
  return () => window.removeEventListener('beforeunload', warn);
}
