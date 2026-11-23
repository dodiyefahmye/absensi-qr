// Laporan kehadiran: statistik, grafik, tabel, ekspor Excel/CSV/PDF (realtime).
import * as api from '../lib/api.js';
import { h, toast, modal, errMsg, spinner, fmtTime, fmtDate, fmtDateTime, hhmm, confirmDialog, debounce } from '../lib/ui.js';
import { normalizeTheme, categoryColor, contrastInk } from '../lib/theme.js';
import { displayValue } from '../lib/form.js';
import { toExcel, toCSV, toPDF } from '../lib/exporter.js';
import { safeFileName } from '../lib/qr.js';

const SOURCE = { scan: 'Scan QR', form: 'Formulir', manual: 'Manual' };

export default async function report(root, { params }) {
  const wrap = h('div', { class: 'container' });
  root.appendChild(wrap);
  wrap.appendChild(spinner());

  let ev, role, people = [], atts = [];
  try {
    [ev, role] = await Promise.all([api.getEvent(params.id), api.myRole(params.id)]);
    [people, atts] = await Promise.all([api.listParticipants(ev.id), api.listAttendances(ev.id)]);
  } catch (e) {
    wrap.replaceChildren(h('div', { class: 'card empty' }, h('p', null, errMsg(e)), h('a', { class: 'btn', href: '#/' }, 'Kembali')));
    return;
  }
  const isAdmin = role === 'owner' || role === 'admin';
  const memberNames = new Map((await api.listMembers(ev.id).catch(() => [])).map((m) => [m.user_id, m.profile?.full_name || m.profile?.email]));
  const opName = (a) => a.scanner?.full_name || memberNames.get(a.scanned_by) || '';
  const theme = normalizeTheme(ev.theme);
  const fields = (ev.form_schema || []).filter((f) => f.key !== 'nama');
  const textFields = fields.filter((f) => !['signature', 'photo'].includes(f.type));
  const sigField = fields.find((f) => f.type === 'signature');
  const pmode = ev.mode === 'participant_qr' || people.length > 0;

  let view = 'hadir';
  const statsBox = h('div', { class: 'grid grid-4' });
  const chartsBox = h('div', { class: 'grid grid-2', style: { marginTop: '1rem' } });
  const tableBox = h('div');
  const q = h('input', { type: 'search', placeholder: 'Cari…', style: { maxWidth: '240px' } });
  const viewSel = h('div', { class: 'row' });

  wrap.replaceChildren(
    h('div', { class: 'row', style: { marginBottom: '.25rem' } }, h('a', { href: isAdmin ? `#/event/${ev.id}` : '#/', class: 'small no-print' }, '← Kembali')),
    h('div', { class: 'row between', style: { marginBottom: '1rem' } },
      h('div', null, h('h1', { style: { margin: 0 } }, 'Laporan: ' + ev.name),
        h('div', { class: 'muted small' }, [ev.event_date ? fmtDate(ev.event_date) : '', ev.location].filter(Boolean).join(' · '), ' ', h('span', { class: 'badge ok' }, '● Realtime'))),
      h('div', { class: 'row no-print' },
        h('button', { class: 'btn', onclick: exportExcel }, '⬇ Excel'),
        h('button', { class: 'btn', onclick: exportCSV }, '⬇ CSV'),
        h('button', { class: 'btn', onclick: exportPDF }, '⬇ PDF'),
        h('button', { class: 'btn', onclick: () => window.print() }, '🖨 Cetak'))),
    statsBox, chartsBox,
    h('div', { class: 'card', style: { marginTop: '1rem' } },
      h('div', { class: 'row between no-print', style: { marginBottom: '.75rem' } }, viewSel, q),
      tableBox));

  const attByP = () => new Map(atts.filter((a) => a.participant_id).map((a) => [a.participant_id, a]));

  function stat(num, lbl, color) {
    return h('div', { class: 'card stat' }, h('div', { class: 'num', style: color ? { color } : null }, num), h('div', { class: 'lbl' }, lbl));
  }

  function bars(title, entries) {
    const max = Math.max(1, ...entries.map((e) => e[1]));
    return h('div', { class: 'card' }, h('h3', null, title),
      entries.length ? h('div', { class: 'bars', style: { marginTop: '.75rem' } }, entries.map(([k, v, col]) =>
        h('div', { class: 'bar-row' }, h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: k }, k),
          h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${(v / max) * 100}%`, background: col || 'var(--primary)' } })),
          h('b', null, v)))) : h('p', { class: 'muted small' }, 'Belum ada data'));
  }

  function timeline() {
    if (!atts.length) return h('div', { class: 'card' }, h('h3', null, 'Waktu kedatangan'), h('p', { class: 'muted small' }, 'Belum ada data'));
    const times = atts.map((a) => new Date(a.checked_in_at).getTime());
    const min = Math.min(...times), max = Math.max(...times);
    const span = (max - min) / 60000;
    const step = span <= 90 ? 10 : span <= 240 ? 15 : span <= 600 ? 30 : 60;
    const start = Math.floor(min / (step * 60000)) * step * 60000;
    const n = Math.min(48, Math.floor((max - start) / (step * 60000)) + 1);
    const buckets = new Array(n).fill(0);
    for (const t of times) buckets[Math.min(n - 1, Math.floor((t - start) / (step * 60000)))]++;
    const peak = Math.max(...buckets);
    return h('div', { class: 'card', style: { gridColumn: '1 / -1' } },
      h('div', { class: 'row between' }, h('h3', null, 'Waktu kedatangan'), h('span', { class: 'small muted' }, `per ${step} menit · puncak ${peak} orang`)),
      h('div', { class: 'vbars' }, buckets.map((v, i) => {
        const t = new Date(start + i * step * 60000);
        return h('div', { class: 'vb', title: `${t.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}: ${v}` },
          v ? h('b', null, v) : null,
          h('div', { class: 'col', style: { height: `${(v / peak) * 100}%`, background: theme.primary } }),
          h('small', null, i % Math.ceil(n / 12) === 0 ? t.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''));
      })));
  }

  function countBy(fn) {
    const m = new Map();
    for (const a of atts) { const k = fn(a) || '(tidak ada)'; m.set(k, (m.get(k) || 0) + 1); }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }

  function renderStats() {
    const hadir = atts.length;
    if (pmode && people.length) {
      const inv = people.length;
      const fromList = attByP().size;
      statsBox.replaceChildren(
        stat(inv, 'Total undangan'),
        stat(fromList, 'Sudah hadir', 'var(--ok)'),
        stat(inv - fromList, 'Belum hadir', 'var(--err)'),
        stat(inv ? Math.round((fromList / inv) * 100) + '%' : '0%', 'Persentase kehadiran', theme.primary));
    } else {
      statsBox.replaceChildren(
        stat(hadir, 'Total hadir', 'var(--ok)'),
        stat(atts.filter((a) => a.source === 'form').length, 'Lewat formulir'),
        stat(atts.filter((a) => a.source !== 'form').length, 'Lewat scan/manual'),
        stat(atts[0] ? hhmm(new Date(atts[atts.length - 1].checked_in_at).toTimeString()) + '–' + hhmm(new Date(atts[0].checked_in_at).toTimeString()) : '—', 'Rentang waktu'));
    }
    const catEntries = countBy((a) => a.category).map(([k, v]) => [k, v, categoryColor(ev, k)]);
    // kategori: tampilkan hadir/total jika ada daftar peserta
    let catCard;
    if (pmode && people.length) {
      const totalBy = new Map();
      for (const p of people) totalBy.set(p.category || '(tidak ada)', (totalBy.get(p.category || '(tidak ada)') || 0) + 1);
      const ap = attByP();
      const hadirBy = new Map();
      for (const p of people) if (ap.has(p.id)) hadirBy.set(p.category || '(tidak ada)', (hadirBy.get(p.category || '(tidak ada)') || 0) + 1);
      catCard = h('div', { class: 'card' }, h('h3', null, 'Per kategori (hadir / undangan)'),
        h('div', { class: 'bars', style: { marginTop: '.75rem' } }, Array.from(totalBy.entries()).sort((a, b) => b[1] - a[1]).map(([k, tot]) => {
          const v = hadirBy.get(k) || 0;
          return h('div', { class: 'bar-row', style: { gridTemplateColumns: '110px 1fr 70px' } }, h('span', null, k),
            h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${(v / tot) * 100}%`, background: categoryColor(ev, k) } })),
            h('b', null, `${v}/${tot}`));
        })));
    } else catCard = bars('Per kategori', catEntries);
    chartsBox.replaceChildren(timeline(), catCard,
      bars('Per perangkat / meja', countBy((a) => a.device_label || SOURCE[a.source])),
      bars('Per operator', countBy((a) => opName(a) || (a.source === 'form' ? 'Mandiri (formulir)' : ''))));
  }

  function rowsHadir() {
    const s = q.value.trim().toLowerCase();
    return atts.filter((a) => !s || (a.name + ' ' + (a.category || '') + ' ' + JSON.stringify(a.data || {})).toLowerCase().includes(s))
      .slice().sort((a, b) => new Date(a.checked_in_at) - new Date(b.checked_in_at));
  }
  function rowsBelum() {
    const s = q.value.trim().toLowerCase();
    const ap = attByP();
    return people.filter((p) => !ap.has(p.id) && (!s || (p.name + ' ' + (p.category || '')).toLowerCase().includes(s)));
  }

  function renderViewSel() {
    viewSel.replaceChildren(
      h('button', { class: 'btn sm ' + (view === 'hadir' ? 'primary' : ''), onclick: () => { view = 'hadir'; renderViewSel(); renderTable(); } }, `Hadir (${atts.length})`),
      pmode && people.length ? h('button', { class: 'btn sm ' + (view === 'belum' ? 'primary' : ''), onclick: () => { view = 'belum'; renderViewSel(); renderTable(); } }, `Belum hadir (${rowsBelum().length})`) : null);
  }

  function renderTable() {
    if (view === 'belum') {
      const list = rowsBelum();
      tableBox.replaceChildren(list.length ? h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'No'), h('th', null, 'Nama'), h('th', null, 'Kategori'), ...textFields.slice(0, 3).map((f) => h('th', { class: 'hide-sm' }, f.label)), isAdmin ? h('th', { class: 'no-print' }, '') : null)),
        h('tbody', null, list.map((p, i) => h('tr', null, h('td', null, i + 1), h('td', null, h('strong', null, p.name)), h('td', null, catBadge(p.category)),
          ...textFields.slice(0, 3).map((f) => h('td', { class: 'small hide-sm' }, displayValue(f, p.data?.[f.key]))),
          isAdmin ? h('td', { class: 'actions no-print' }, h('button', { class: 'btn sm', onclick: async (e) => {
            e.target.disabled = true;
            try {
              const r = await api.checkIn({ eventId: ev.id, participantId: p.id, deviceLabel: 'Laporan' });
              if (r.status === 'ok') { upsertAtt({ ...r.attendance }); toast(`${p.name} ditandai hadir`, 'ok'); }
              else toast(r.status === 'closed' ? 'Absensi sedang ditutup' : 'Gagal: ' + r.status, 'err');
            } catch (er) { toast(errMsg(er), 'err'); e.target.disabled = false; }
          } }, '✓ Tandai hadir')) : null))))) : h('div', { class: 'empty' }, '🎉 Semua undangan sudah hadir'));
      return;
    }
    const list = rowsHadir();
    if (!list.length) { tableBox.replaceChildren(h('div', { class: 'empty' }, 'Belum ada yang hadir')); return; }
    const shownFields = textFields.slice(0, 4);
    tableBox.replaceChildren(h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'No'), h('th', null, 'Nama'), h('th', null, 'Kategori'), h('th', null, 'Waktu'),
        ...shownFields.map((f) => h('th', { class: 'hide-sm' }, f.label)), sigField ? h('th', null, 'TTD') : null,
        h('th', { class: 'hide-sm' }, 'Perangkat / operator'), h('th', { class: 'no-print' }, ''))),
      h('tbody', null, list.map((a, i) => h('tr', null,
        h('td', null, i + 1),
        h('td', null, h('strong', null, a.name || '—')),
        h('td', null, catBadge(a.category)),
        h('td', { class: 'small' }, fmtTime(a.checked_in_at)),
        ...shownFields.map((f) => h('td', { class: 'small hide-sm' }, displayValue(f, a.data?.[f.key]))),
        sigField ? h('td', null, a.data?.[sigField.key] ? h('img', { src: a.data[sigField.key], alt: 'TTD', style: { height: '36px', background: '#fff', borderRadius: '4px' } }) : '') : null,
        h('td', { class: 'small muted hide-sm' }, [a.device_label, opName(a), SOURCE[a.source]].filter(Boolean).join(' · ')),
        h('td', { class: 'actions no-print' },
          h('button', { class: 'btn sm ghost', title: 'Detail', onclick: () => detail(a) }, '👁'),
          isAdmin ? h('button', { class: 'btn sm ghost', title: 'Batalkan kehadiran', onclick: async () => {
            if (!(await confirmDialog(`Batalkan kehadiran ${a.name}?`, { danger: true, okLabel: 'Batalkan' }))) return;
            try { await api.deleteAttendance(a.id); atts = atts.filter((x) => x.id !== a.id); refresh(); } catch (e) { toast(errMsg(e), 'err'); }
          } }, '✕') : null)))))));
  }

  function catBadge(c) {
    if (!c) return '';
    const col = categoryColor(ev, c);
    return h('span', { class: 'badge', style: { background: col, color: contrastInk(col), borderColor: col } }, c);
  }

  function detail(a) {
    modal({
      title: a.name || 'Detail kehadiran',
      body: h('div', { class: 'stack' },
        h('div', null, h('b', null, 'Waktu: '), fmtDateTime(a.checked_in_at)),
        h('div', null, h('b', null, 'Sumber: '), SOURCE[a.source] || a.source, a.device_label ? ' · ' + a.device_label : '', opName(a) ? ' · oleh ' + opName(a) : ''),
        a.category ? h('div', null, h('b', null, 'Kategori: '), a.category) : null,
        ...fields.map((f) => {
          const v = a.data?.[f.key];
          if (v === undefined || v === '' || v === null) return null;
          if ((f.type === 'signature' || f.type === 'photo') && String(v).startsWith('data:')) return h('div', null, h('b', null, f.label + ':'), h('br'), h('img', { src: v, style: { maxHeight: '160px', background: '#fff', borderRadius: '8px', border: '1px solid var(--border)' } }));
          return h('div', null, h('b', null, f.label + ': '), displayValue(f, v));
        })),
      actions: [{ label: 'Tutup' }],
    });
  }

  // ---------- ekspor ----------
  const base = () => `absensi_${safeFileName(ev.name)}_${new Date().toISOString().slice(0, 10)}`;
  function hadirRows() {
    return rowsHadir().map((a, i) => ({
      No: i + 1, Nama: a.name || '', Kategori: a.category || '',
      Tanggal: new Date(a.checked_in_at).toLocaleDateString('id-ID'), Jam: fmtTime(a.checked_in_at),
      ...Object.fromEntries(textFields.map((f) => [f.label, displayValue(f, a.data?.[f.key])])),
      Perangkat: a.device_label || '', Operator: opName(a) || '', Sumber: SOURCE[a.source] || a.source,
    }));
  }
  function belumRows() {
    return rowsBelum().map((p, i) => ({ No: i + 1, Nama: p.name, Kategori: p.category || '', Email: p.email || '', 'No HP': p.phone || '',
      ...Object.fromEntries(textFields.map((f) => [f.label, displayValue(f, p.data?.[f.key])])) }));
  }
  async function exportExcel() {
    const ap = attByP();
    const summary = [
      { Keterangan: 'Nama acara', Nilai: ev.name },
      { Keterangan: 'Tanggal', Nilai: ev.event_date ? fmtDate(ev.event_date) : '' },
      { Keterangan: 'Lokasi', Nilai: ev.location || '' },
      { Keterangan: 'Total hadir', Nilai: atts.length },
      ...(people.length ? [{ Keterangan: 'Total undangan', Nilai: people.length }, { Keterangan: 'Belum hadir', Nilai: people.length - ap.size },
        { Keterangan: 'Persentase', Nilai: Math.round((ap.size / people.length) * 100) + '%' }] : []),
      ...countBy((a) => a.category).map(([k, v]) => ({ Keterangan: 'Kategori: ' + k, Nilai: v })),
      { Keterangan: 'Diekspor', Nilai: new Date().toLocaleString('id-ID') },
    ];
    const sheets = [{ name: 'Hadir', rows: hadirRows() }];
    if (people.length) sheets.push({ name: 'Belum Hadir', rows: belumRows() });
    sheets.push({ name: 'Ringkasan', rows: summary });
    try { await toExcel(sheets, base() + '.xlsx'); } catch (e) { toast(errMsg(e), 'err'); }
  }
  function exportCSV() { toCSV(view === 'belum' ? belumRows() : hadirRows(), base() + (view === 'belum' ? '_belum' : '') + '.csv'); }
  async function exportPDF() {
    const isBelum = view === 'belum';
    const pdfFields = textFields.slice(0, isBelum ? 3 : 3);
    const head = isBelum
      ? ['No', 'Nama', 'Kategori', ...pdfFields.map((f) => f.label)]
      : ['No', 'Nama', 'Kategori', 'Jam', ...pdfFields.map((f) => f.label), ...(sigField ? ['Tanda Tangan'] : [])];
    const list = isBelum ? rowsBelum() : rowsHadir();
    const body = list.map((x, i) => isBelum
      ? [i + 1, x.name, x.category || '', ...pdfFields.map((f) => displayValue(f, x.data?.[f.key]))]
      : [i + 1, x.name || '', x.category || '', fmtTime(x.checked_in_at).slice(0, 5), ...pdfFields.map((f) => displayValue(f, x.data?.[f.key])), ...(sigField ? [''] : [])]);
    const ap = attByP();
    try {
      await toPDF({
        title: (isBelum ? 'Daftar Belum Hadir — ' : 'Daftar Hadir — ') + ev.name,
        lines: [
          [ev.event_date ? fmtDate(ev.event_date) : '', ev.start_time ? hhmm(ev.start_time) + (ev.end_time ? '–' + hhmm(ev.end_time) : '') : ''].filter(Boolean).join(', '),
          [ev.location, ev.organizer].filter(Boolean).join(' · '),
          people.length ? `Hadir ${ap.size} dari ${people.length} undangan (${Math.round((ap.size / people.length) * 100)}%)` : `Total hadir: ${atts.length}`,
        ],
        logoUrl: theme.logo_url, color: theme.primary, head, body,
        landscape: head.length > 7,
        imageCol: !isBelum && sigField ? head.length - 1 : -1,
        images: !isBelum && sigField ? list.map((a) => a.data?.[sigField.key]) : [],
        filename: base() + (isBelum ? '_belum' : '') + '.pdf',
      });
    } catch (e) { toast(errMsg(e), 'err'); }
  }

  // ---------- realtime ----------
  function upsertAtt(row) {
    const i = atts.findIndex((x) => x.id === row.id);
    if (i >= 0) atts[i] = { ...atts[i], ...row }; else atts.unshift(row);
    refresh();
  }
  const refresh = debounce(() => { renderStats(); renderViewSel(); renderTable(); }, 200);
  const unsub = api.subscribeEvent(ev.id, {
    attendance: (type, row, old) => {
      if (type === 'DELETE') { atts = atts.filter((x) => x.id !== old?.id); refresh(); }
      else if (row) upsertAtt(row);
    },
    participant: (type, row, old) => {
      if (type === 'DELETE') people = people.filter((p) => p.id !== old?.id);
      else if (row) { const i = people.findIndex((p) => p.id === row.id); if (i >= 0) people[i] = row; else people.push(row); }
      refresh();
    },
  });

  q.addEventListener('input', debounce(renderTable, 150));
  renderStats(); renderViewSel(); renderTable();
  return unsub;
}
