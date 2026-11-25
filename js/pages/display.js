// Layar tampilan / kiosk untuk proyektor: QR acara, jumlah hadir, sambutan realtime.
import * as api from '../lib/api.js';
import { h, errMsg, fmtDate, hhmm, copyText } from '../lib/ui.js';
import { applyTheme, normalizeTheme, categoryColor, contrastInk } from '../lib/theme.js';
import { drawQR, publicFormUrl } from '../lib/qr.js';
import { activeSession, sortSessions, inSession, nextSession } from '../lib/sessions.js';

export default async function display(root, { params }) {
  let ev, count = 0, total = 0, latest = [];
  let people = [], allAtts = [], sessions = [], cur = null;
  const loadAll = async () => {
    const [p, a, ss] = await Promise.all([api.listParticipants(ev.id), api.listAttendances(ev.id), api.listSessions(ev.id).catch(() => [])]);
    people = p; allAtts = a; sessions = sortSessions(ss);
  };
  try {
    ev = await api.getEvent(params.id);
    await loadAll();
  } catch (e) {
    root.appendChild(h('div', { class: 'container narrow' }, h('div', { class: 'card center', style: { marginTop: '10vh' } }, h('h2', null, 'Gagal memuat'), h('p', { class: 'muted' }, errMsg(e)), h('a', { class: 'btn', href: '#/' }, 'Kembali'))));
    return;
  }
  const theme = normalizeTheme(ev.theme);
  const page = h('div', { class: 'display-page' });
  applyTheme(page, theme);
  root.appendChild(page);

  const countEl = h('div', { class: 'display-count' });
  const sessionEl = h('div', { style: { fontSize: '1.25rem', fontWeight: 700, marginTop: '.2rem' } });
  const totalEl = h('div', { style: { fontSize: '1.4rem', fontWeight: 700, opacity: .8 } });
  const welcome = h('div', { style: { minHeight: '5rem', marginTop: '1rem' } });
  const listEl = h('ul', { class: 'display-list' });
  const clock = h('span');
  const qrCanvas = h('canvas');
  const qrInfo = h('div', { style: { marginTop: '.75rem', fontWeight: 600 } });
  const bar = h('div', { style: { height: '6px', background: theme.primary, borderRadius: '3px', transition: 'width 1s linear', width: '100%' } });
  let currentUrl = '';

  const isEventQR = ev.mode === 'event_qr' || ev.mode === 'hybrid';
  const left = isEventQR
    ? h('div', { class: 'display-qr' },
      h('div', { style: { fontSize: '1.5rem', fontWeight: 800, marginBottom: '.25rem' } }, ev.mode === 'hybrid' ? 'Scan untuk check-in' : 'Scan untuk absen'),
      ev.mode === 'hybrid' ? h('div', { style: { fontSize: '.95rem', color: '#475569', marginBottom: '.6rem' } }, 'Peserta terdaftar: buka e-ticket → "Check-in" → scan QR ini') : null,
      qrCanvas,
      h('div', { style: { background: '#e2e8f0', borderRadius: '3px', marginTop: '.75rem', overflow: 'hidden' } }, bar),
      qrInfo)
    : h('div', { class: 'center' }, theme.logo_url ? h('img', { src: theme.logo_url, alt: '', style: { maxHeight: '38vh', maxWidth: '90%', objectFit: 'contain' } }) : h('div', { style: { fontSize: '8rem' } }, '🎉'),
      h('div', { style: { fontSize: '1.6rem', fontWeight: 700, marginTop: '1rem' } }, 'Selamat Datang'));

  page.append(
    h('div', { class: 'display-head' },
      theme.logo_url && isEventQR ? h('img', { src: theme.logo_url, alt: '' }) : null,
      h('div', { style: { flex: 1 } }, h('h1', null, ev.name),
        h('div', { style: { opacity: .9, fontSize: '1.1rem' } }, [ev.event_date ? fmtDate(ev.event_date) : '', ev.start_time ? hhmm(ev.start_time) + (ev.end_time ? '–' + hhmm(ev.end_time) : '') : '', ev.location].filter(Boolean).join(' · '))),
      h('div', { class: 'row no-print' },
        h('a', { class: 'btn sm', href: '#/', style: { background: 'rgba(255,255,255,.15)', color: 'inherit', borderColor: 'transparent' } }, '←'),
        h('button', { class: 'btn sm', style: { background: 'rgba(255,255,255,.15)', color: 'inherit', borderColor: 'transparent' }, onclick: () => document.fullscreenElement ? document.exitFullscreen() : page.requestFullscreen?.() }, '⛶ Layar penuh'))),
    h('div', { class: 'display-main' },
      left,
      h('div', null,
        h('div', { style: { fontSize: '1.3rem', fontWeight: 700, opacity: .8 } }, 'Jumlah hadir'), sessionEl,
        countEl, totalEl, welcome,
        h('div', { style: { fontWeight: 700, marginTop: '1rem', opacity: .7 } }, 'Terakhir hadir'),
        listEl)),
    h('div', { class: 'display-foot' }, h('span', null, ev.organizer || ''), clock));

  const sameSession = (sid) => !sessions.length || (sid || null) === (cur?.id || null);
  function derive() {
    cur = sessions.length ? activeSession(sessions) : null;
    const atts = allAtts.filter((a) => sameSession(a.session_id));
    count = atts.length;
    total = sessions.length ? people.filter((p) => inSession(p, cur)).length : people.length;
    latest = atts.slice().sort((a, b) => new Date(b.checked_in_at) - new Date(a.checked_in_at)).slice(0, 10);
    if (sessions.length) {
      const nx = nextSession(sessions);
      sessionEl.textContent = cur ? `🗓 ${cur.name}` : `Tidak ada sesi berlangsung${nx ? ` · berikutnya: ${nx.name} (${new Date(nx.starts_at).toLocaleString('id-ID', { weekday: 'short', hour: '2-digit', minute: '2-digit' })})` : ''}`;
    } else sessionEl.textContent = '';
  }
  function renderCount() {
    countEl.textContent = count;
    totalEl.textContent = total && !isEventQR ? `dari ${total} undangan (${Math.round((count / total) * 100)}%)` : '';
  }
  function renderList() {
    listEl.replaceChildren(...latest.slice(0, 6).map((a) => {
      const col = categoryColor(ev, a.category);
      return h('li', null, h('strong', null, a.name || '—'), a.category ? h('span', { class: 'badge', style: { marginLeft: '.5rem', background: col, color: contrastInk(col), borderColor: col } }, a.category) : null);
    }));
  }
  let welcomeTimer;
  function greet(a) {
    clearTimeout(welcomeTimer);
    welcome.replaceChildren(h('div', { class: 'welcome' }, 'Selamat datang, ', h('span', { style: { color: theme.primary } }, a.name), '!'));
    welcomeTimer = setTimeout(() => welcome.replaceChildren(), 8000);
  }

  // QR acara (dengan kode berputar)
  let qrTimer, tickTimer, remaining = 0, rotateSec = 30;
  async function refreshQR() {
    clearTimeout(qrTimer);
    try {
      const info = await api.getEventCode(ev.id);
      const url = publicFormUrl(info.token, info.rotating ? info.code : null);
      if (url !== currentUrl) { currentUrl = url; await drawQR(qrCanvas, url, { size: 720, dark: '#000', margin: 2 }); }
      rotateSec = info.rotate_seconds;
      const codeEl = ev.mode === 'hybrid' ? h('div', { style: { marginTop: '.35rem', fontSize: '1.05rem' } }, 'Kode: ', h('b', { class: 'mono', style: { fontSize: '1.6rem', letterSpacing: '.2em' } }, info.code)) : null;
      if (info.rotating) {
        remaining = info.expires_in;
        qrInfo.replaceChildren(h('span', null, `QR berganti tiap ${rotateSec} detik`), codeEl);
        qrTimer = setTimeout(refreshQR, info.expires_in * 1000 + 300);
      } else {
        remaining = 0; bar.style.width = '0';
        qrInfo.replaceChildren(codeEl, h('a', { href: 'javascript:void 0', onclick: () => copyText(currentUrl), style: { color: '#64748b', fontSize: '.85rem' } }, 'Salin link formulir'));
        // kode manual di mode Campuran tetap berganti walau QR tidak berputar
        qrTimer = setTimeout(refreshQR, ev.mode === 'hybrid' ? info.expires_in * 1000 + 300 : 5 * 60 * 1000);
      }
    } catch (e) {
      qrInfo.textContent = 'Gagal memuat QR, mencoba lagi…';
      qrTimer = setTimeout(refreshQR, 5000);
    }
  }
  if (isEventQR) {
    refreshQR();
    tickTimer = setInterval(() => { if (remaining > 0) { remaining--; bar.style.width = `${(remaining / rotateSec) * 100}%`; } }, 1000);
  }

  const clockTimer = setInterval(() => { clock.textContent = new Date().toLocaleTimeString('id-ID'); }, 1000);
  clock.textContent = new Date().toLocaleTimeString('id-ID');

  const unsub = api.subscribeEvent(ev.id, {
    attendance: (type, row, old) => {
      if (type === 'INSERT' && row) { allAtts.unshift(row); if (sameSession(row.session_id)) greet(row); }
      if (type === 'DELETE') allAtts = allAtts.filter((x) => x.id !== old?.id);
      derive();
      renderCount(); renderList();
    },
    participant: (type, row, old) => {
      if (type === 'DELETE') people = people.filter((p) => p.id !== old?.id);
      else if (row) { const i = people.findIndex((p) => p.id === row.id); if (i >= 0) people[i] = row; else people.push(row); }
      derive(); renderCount();
    },
    sessions: async () => { try { sessions = sortSessions(await api.listSessions(ev.id)); derive(); renderCount(); renderList(); } catch (e) { /* */ } },
    event: (row) => { if (row && isEventQR) refreshQR(); },
  });

  // sinkron ulang berkala (jaga-jaga jika ada event realtime terlewat)
  const resync = setInterval(async () => {
    try { await loadAll(); derive(); renderCount(); renderList(); } catch (e) { /* */ }
  }, 60000);

  // pergantian sesi sesuai jam
  const sessionTimer = setInterval(() => { if (sessions.length) { const before = cur?.id; derive(); if (cur?.id !== before) { renderCount(); renderList(); } } }, 20000);
  derive(); renderCount(); renderList();
  return () => { unsub(); clearTimeout(qrTimer); clearInterval(tickTimer); clearInterval(clockTimer); clearInterval(resync); clearInterval(sessionTimer); clearTimeout(welcomeTimer); };
}
