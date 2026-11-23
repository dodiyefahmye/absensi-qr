// Monitor kehadiran realtime: statistik per kategori / kolom data, daftar belum & sudah hadir.
import * as api from '../lib/api.js';
import { h, errMsg, fmtTime, fmtDate, debounce } from '../lib/ui.js';
import { applyTheme, normalizeTheme, categoryColor, contrastInk } from '../lib/theme.js';
import { displayValue } from '../lib/form.js';

const EMPTY = '(kosong)';

export default async function monitor(root, { params }) {
  let ev, people = [], atts = [];
  try {
    ev = await api.getEvent(params.id);
    [people, atts] = await Promise.all([api.listParticipants(ev.id), api.listAttendances(ev.id)]);
  } catch (e) {
    root.appendChild(h('div', { class: 'container narrow' }, h('div', { class: 'card center', style: { marginTop: '10vh' } },
      h('h2', null, 'Gagal memuat'), h('p', { class: 'muted' }, errMsg(e)), h('a', { class: 'btn', href: '#/' }, 'Kembali'))));
    return;
  }
  const theme = normalizeTheme(ev.theme);
  const hasList = people.length > 0; // mode QR Acara tanpa daftar peserta → hanya hitung yang hadir
  const prefKey = 'monitor:' + ev.id;
  const pref = (() => { try { return JSON.parse(localStorage.getItem(prefKey)) || {}; } catch (e) { return {}; } })();
  const savePref = () => { try { localStorage.setItem(prefKey, JSON.stringify(pref)); } catch (e) { /* */ } };

  // ---------- pilihan pengelompokan ----------
  const groupFields = [{ key: '__category', label: 'Kategori' },
    ...(ev.form_schema || []).filter((f) => f.key !== 'nama' && !['signature', 'photo', 'textarea'].includes(f.type)).map((f) => ({ key: f.key, label: f.label || f.key, field: f }))];
  let groupBy = groupFields.some((g) => g.key === pref.groupBy) ? pref.groupBy : '__category';
  let sortBy = pref.sortBy || (hasList ? 'pct' : 'count');
  let selected = null; // nilai kelompok yang dipilih (null = semua)
  let listTab = hasList ? 'belum' : 'hadir';
  let big = !!pref.big;
  const flash = new Set();

  const groupOf = (rec) => {
    if (groupBy === '__category') return rec.category || EMPTY;
    const g = groupFields.find((x) => x.key === groupBy);
    const v = displayValue(g?.field, rec.data?.[groupBy]);
    return v || EMPTY;
  };
  const attByP = () => new Map(atts.filter((a) => a.participant_id).map((a) => [a.participant_id, a]));
  const colorOf = (name) => (groupBy === '__category' && name !== EMPTY ? categoryColor(ev, name) : theme.primary);

  // ---------- UI ----------
  const page = h('div', { class: 'monitor-page' });
  applyTheme(page, theme);
  root.appendChild(page);

  const clock = h('span', { class: 'mono' });
  const live = h('span', { class: 'row', style: { gap: '.35rem' } }, h('span', { class: 'dot warn' }), h('span', null, 'Menghubungkan…'));
  const groupSel = h('select', { 'aria-label': 'Kelompokkan berdasarkan', onchange: () => { groupBy = groupSel.value; selected = null; pref.groupBy = groupBy; savePref(); render(); } },
    groupFields.map((g) => h('option', { value: g.key }, g.label)));
  groupSel.value = groupBy;
  const sortSel = h('select', { 'aria-label': 'Urutkan', onchange: () => { sortBy = sortSel.value; pref.sortBy = sortBy; savePref(); render(); } },
    hasList ? [h('option', { value: 'pct' }, 'Persentase terendah'), h('option', { value: 'missing' }, 'Belum hadir terbanyak'),
      h('option', { value: 'total' }, 'Jumlah peserta terbanyak'), h('option', { value: 'name' }, 'Nama (A–Z)')]
      : [h('option', { value: 'count' }, 'Hadir terbanyak'), h('option', { value: 'name' }, 'Nama (A–Z)')]);
  sortSel.value = sortBy;
  const search = h('input', { type: 'search', placeholder: 'Cari nama peserta…', 'aria-label': 'Cari nama' });
  const bigBtn = h('button', { class: 'btn sm', title: 'Huruf besar untuk layar TV', onclick: () => { big = !big; pref.big = big; savePref(); page.classList.toggle('monitor-big', big); bigBtn.textContent = big ? '🔠 Huruf normal' : '🔠 Huruf besar'; } }, big ? '🔠 Huruf normal' : '🔠 Huruf besar');
  page.classList.toggle('monitor-big', big);

  const summary = h('div', { class: 'monitor-summary' });
  const groupsBox = h('div', { class: 'monitor-groups' });
  const detailTitle = h('h3', { style: { margin: 0 } });
  const detailTabs = h('div', { class: 'row' });
  const detailList = h('div', { class: 'monitor-list' });

  page.append(
    h('div', { class: 'monitor-head' },
      h('a', { class: 'btn sm', href: '#/', title: 'Kembali' }, '←'),
      theme.logo_url ? h('img', { src: theme.logo_url, alt: '' }) : null,
      h('div', { class: 'mh-title' },
        h('div', { class: 'monitor-title' }, ev.name),
        h('div', { class: 'small', style: { opacity: .9 } }, ['Monitor kehadiran', ev.event_date ? fmtDate(ev.event_date) : ''].filter(Boolean).join(' · '))),
      h('div', { class: 'mh-tools' }, live, clock,
      h('button', { class: 'btn sm', title: 'Layar penuh', onclick: () => document.fullscreenElement ? document.exitFullscreen() : page.requestFullscreen?.() }, '⛶ Layar penuh'))),
    h('div', { class: 'monitor-body' },
      h('div', { class: 'monitor-controls row' },
        h('label', { class: 'row small', style: { gap: '.4rem', flex: '1 1 260px' } }, h('b', null, 'Kelompokkan:'), groupSel),
        h('label', { class: 'row small', style: { gap: '.4rem', flex: '1 1 260px' } }, h('b', null, 'Urutkan:'), sortSel),
        bigBtn),
      summary,
      groupsBox,
      h('div', { class: 'monitor-detail' },
        h('div', { class: 'row between', style: { marginBottom: '.75rem' } }, detailTitle, h('div', { class: 'row' }, detailTabs, search)),
        detailList)));

  // ---------- render ----------
  function stats() {
    const map = new Map();
    const ap = attByP();
    if (hasList) {
      for (const p of people) {
        const g = groupOf(p);
        const s = map.get(g) || { name: g, total: 0, hadir: 0 };
        s.total++; if (ap.has(p.id)) s.hadir++;
        map.set(g, s);
      }
    } else {
      for (const a of atts) {
        const g = groupOf(a);
        const s = map.get(g) || { name: g, total: 0, hadir: 0 };
        s.hadir++; s.total++;
        map.set(g, s);
      }
    }
    const arr = Array.from(map.values());
    const pct = (s) => (s.total ? s.hadir / s.total : 0);
    const byName = (a, b) => (a.name === EMPTY) - (b.name === EMPTY) || a.name.localeCompare(b.name, 'id', { numeric: true });
    arr.sort({
      pct: (a, b) => pct(a) - pct(b) || (b.total - b.hadir) - (a.total - a.hadir) || byName(a, b),
      missing: (a, b) => (b.total - b.hadir) - (a.total - a.hadir) || byName(a, b),
      total: (a, b) => b.total - a.total || byName(a, b),
      count: (a, b) => b.hadir - a.hadir || byName(a, b),
      name: byName,
    }[sortBy] || byName);
    return arr;
  }

  function renderSummary() {
    const hadir = hasList ? attByP().size : atts.length;
    const total = people.length;
    const pct = total ? Math.round((hadir / total) * 100) : 0;
    summary.replaceChildren(
      h('div', { class: 'ms-item' }, h('div', { class: 'ms-num', style: { color: 'var(--ok)' } }, hadir), h('div', { class: 'ms-lbl' }, 'Sudah hadir')),
      hasList ? h('div', { class: 'ms-item' }, h('div', { class: 'ms-num', style: { color: 'var(--err)' } }, total - hadir), h('div', { class: 'ms-lbl' }, 'Belum hadir')) : null,
      hasList ? h('div', { class: 'ms-item' }, h('div', { class: 'ms-num' }, total), h('div', { class: 'ms-lbl' }, 'Total peserta')) : null,
      hasList ? h('div', { class: 'ms-item ms-wide' },
        h('div', { class: 'row between' }, h('span', { class: 'ms-lbl' }, 'Kehadiran'), h('b', { class: 'ms-pct' }, pct + '%')),
        h('div', { class: 'ms-bar' }, h('div', { style: { width: pct + '%', background: theme.primary } }))) : null);
  }

  function renderGroups() {
    const arr = stats();
    if (!arr.length) { groupsBox.replaceChildren(h('div', { class: 'empty' }, hasList ? 'Belum ada peserta.' : 'Belum ada yang hadir.')); return; }
    groupsBox.replaceChildren(
      h('button', { type: 'button', class: 'mg-card mg-all' + (selected === null ? ' active' : ''), onclick: () => { selected = null; renderGroups(); renderDetail(); } },
        h('div', { class: 'mg-name' }, 'Semua'), h('div', { class: 'small', style: { opacity: .75 } }, `${arr.length} kelompok`)),
      ...arr.map((s) => {
        const col = colorOf(s.name);
        const pct = s.total ? Math.round((s.hadir / s.total) * 100) : 0;
        const missing = s.total - s.hadir;
        return h('button', { type: 'button', class: 'mg-card' + (selected === s.name ? ' active' : '') + (flash.has(s.name) ? ' flash' : ''),
          style: { '--mg': col }, title: `Lihat peserta ${s.name}`, onclick: () => { selected = selected === s.name ? null : s.name; renderGroups(); renderDetail(); } },
        h('div', { class: 'row between', style: { gap: '.5rem', alignItems: 'flex-start' } },
          h('div', { class: 'mg-name' }, s.name),
          hasList ? h('span', { class: 'mg-pct', style: { color: pct === 100 ? 'var(--ok)' : 'inherit' } }, pct + '%') : null),
        h('div', { class: 'mg-count' }, hasList ? h('span', null, h('b', null, s.hadir), ' / ', s.total, ' hadir') : h('span', null, h('b', null, s.hadir), ' hadir')),
        hasList ? h('div', { class: 'ms-bar' }, h('div', { style: { width: pct + '%', background: col } })) : null,
        hasList ? h('div', { class: 'mg-missing' + (missing ? '' : ' done') }, missing ? `${missing} belum datang` : '✓ Lengkap') : null);
      }));
  }

  function renderDetail() {
    const ap = attByP();
    const q = search.value.trim().toLowerCase();
    const inGroup = (rec) => selected === null || groupOf(rec) === selected;
    const match = (name) => !q || String(name || '').toLowerCase().includes(q);
    const belum = hasList ? people.filter((p) => !ap.has(p.id) && inGroup(p) && match(p.name)).sort((a, b) => a.name.localeCompare(b.name, 'id')) : [];
    const hadirList = (hasList
      ? people.filter((p) => ap.has(p.id) && inGroup(p) && match(p.name)).map((p) => ({ ...p, att: ap.get(p.id) }))
      : atts.filter((a) => inGroup(a) && match(a.name)).map((a) => ({ ...a, att: a })))
      .sort((a, b) => new Date(b.att.checked_in_at) - new Date(a.att.checked_in_at));

    detailTitle.textContent = selected === null ? 'Semua peserta' : `${groupFields.find((g) => g.key === groupBy)?.label}: ${selected}`;
    detailTabs.replaceChildren(
      hasList ? h('button', { class: 'btn sm ' + (listTab === 'belum' ? 'primary' : ''), onclick: () => { listTab = 'belum'; renderDetail(); } }, `Belum hadir (${belum.length})`) : null,
      h('button', { class: 'btn sm ' + (listTab === 'hadir' ? 'primary' : ''), onclick: () => { listTab = 'hadir'; renderDetail(); } }, `Sudah hadir (${hadirList.length})`));

    const list = listTab === 'belum' ? belum : hadirList;
    const extraKey = groupBy === '__category' ? null : '__category';
    if (!list.length) {
      detailList.replaceChildren(h('div', { class: 'empty' }, listTab === 'belum' ? (q ? 'Tidak ditemukan' : '🎉 Semua sudah hadir') : 'Belum ada yang hadir'));
      return;
    }
    detailList.replaceChildren(h('ol', { class: 'ml-items' }, list.slice(0, 600).map((r) => {
      const sub = [selected === null ? groupOf(r) : null, extraKey && r.category && groupBy !== '__category' ? r.category : null].filter((x) => x && x !== EMPTY);
      return h('li', null,
        h('span', { class: 'dot', style: { background: listTab === 'belum' ? 'var(--err)' : 'var(--ok)' } }),
        h('span', { class: 'ml-name' }, r.name || '—'),
        sub.length ? h('span', { class: 'ml-sub' }, [...new Set(sub)].join(' · ')) : null,
        listTab === 'hadir' ? h('span', { class: 'ml-time' }, fmtTime(r.att.checked_in_at)) : (r.phone ? h('a', { class: 'ml-time', href: `https://wa.me/${r.phone.replace(/\D/g, '').replace(/^0/, '62')}`, target: '_blank', rel: 'noopener', title: 'Hubungi via WhatsApp' }, '💬 ' + r.phone) : null));
    })), list.length > 600 ? h('p', { class: 'small muted center' }, `…dan ${list.length - 600} lainnya (gunakan pencarian)`) : null);
  }

  function render() { renderSummary(); renderGroups(); renderDetail(); }
  search.addEventListener('input', debounce(renderDetail, 150));

  // ---------- realtime ----------
  const refresh = debounce(render, 150);
  const unsub = api.subscribeEvent(ev.id, {
    attendance: (type, row, old) => {
      if (type === 'DELETE') atts = atts.filter((a) => a.id !== old?.id);
      else if (row) {
        const i = atts.findIndex((a) => a.id === row.id);
        if (i >= 0) atts[i] = row; else atts.unshift(row);
        const rec = hasList ? people.find((p) => p.id === row.participant_id) : row;
        if (rec) { const g = groupOf(rec); flash.add(g); setTimeout(() => { flash.delete(g); renderGroups(); }, 2500); }
      }
      refresh();
    },
    participant: (type, row, old) => {
      if (type === 'DELETE') people = people.filter((p) => p.id !== old?.id);
      else if (row) { const i = people.findIndex((p) => p.id === row.id); if (i >= 0) people[i] = row; else people.push(row); }
      refresh();
    },
    status: (s) => {
      const ok = s === 'SUBSCRIBED';
      live.replaceChildren(h('span', { class: 'dot ' + (ok ? 'ok' : 'err') }), h('span', null, ok ? 'Realtime' : 'Menyambung ulang…'));
    },
  });
  const tick = () => { clock.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); };
  tick();
  const clockTimer = setInterval(tick, 10000);
  // sinkron ulang berkala jika ada event realtime yang terlewat
  const resync = setInterval(async () => {
    try { [people, atts] = await Promise.all([api.listParticipants(ev.id), api.listAttendances(ev.id)]); render(); } catch (e) { /* */ }
  }, 120000);

  render();
  return () => { unsub(); clearInterval(clockTimer); clearInterval(resync); };
}
