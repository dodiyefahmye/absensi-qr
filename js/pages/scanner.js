// Halaman scanner: kamera / scanner USB, realtime multi-perangkat, antrean offline.
import * as api from '../lib/api.js';
import { h, toast, errMsg, fmtTime, uuid, debounce, navigate } from '../lib/ui.js';
import { applyTheme, normalizeTheme, categoryColor, contrastInk } from '../lib/theme.js';
import { parseScanned } from '../lib/qr.js';
import { loadScanner } from '../lib/vendor.js';
import { queue, cache } from '../lib/offline.js';

export default async function scanner(root, { params }) {
  const eventId = params.id;
  let ev, people = [], byToken = new Map(), byId = new Map(), attended = new Map(), recent = [];
  let qr = null, cameras = [], camIndex = 0, running = false;
  let lastToken = '', lastTime = 0, overlayTimer = null, busy = false, sessionCount = 0;
  let wakeLock = null, audio = null, flushing = false;
  // label per tab (sessionStorage), default dari label terakhir di perangkat ini
  const deviceLabel = () => sessionStorage.getItem('device-label') ?? localStorage.getItem('device-label') ?? '';
  const setDeviceLabel = (v) => { sessionStorage.setItem('device-label', v); localStorage.setItem('device-label', v); };

  // ---------- muat data (online → cache, offline → dari cache) ----------
  try {
    const [e, p, a] = await Promise.all([api.getEvent(eventId), api.listParticipants(eventId), api.listAttendances(eventId)]);
    ev = e; people = p;
    a.forEach((x) => x.participant_id && attended.set(x.participant_id, x));
    recent = a.slice(0, 15);
    cache.set('scan:' + eventId, { ev, people, attendances: a.slice(0, 3000), at: Date.now() }).catch(() => {});
  } catch (err) {
    const c = await cache.get('scan:' + eventId).catch(() => null);
    if (!c) {
      root.appendChild(h('div', { class: 'container narrow' }, h('div', { class: 'card center', style: { marginTop: '10vh' } },
        h('h2', null, 'Tidak dapat memuat acara'), h('p', { class: 'muted' }, errMsg(err)), h('a', { class: 'btn', href: '#/' }, 'Kembali'))));
      return;
    }
    ev = c.ev; people = c.people;
    c.attendances.forEach((x) => x.participant_id && attended.set(x.participant_id, x));
    recent = c.attendances.slice(0, 15);
    toast('Mode offline: memakai data tersimpan', 'warn');
  }
  for (const p of people) { byToken.set(p.qr_token, p); byId.set(p.id, p); }
  (await queue.forEvent(eventId).catch(() => [])).forEach((q) => { const p = byToken.get(q.token) || byId.get(q.participant_id); if (p && !attended.has(p.id)) attended.set(p.id, { pending: true, checked_in_at: q.checked_at }); });

  const theme = normalizeTheme(ev.theme);
  const resetMs = Number(ev.settings?.scan_reset_ms) || 1600;

  // ---------- UI ----------
  const page = h('div', { class: 'scanner-page' });
  applyTheme(page, theme);
  root.appendChild(page);

  const countEl = h('span', { class: 'big' });
  const liveDot = h('span', { class: 'dot warn', title: 'Status sinkron' });
  const liveTxt = h('span', { class: 'small' }, 'Menghubungkan…');
  const pendingEl = h('span', { class: 'small' });
  const sessEl = h('span', { class: 'small' });
  const labelIn = h('input', { type: 'text', value: deviceLabel(), placeholder: 'Nama perangkat, mis. Meja 1', style: { maxWidth: '200px', padding: '.35rem .6rem', background: 'rgba(255,255,255,.85)', color: '#111' },
    onchange: (e) => setDeviceLabel(e.target.value.trim()) });

  const reader = h('div', { id: 'reader' });
  const placeholder = h('div', { class: 'cam-placeholder' },
    h('div', { style: { fontSize: '3rem' } }, '📷'),
    h('div', null, 'Tekan tombol di bawah untuk menyalakan kamera'),
    h('button', { class: 'btn primary lg', onclick: () => startCamera() }, 'Mulai scan'),
    h('div', { class: 'small' }, 'Scanner barcode USB/Bluetooth juga didukung — langsung scan saja.'));
  const overlay = h('div', { class: 'scan-overlay hidden', onclick: hideOverlay });
  const camWrap = h('div', { class: 'cam-wrap' }, reader, placeholder, overlay);
  const camBtns = h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '.6rem' } });

  const search = h('input', { type: 'search', placeholder: 'Cari nama peserta…', autocomplete: 'off' });
  const results = h('div', { class: 'search-results' });
  const recentList = h('ul', { class: 'recent' });

  page.append(
    h('div', { class: 'scan-top' },
      h('a', { class: 'btn sm', href: '#/', title: 'Kembali' }, '←'),
      theme.logo_url ? h('img', { src: theme.logo_url, alt: '' }) : null,
      h('div', { class: 'title', style: { flex: 1, minWidth: 0 } }, ev.name, h('div', { class: 'small', style: { opacity: .85, fontWeight: 500 } }, 'Scanner absensi')),
      h('button', { class: 'btn sm', title: 'Layar penuh', onclick: () => document.fullscreenElement ? document.exitFullscreen() : page.requestFullscreen?.() }, '⛶')),
    h('div', { class: 'scan-counter' },
      h('span', null, 'Hadir'), countEl,
      h('span', { class: 'spacer' }),
      h('span', { class: 'row', style: { gap: '.35rem' } }, liveDot, liveTxt), pendingEl, sessEl, labelIn),
    h('div', { class: 'scan-body' },
      h('div', null, camWrap, camBtns),
      h('div', { class: 'scan-side' },
        h('div', { class: 'card' }, h('h3', null, 'Cari manual'), search, results),
        h('div', { class: 'card' }, h('h3', null, 'Terakhir masuk'), recentList))));

  function updateCount() {
    const total = people.length;
    countEl.textContent = total ? `${attended.size} / ${total}` : String(attended.size);
    sessEl.textContent = `· Perangkat ini: ${sessionCount}`;
  }

  function renderRecent() {
    recentList.replaceChildren(...(recent.length ? recent.slice(0, 15).map((a) => {
      const col = categoryColor(ev, a.category);
      return h('li', null,
        h('span', { class: 'dot', style: { background: col } }),
        h('span', { style: { fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.name || '—'),
        a.device_label ? h('span', { class: 'badge', style: { fontSize: '.65rem' } }, a.device_label) : null,
        h('span', { class: 't' }, a.pending ? '⏳ offline' : fmtTime(a.checked_in_at)));
    }) : [h('li', { class: 'muted' }, 'Belum ada yang masuk')]));
  }

  function pushRecent(a) {
    if (a.id && recent.some((r) => r.id === a.id)) return;
    recent.unshift(a); recent = recent.slice(0, 30); renderRecent();
  }

  function renderCamBtns() {
    camBtns.replaceChildren(
      running ? h('button', { class: 'btn', onclick: stopCamera }, '⏹ Matikan kamera') : h('button', { class: 'btn primary', onclick: () => startCamera() }, '▶ Nyalakan kamera'),
      running && cameras.length > 1 ? h('button', { class: 'btn', onclick: switchCamera }, '🔄 Ganti kamera') : null);
  }

  // ---------- suara & getar ----------
  function beep(kind) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const seq = { ok: [[1046, 0.12]], dup: [[520, 0.12], [520, 0.12]], err: [[220, 0.35]], off: [[880, 0.1], [1175, 0.1]] }[kind] || [];
      let t = audio.currentTime;
      for (const [f, d] of seq) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = kind === 'err' ? 'square' : 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d); t += d + 0.05;
      }
    } catch (e) { /* abaikan */ }
    if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 80 : kind === 'err' ? [200, 80, 200] : [60, 60, 60]);
  }

  function showOverlay(kind, icon, title, sub, category) {
    clearTimeout(overlayTimer);
    const col = category ? categoryColor(ev, category) : null;
    overlay.className = 'scan-overlay ' + kind;
    overlay.replaceChildren(
      h('div', { class: 'ico' }, icon),
      h('div', { class: 'nm' }, title),
      category ? h('div', { class: 'cat', style: { background: col, color: contrastInk(col) } }, category) : null,
      sub ? h('div', { style: { marginTop: '.5rem', fontWeight: 600, opacity: .95 } }, sub) : null);
    beep(kind);
    busy = true;
    overlayTimer = setTimeout(hideOverlay, kind === 'ok' || kind === 'off' ? resetMs : resetMs + 900);
  }
  function hideOverlay() { overlay.classList.add('hidden'); busy = false; }

  // ---------- proses hasil scan ----------
  async function handleCode(text, participantId = null) {
    const token = participantId ? null : parseScanned(text);
    const key = participantId || token || 'raw:' + String(text);
    const now = Date.now();
    if (key === lastToken && now - lastTime < 3000) return; // abaikan pembacaan berulang QR yang sama
    lastToken = key; lastTime = now;
    if (!participantId && !token) return showOverlay('err', '✕', 'QR tidak dikenali', 'Bukan QR peserta acara ini');

    const local = participantId ? byId.get(participantId) : byToken.get(token);
    const label = deviceLabel() || null;

    if (!navigator.onLine) return offlineCheckIn(local, token, label);

    try {
      const r = await api.checkIn({ eventId, token, participantId, deviceLabel: label, clientId: uuid() });
      handleResult(r);
    } catch (e) {
      if (/fetch|network|Failed/i.test(String(e.message || e))) return offlineCheckIn(local, token, label);
      showOverlay('err', '✕', 'Gagal', errMsg(e));
    }
  }

  function handleResult(r) {
    const p = r.participant;
    switch (r.status) {
      case 'ok':
        sessionCount++;
        if (p) { attended.set(p.id, r.attendance); if (!byId.has(p.id)) { byId.set(p.id, p); byToken.set(p.qr_token, p); } }
        pushRecent(r.attendance);
        showOverlay('ok', '✓', p?.name || 'Berhasil', ev.settings?.success_message || 'Kehadiran tercatat', p?.category);
        break;
      case 'duplicate': {
        const by = r.scanned_by_name ? ` oleh ${r.scanned_by_name}` : '';
        const dev = r.attendance?.device_label ? ` (${r.attendance.device_label})` : '';
        showOverlay('dup', '!', p?.name || 'Sudah absen', `Sudah absen pukul ${fmtTime(r.attendance?.checked_in_at)}${by}${dev}`, p?.category);
        break;
      }
      case 'closed': showOverlay('err', '🔒', 'Absensi ditutup', 'Buka absensi di Pengaturan acara'); break;
      case 'wrong_event': showOverlay('err', '✕', 'Salah acara', 'QR ini milik acara lain'); break;
      case 'forbidden': showOverlay('err', '✕', 'Tidak punya akses', 'Akun Anda bukan anggota acara ini'); break;
      default: showOverlay('err', '✕', 'QR tidak valid', 'Peserta tidak ditemukan');
    }
    updateCount();
  }

  async function offlineCheckIn(p, token, label) {
    if (!p) return showOverlay('err', '✕', 'Tidak ditemukan', 'Offline: peserta tidak ada di data tersimpan');
    if (attended.has(p.id)) return showOverlay('dup', '!', p.name, 'Sudah tercatat hadir', p.category);
    const item = { client_id: uuid(), event_id: eventId, token: p.qr_token, participant_id: p.id, device_label: label, checked_at: new Date().toISOString() };
    await queue.add(item);
    const a = { pending: true, name: p.name, category: p.category, checked_in_at: item.checked_at, device_label: label };
    attended.set(p.id, a); sessionCount++;
    pushRecent(a); updateCount(); updatePending();
    showOverlay('off', '✓', p.name, 'Tersimpan offline — akan disinkronkan otomatis', p.category);
  }

  async function updatePending() {
    const n = (await queue.forEvent(eventId).catch(() => [])).length;
    pendingEl.textContent = n ? `· ⏳ ${n} menunggu sinkron` : '';
  }

  async function flushQueue() {
    if (flushing || !navigator.onLine) return;
    flushing = true;
    try {
      const items = await queue.forEvent(eventId);
      for (const it of items) {
        try {
          const r = await api.checkIn({ eventId, token: it.token, deviceLabel: it.device_label, clientId: it.client_id, checkedAt: it.checked_at });
          await queue.remove(it.client_id);
          if (r?.attendance && r.participant) attended.set(r.participant.id, r.attendance);
        } catch (e) { break; }
      }
      if (items.length) { recent = recent.filter((r) => !r.pending); renderRecent(); updateCount(); }
    } finally { flushing = false; updatePending(); }
  }

  // ---------- kamera ----------
  async function startCamera() {
    placeholder.replaceChildren(h('div', { class: 'spinner' }), h('div', null, 'Menyalakan kamera…'));
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const Html5Qrcode = await loadScanner();
      if (!qr) qr = new Html5Qrcode('reader', { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
      try { cameras = await Html5Qrcode.getCameras(); } catch (e) { cameras = []; }
      const saved = localStorage.getItem('camera-id');
      const idx = cameras.findIndex((c) => c.id === saved);
      if (idx >= 0) camIndex = idx;
      const source = idx >= 0 ? cameras[idx].id : { facingMode: 'environment' };
      await qr.start(source, {
        fps: 15,
        qrbox: (w, hh) => { const s = Math.floor(Math.min(w, hh) * 0.72); return { width: s, height: s }; },
        aspectRatio: 1,
        disableFlip: false,
      }, (text) => { if (!busy) handleCode(text); }, () => {});
      running = true;
      placeholder.classList.add('hidden');
      requestWakeLock();
    } catch (e) {
      running = false;
      placeholder.classList.remove('hidden');
      placeholder.replaceChildren(h('div', { style: { fontSize: '2.5rem' } }, '🚫'),
        h('div', null, /Permission|NotAllowed/i.test(String(e)) ? 'Izin kamera ditolak. Izinkan akses kamera di pengaturan browser.' : 'Kamera tidak dapat dinyalakan: ' + (e?.message || e)),
        h('div', { class: 'small' }, 'Pastikan situs dibuka lewat HTTPS. Anda tetap bisa memakai pencarian manual atau scanner USB.'),
        h('button', { class: 'btn primary', onclick: () => startCamera() }, 'Coba lagi'));
    }
    renderCamBtns();
  }

  async function stopCamera() {
    try { if (qr && running) await qr.stop(); } catch (e) { /* */ }
    running = false;
    placeholder.classList.remove('hidden');
    placeholder.replaceChildren(h('div', { style: { fontSize: '3rem' } }, '📷'), h('button', { class: 'btn primary lg', onclick: () => startCamera() }, 'Mulai scan'));
    renderCamBtns();
  }

  async function switchCamera() {
    if (cameras.length < 2) return;
    camIndex = (camIndex + 1) % cameras.length;
    localStorage.setItem('camera-id', cameras[camIndex].id);
    await stopCamera();
    startCamera();
  }

  async function requestWakeLock() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* */ }
  }

  // ---------- scanner USB / Bluetooth (keyboard wedge) ----------
  let kbBuf = '', kbTime = 0;
  function onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const now = Date.now();
    if (now - kbTime > 80) kbBuf = '';
    kbTime = now;
    if (e.key === 'Enter') { if (kbBuf.length >= 6) { handleCode(kbBuf); } kbBuf = ''; return; }
    if (e.key.length === 1) kbBuf += e.key;
  }

  // ---------- cari manual ----------
  const doSearch = debounce(() => {
    const s = search.value.trim().toLowerCase();
    if (!s) { results.replaceChildren(); return; }
    const list = people.filter((p) => (p.name + ' ' + Object.values(p.data || {}).join(' ')).toLowerCase().includes(s)).slice(0, 30);
    results.replaceChildren(...(list.length ? list.map((p) => {
      const a = attended.get(p.id);
      return h('button', { type: 'button', onclick: () => { lastToken = ''; handleCode(null, p.id); search.value = ''; results.replaceChildren(); } },
        h('span', { class: 'dot', style: { background: categoryColor(ev, p.category) } }),
        h('span', { style: { flex: 1 } }, h('strong', null, p.name), p.category ? h('span', { class: 'small', style: { color: '#64748b' } }, ' · ' + p.category) : null),
        a ? h('span', { class: 'badge ok' }, '✓ ' + (a.pending ? 'offline' : fmtTime(a.checked_in_at))) : h('span', { class: 'badge' }, 'Check-in'));
    }) : [h('div', { class: 'small', style: { color: '#64748b', padding: '.5rem 0' } }, 'Tidak ditemukan')]));
  }, 120);
  search.addEventListener('input', doSearch);

  // ---------- realtime ----------
  const unsub = api.subscribeEvent(eventId, {
    attendance: (type, row, old) => {
      if (type === 'DELETE') {
        for (const [k, v] of attended) if (v.id && v.id === old?.id) attended.delete(k);
        recent = recent.filter((r) => r.id !== old?.id); renderRecent();
      } else if (row) {
        if (row.participant_id) attended.set(row.participant_id, row);
        pushRecent(row);
      }
      updateCount();
    },
    participant: (type, row, old) => {
      if (type === 'DELETE') { const p = byId.get(old?.id); if (p) { byToken.delete(p.qr_token); byId.delete(p.id); people = people.filter((x) => x.id !== p.id); } }
      else if (row) {
        const prev = byId.get(row.id);
        if (prev) { byToken.delete(prev.qr_token); people = people.map((x) => (x.id === row.id ? row : x)); } else people.push(row);
        byId.set(row.id, row); byToken.set(row.qr_token, row);
      }
      updateCount();
    },
    status: (s) => {
      const ok = s === 'SUBSCRIBED';
      liveDot.className = 'dot ' + (ok ? 'ok' : 'err');
      liveTxt.textContent = ok ? 'Realtime aktif' : navigator.onLine ? 'Menyambung ulang…' : 'Offline';
      if (ok) flushQueue();
    },
  });

  const onOnline = () => { liveTxt.textContent = 'Online'; flushQueue(); };
  const onOffline = () => { liveDot.className = 'dot err'; liveTxt.textContent = 'Offline'; };
  const onVis = () => { if (document.visibilityState === 'visible' && running) requestWakeLock(); };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  const flushTimer = setInterval(flushQueue, 15000);

  updateCount(); renderRecent(); renderCamBtns(); updatePending();
  if (!navigator.onLine) onOffline();
  if (localStorage.getItem('scan-autostart') === '1') startCamera();

  return () => {
    unsub();
    clearInterval(flushTimer); clearTimeout(overlayTimer);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    if (qr && running) { localStorage.setItem('scan-autostart', '1'); qr.stop().catch(() => {}); } else localStorage.removeItem('scan-autostart');
    if (wakeLock) wakeLock.release().catch(() => {});
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = '#1d4ed8';
  };
}
