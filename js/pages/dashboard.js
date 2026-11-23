import * as api from '../lib/api.js';
import { h, toast, modal, errMsg, navigate, fmtDate, hhmm, spinner, confirmDialog } from '../lib/ui.js';
import { BUILTIN_TEMPLATES, normalizeTheme, contrastInk } from '../lib/theme.js';

const ROLE_LABEL = { owner: 'Pemilik', admin: 'Admin', scanner: 'Operator' };
import { MODE_LABEL, usesParticipantScan } from '../lib/rules.js';

export default async function dashboard(root) {
  const wrap = h('div', { class: 'container' });
  root.appendChild(wrap);

  const header = h('div', { class: 'row between', style: { marginBottom: '1rem' } },
    h('div', null, h('h1', null, 'Acara Saya'), h('p', { class: 'muted', style: { margin: 0 } }, 'Kelola acara, peserta, dan absensi QR.')),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: joinDialog }, '🔑 Gabung dengan kode'),
      h('button', { class: 'btn primary', onclick: () => createDialog() }, '＋ Buat acara')));
  const list = h('div', null, spinner());
  wrap.append(header, list);

  async function load() {
    try {
      const events = await api.listMyEvents();
      if (!events.length) {
        list.replaceChildren(h('div', { class: 'card empty' },
          h('div', { class: 'big' }, '📋'),
          h('h3', null, 'Belum ada acara'),
          h('p', null, 'Buat acara pertama Anda, atau gabung sebagai operator dengan kode dari panitia.'),
          h('div', { class: 'row', style: { justifyContent: 'center' } },
            h('button', { class: 'btn primary', onclick: () => createDialog() }, '＋ Buat acara'),
            h('button', { class: 'btn', onclick: demoData }, '✨ Buat contoh acara'))));
        return;
      }
      const grid = h('div', { class: 'grid grid-3' });
      list.replaceChildren(grid);
      for (const ev of events) grid.appendChild(card(ev));
    } catch (e) {
      list.replaceChildren(h('div', { class: 'card empty' }, h('p', null, errMsg(e)), h('button', { class: 'btn', onclick: load }, 'Coba lagi')));
    }
  }

  function card(ev) {
    const t = normalizeTheme(ev.theme);
    const counts = h('span', { class: 'small muted' }, '…');
    api.eventCounts(ev.id).then((c) => {
      counts.textContent = usesParticipantScan(ev)
        ? `${c.attendances} hadir dari ${c.participants} peserta`
        : `${c.attendances} hadir`;
    }).catch(() => { counts.textContent = ''; });
    const canEdit = ev.my_role !== 'scanner';
    return h('div', { class: 'card event-card' },
      h('div', { class: 'thumb', style: { background: `linear-gradient(135deg, ${t.primary}, ${t.secondary})`, color: contrastInk(t.primary) } },
        t.logo_url ? h('img', { src: t.logo_url, alt: '' }) : null,
        h('strong', null, ev.name)),
      h('div', { class: 'row' },
        h('span', { class: 'badge blue' }, MODE_LABEL[ev.mode]),
        h('span', { class: 'badge' }, ROLE_LABEL[ev.my_role] || ev.my_role),
        ev.is_active && ev.is_open ? h('span', { class: 'badge ok' }, 'Dibuka') : h('span', { class: 'badge err' }, 'Ditutup')),
      h('div', { class: 'small muted' }, [ev.event_date ? fmtDate(ev.event_date) : 'Tanggal belum diatur', ev.start_time ? ` · ${hhmm(ev.start_time)}` : ''].join('')),
      ev.location ? h('div', { class: 'small muted' }, '📍 ' + ev.location) : null,
      counts,
      h('div', { class: 'row', style: { marginTop: 'auto' } },
        canEdit ? h('a', { class: 'btn sm primary', href: `#/event/${ev.id}` }, '⚙️ Kelola') : null,
        usesParticipantScan(ev) ? h('a', { class: 'btn sm', href: `#/event/${ev.id}/scan` }, '📷 Scan') : null,
        h('a', { class: 'btn sm', href: `#/event/${ev.id}/display` }, '🖥️ Layar'),
        h('a', { class: 'btn sm', href: `#/event/${ev.id}/monitor` }, '📈 Monitor'),
        h('a', { class: 'btn sm', href: `#/event/${ev.id}/report` }, '📊 Laporan')));
  }

  async function createDialog() {
    let templates = BUILTIN_TEMPLATES.map((t) => ({ ...t, builtin: true }));
    try { templates = templates.concat((await api.listTemplates()).map((t) => ({ ...t, description: 'Template tersimpan' }))); } catch (e) { /* abaikan */ }
    let selected = templates[0];
    const name = h('input', { type: 'text', placeholder: 'mis. Rapat Koordinasi Bulanan' });
    const date = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
    const tplBox = h('div', { class: 'grid grid-2' });
    const renderTpl = () => tplBox.replaceChildren(...templates.map((t) => {
      const th = normalizeTheme(t.theme);
      return h('button', { type: 'button', class: 'card flat', style: {
        textAlign: 'left', cursor: 'pointer', padding: '.8rem', borderWidth: '2px',
        borderColor: selected === t ? 'var(--primary)' : 'var(--border)', font: 'inherit', color: 'inherit',
      }, onclick: () => { selected = t; renderTpl(); } },
      h('div', { class: 'row', style: { gap: '.4rem', marginBottom: '.3rem' } },
        h('span', { class: 'dot', style: { background: th.primary } }), h('span', { class: 'dot', style: { background: th.secondary } }),
        h('strong', null, t.name)),
      h('div', { class: 'small muted' }, t.description || ''),
      h('div', { class: 'small', style: { marginTop: '.3rem' } }, h('span', { class: 'badge blue' }, MODE_LABEL[t.mode] || '')));
    }));
    renderTpl();
    modal({
      title: 'Buat acara baru', wide: true,
      body: h('div', { class: 'stack' },
        h('div', { class: 'grid grid-2' },
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Nama acara *'), name),
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Tanggal'), date)),
        h('div', null, h('span', { class: 'lbl', style: { fontWeight: 600 } }, 'Pilih template'), tplBox),
        h('p', { class: 'small muted' }, 'Semua pengaturan (warna, logo, formulir, mode) bisa diubah setelah acara dibuat.')),
      actions: [
        { label: 'Batal' },
        { label: 'Buat acara', class: 'primary', onClick: async () => {
          if (!name.value.trim()) { toast('Nama acara wajib diisi', 'err'); return false; }
          const ev = await api.createEvent({
            name: name.value.trim(), event_date: date.value || null, mode: selected.mode,
            theme: selected.theme, form_schema: selected.form_schema, settings: selected.settings || {},
            categories: selected.categories || [],
          });
          toast('Acara dibuat', 'ok');
          navigate(`/event/${ev.id}`);
        } },
      ],
    });
  }

  function joinDialog() {
    const code = h('input', { type: 'text', placeholder: 'mis. 7F3A9C21', style: { textTransform: 'uppercase', letterSpacing: '.1em' } });
    modal({
      title: 'Gabung sebagai operator',
      body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Masukkan kode undangan dari pemilik acara.'), code),
      actions: [{ label: 'Batal' }, { label: 'Gabung', class: 'primary', onClick: async () => {
        const r = await api.joinEvent(code.value.trim());
        if (r?.status !== 'ok') { toast('Kode tidak valid', 'err'); return false; }
        toast(`Bergabung ke "${r.name}"`, 'ok');
        load();
      } }],
    });
  }

  async function demoData() {
    if (!(await confirmDialog('Buat 2 acara contoh (rapat & acara formal) beserta beberapa peserta?'))) return;
    try {
      const [rapat, formal] = [BUILTIN_TEMPLATES[0], BUILTIN_TEMPLATES[2]];
      const today = new Date().toISOString().slice(0, 10);
      await api.createEvent({ name: 'Rapat Koordinasi (Contoh)', event_date: today, start_time: '09:00', end_time: '11:00', location: 'Ruang Rapat Lt. 2',
        mode: rapat.mode, theme: rapat.theme, form_schema: rapat.form_schema, settings: rapat.settings, categories: rapat.categories });
      const ev = await api.createEvent({ name: 'Pelantikan Pengurus (Contoh)', event_date: today, start_time: '19:00', end_time: '22:00', location: 'Ballroom Hotel',
        organizer: 'Panitia Pelantikan', mode: formal.mode, theme: formal.theme, form_schema: formal.form_schema, settings: formal.settings, categories: formal.categories });
      const names = ['Ahmad Fauzi', 'Siti Rahmawati', 'Budi Santoso', 'Dewi Lestari', 'Rizky Pratama', 'Nur Aisyah', 'Andi Wijaya', 'Maya Sari'];
      const cats = ['VIP', 'Undangan', 'Undangan', 'VIP', 'Undangan', 'Panitia', 'Media', 'Undangan'];
      await api.insertParticipants(names.map((n, i) => ({ event_id: ev.id, name: n, category: cats[i], data: { jabatan: i % 2 ? 'Anggota' : 'Ketua Bidang', instansi: 'Organisasi Contoh', meja: String(i + 1) } })));
      toast('Acara contoh dibuat', 'ok');
      load();
    } catch (e) { toast(errMsg(e), 'err'); }
  }

  load();
}
