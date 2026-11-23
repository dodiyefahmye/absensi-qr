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
  // penanda area scan: selalu persegi, mengikuti ukuran tampilan kamera
  const guide = h('div', { class: 'scan-guide hidden', 'aria-hidden': 'true' },
    h('span', { class: 'c tl' }), h('span', { class: 'c tr' }), h('span', { class: 'c bl' }), h('span', { class: 'c br' }), h('span', { class: 'line' }));
  const camWrap = h('div', { class: 'cam-wrap' }, reader, guide, placeholder, overlay);
  function sizeGuide() {
    const r = camWrap.getBoundingClientRect();
    const side = Math.round(Math.min(r.width, r.height) * 0.62);
    guide.style.width = guide.style.height = side + 'px';
  }
  const guideRO = 'ResizeObserver' in window ? new ResizeObserver(sizeGuide) : null;
  if (guideRO) guideRO.observe(camWrap); else window.addEventListener('resize', sizeGuide);
  const camBtns = h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '.6rem' } });
  const resInfo = h('span', { class: 'small', style: { opacity: .7 }, title: 'Resolusi yang benar-benar diberikan kamera' });
  const camOpts = h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '.5rem' } });

  const search = h('input', { type: 'search', placeholder: 'Cari nama peserta…', autocomplete: 'off' });
  const results = h('div', { class: 'search-results' });
  const recentList = h('ul', { class: 'recent' });

  page.append(
    h('div', { class: 'scan-top' },
      h('a', { class: 'btn sm', href: '#/', title: 'Kembali' }, '←'),
      theme.logo_url ? h('img', { src: theme.logo_url, alt: '' }) : null,
      h('div', { class: 'title', style: { flex: 1, minWidth: 0 } }, ev.name, h('div', { class: 'small', style: { opacity: .85, fontWeight: 500 } }, 'Scanner absensi')),
      h('a', { class: 'btn sm', href: `#/event/${ev.id}/monitor`, title: 'Monitor kehadiran per kategori' }, '📈'),
      h('button', { class: 'btn sm', title: 'Layar penuh', onclick: () => document.fullscreenElement ? document.exitFullscreen() : page.requestFullscreen?.() }, '⛶')),
    h('div', { class: 'scan-counter' },
      h('span', null, 'Hadir'), countEl,
      h('span', { class: 'spacer' }),
      h('span', { class: 'row', style: { gap: '.35rem' } }, liveDot, liveTxt), pendingEl, sessEl, labelIn),
    h('div', { class: 'scan-body' },
      h('div', null, camWrap, camBtns, camOpts),
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

  // ---------- pengaturan kamera (pilih kamera, mirror) ----------
  const camLabel = (c, i) => c.label || `Kamera ${i + 1}`;
  const isFrontLabel = (l) => /front|depan|user|facetime|integrated|webcam|hd camera|usb2\.0 hd/i.test(l || '');
  function mirrorOn() {
    const v = localStorage.getItem('camera-mirror');
    if (v === '1') return true;
    if (v === '0') return false;
    const cur = cameras[camIndex];
    return cur ? isFrontLabel(cur.label) : false; // otomatis: mirror untuk kamera depan/webcam
  }
  function applyMirror() { reader.classList.toggle('mirror', mirrorOn()); }

  const camSelect = h('select', { title: 'Pilih kamera', 'aria-label': 'Pilih kamera', style: { maxWidth: '260px', flex: '0 1 240px' }, onchange: async () => {
    const i = Number(camSelect.value);
    if (!cameras[i]) return;
    camIndex = i;
    localStorage.setItem('camera-id', cameras[i].id);
    if (running) { await stopCamera(true); startCamera(); } else applyMirror();
  } });
  const mirrorSw = h('input', { type: 'checkbox', onchange: () => { localStorage.setItem('camera-mirror', mirrorSw.checked ? '1' : '0'); applyMirror(); } });
  const mirrorEl = h('label', { class: 'switch', title: 'Balik tampilan kamera seperti cermin (tidak memengaruhi pembacaan QR)' }, mirrorSw, h('span', { class: 'track' }), h('span', null, 'Mirror'));

  function fillCamSelect() {
    camSelect.replaceChildren(...(cameras.length
      ? cameras.map((c, i) => h('option', { value: String(i) }, '📷 ' + camLabel(c, i)))
      : [h('option', { value: '' }, 'Kamera belum terdeteksi')]));
    camSelect.value = cameras.length ? String(camIndex) : '';
    camSelect.disabled = cameras.length < 2;
    mirrorSw.checked = mirrorOn();
  }

  function renderCamBtns() {
    fillCamSelect();
    camBtns.replaceChildren(
      running ? h('button', { class: 'btn', onclick: () => stopCamera() }, '⏹ Matikan kamera') : h('button', { class: 'btn primary', onclick: () => startCamera() }, '▶ Nyalakan kamera'),
      cameras.length > 1 ? h('button', { class: 'btn', onclick: switchCamera, title: 'Pindah ke kamera berikutnya' }, '🔄 Ganti kamera') : null,
      camSelect,
      mirrorEl,
      h('button', { class: 'btn sm ghost', title: 'Deteksi ulang kamera (mis. setelah mencolok webcam USB)', onclick: async () => { await listCameras(true); renderCamBtns(); toast(`${cameras.length} kamera terdeteksi`, cameras.length ? 'ok' : 'warn'); } }, '↻'));
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
        const dev = r.attendance?.source === 'self' ? ' (check-in mandiri)' : r.attendance?.device_label ? ` (${r.attendance.device_label})` : '';
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


  // ---------- kualitas & tampilan kamera ----------
  const RES = {
    sd:  { label: 'Hemat (640×480)', width: 640, height: 480 },
    hd:  { label: 'HD (1280×720)', width: 1280, height: 720 },
    fhd: { label: 'Full HD (1920×1080)', width: 1920, height: 1080 },
  };
  const getRes = () => (RES[localStorage.getItem('camera-res')] ? localStorage.getItem('camera-res') : 'hd');
  const getFit = () => localStorage.getItem('camera-fit') || 'asli'; // asli = rasio asli tanpa potong, penuh = kotak (dipotong)
  function videoConstraintsFor(src) {
    const r = RES[getRes()];
    const base = { width: { ideal: r.width }, height: { ideal: r.height } };
    return typeof src === 'string' ? { ...base, deviceId: { exact: src } } : { ...base, ...src };
  }
  const caps = { zoom: null, torch: false };
  let torchOn = false;
  async function afterStart() {
    const v = reader.querySelector('video');
    // tunggu dimensi video tersedia
    for (let i = 0; i < 20 && v && !v.videoWidth; i++) await new Promise((r) => setTimeout(r, 50));
    applyFit();
    caps.zoom = null; caps.torch = false; torchOn = false;
    try {
      const c = qr.getRunningTrackCapabilities ? qr.getRunningTrackCapabilities() : {};
      if (c.zoom && c.zoom.max > c.zoom.min) caps.zoom = c.zoom;
      caps.torch = !!c.torch;
      if (Array.isArray(c.focusMode) && c.focusMode.includes('continuous')) {
        await qr.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      }
    } catch (e) { /* kamera tidak mendukung */ }
    renderCamOpts();
  }
  function applyFit() {
    const v = reader.querySelector('video');
    const fit = getFit();
    camWrap.classList.toggle('fit-penuh', fit === 'penuh');
    camWrap.classList.toggle('fit-asli', fit !== 'penuh');
    if (v && v.videoWidth && fit !== 'penuh') {
      // batasi lebar agar tinggi video ≤ 70% layar tanpa memotong gambar
      camWrap.style.maxWidth = `min(100%, calc(70vh * ${(v.videoWidth / v.videoHeight).toFixed(3)}))`;
    } else camWrap.style.maxWidth = '';
    resInfo.textContent = v && v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : '';
  }
  async function restartCamera() { if (running) { await stopCamera(true); startCamera(); } }

  const resSel = h('select', { title: 'Resolusi kamera', 'aria-label': 'Resolusi kamera', style: { flex: '0 1 200px' }, onchange: () => { localStorage.setItem('camera-res', resSel.value); restartCamera(); } },
    Object.entries(RES).map(([k, r]) => h('option', { value: k }, '🎞 ' + r.label)));
  const fitSel = h('select', { title: 'Tampilan kamera', 'aria-label': 'Tampilan kamera', style: { flex: '0 1 220px' }, onchange: () => { localStorage.setItem('camera-fit', fitSel.value); applyFit(); restartCamera(); } },
    h('option', { value: 'asli' }, '🖼 Tampilan asli (tanpa potong)'), h('option', { value: 'penuh' }, '⬛ Kotak penuh (dipotong)'));
  function renderCamOpts() {
    resSel.value = getRes(); fitSel.value = getFit();
    let zoomEl = null;
    if (running && caps.zoom) {
      const z = caps.zoom;
      const range = h('input', { type: 'range', min: z.min, max: z.max, step: z.step || 0.1, value: Number(localStorage.getItem('camera-zoom')) || z.min, style: { width: '140px' },
        oninput: () => { localStorage.setItem('camera-zoom', range.value); qr.applyVideoConstraints({ advanced: [{ zoom: Number(range.value) }] }).catch(() => {}); } });
      if (localStorage.getItem('camera-zoom')) qr.applyVideoConstraints({ advanced: [{ zoom: Number(range.value) }] }).catch(() => {});
      zoomEl = h('label', { class: 'row small', style: { gap: '.4rem', flex: '0 0 auto' } }, '🔍 Zoom', range);
    }
    const torchEl = running && caps.torch ? h('button', { class: 'btn sm', onclick: async () => {
      torchOn = !torchOn;
      try { await qr.applyVideoConstraints({ advanced: [{ torch: torchOn }] }); } catch (e) { torchOn = false; toast('Senter tidak dapat dinyalakan', 'warn'); }
      renderCamOpts();
    } }, torchOn ? '🔦 Senter: nyala' : '🔦 Senter') : null;
    camOpts.replaceChildren(resSel, fitSel, zoomEl, torchEl, resInfo);
  }

  // ---------- kamera ----------
  async function listCameras(force = false) {
    if (cameras.length && !force) return cameras;
    const Html5Qrcode = await loadScanner();
    try { cameras = await Html5Qrcode.getCameras(); } catch (e) { cameras = []; }
    // beri jeda agar webcam benar-benar dilepas sebelum dibuka lagi (mencegah 'Timeout starting video source')
    await new Promise((r) => setTimeout(r, 400));
    const saved = localStorage.getItem('camera-id');
    const idx = cameras.findIndex((c) => c.id === saved);
    if (idx >= 0) camIndex = idx;
    else {
      // utamakan kamera belakang di HP
      const back = cameras.findIndex((c) => /back|rear|belakang|environment/i.test(c.label || ''));
      camIndex = back >= 0 ? back : 0;
    }
    return cameras;
  }

  async function resetScanner() {
    try { if (qr) await qr.stop(); } catch (e) { /* belum berjalan */ }
    try { if (qr) qr.clear(); } catch (e) { /* */ }
    qr = null;
    reader.replaceChildren();
  }

  function cameraErrorText(e) {
    const m = String(e?.name || '') + ' ' + String(e?.message || e || '');
    if (/NotAllowed|Permission/i.test(m)) return ['Izin kamera ditolak.', 'Klik ikon gembok/kamera di samping alamat situs → izinkan Kamera, lalu muat ulang halaman.'];
    if (/NotFound|DevicesNotFound|no camera/i.test(m)) return ['Kamera tidak ditemukan.', 'Pastikan webcam terpasang/aktif, lalu klik ↻ untuk mendeteksi ulang.'];
    if (/Timeout|NotReadable|TrackStart|Could not start|in use|AbortError/i.test(m)) return ['Kamera sedang dipakai aplikasi lain atau gagal merespons.',
      'Tutup aplikasi yang memakai kamera (Zoom, Teams, Google Meet, WhatsApp, aplikasi Kamera, tab browser lain), lalu klik Coba lagi. Bisa juga pilih kamera lain dari daftar. Di Windows: Settings → Privacy & security → Camera → izinkan akses untuk browser.'];
    if (/Overconstrained/i.test(m)) return ['Kamera tidak mendukung pengaturan ini.', 'Pilih kamera lain dari daftar.'];
    return ['Kamera tidak dapat dinyalakan.', String(e?.message || e)];
  }

  async function startCamera() {
    placeholder.classList.remove('hidden');
    placeholder.replaceChildren(h('div', { class: 'spinner' }), h('div', null, 'Menyalakan kamera…'));
    let lastErr = null;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const Html5Qrcode = await loadScanner();
      await listCameras();
      // urutan percobaan: kamera terpilih → kamera lain → mode umum
      const attempts = [];
      if (cameras[camIndex]) attempts.push({ src: cameras[camIndex].id, idx: camIndex });
      cameras.forEach((c, i) => { if (i !== camIndex) attempts.push({ src: c.id, idx: i }); });
      attempts.push({ src: { facingMode: 'environment' }, idx: -1 }, { src: { facingMode: 'user' }, idx: -1 });

      for (const [n, at] of attempts.entries()) {
        if (n > 0) placeholder.replaceChildren(h('div', { class: 'spinner' }), h('div', null, `Mencoba kamera lain (${n + 1}/${attempts.length})…`));
        await resetScanner();
        qr = new Html5Qrcode('reader', { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
        try {
          await qr.start(at.src, {
            fps: 12,
            disableFlip: false,
            videoConstraints: videoConstraintsFor(at.src),
          }, (text) => { if (!busy) handleCode(text); }, () => {});
          if (at.idx >= 0) {
            if (at.idx !== camIndex) toast(`Memakai ${camLabel(cameras[at.idx], at.idx)}`, 'warn');
            camIndex = at.idx;
            localStorage.setItem('camera-id', cameras[at.idx].id);
          }
          running = true;
          placeholder.classList.add('hidden');
          applyMirror();
          await afterStart();
          guide.classList.remove('hidden'); sizeGuide();
          requestWakeLock();
          if (!cameras.length) { await listCameras(true); }
          renderCamBtns();
          return;
        } catch (e) {
          lastErr = e;
          console.warn('Kamera gagal:', at.src, e);
          if (/NotAllowed|Permission/i.test(String(e?.name || '') + String(e?.message || e))) break; // izin ditolak: percuma mencoba lainnya
        }
      }
    } catch (e) { lastErr = e; }

    await resetScanner();
    running = false;
    guide.classList.add('hidden');
    const [title, hint] = cameraErrorText(lastErr);
    placeholder.classList.remove('hidden');
    placeholder.replaceChildren(h('div', { style: { fontSize: '2.5rem' } }, '🚫'),
      h('div', { style: { fontWeight: 700 } }, title),
      h('div', { class: 'small', style: { maxWidth: '520px' } }, hint),
      h('div', { class: 'small', style: { opacity: .7 } }, 'Sementara itu Anda tetap bisa memakai pencarian manual atau scanner barcode USB.'),
      h('button', { class: 'btn primary', onclick: () => startCamera() }, 'Coba lagi'));
    renderCamBtns();
  }

  async function stopCamera(silent = false) {
    await resetScanner();
    running = false;
    guide.classList.add('hidden');
    caps.zoom = null; caps.torch = false;
    camWrap.style.maxWidth = '';
    camWrap.classList.remove('fit-asli', 'fit-penuh');
    resInfo.textContent = '';
    renderCamOpts();
    if (!silent) {
      placeholder.classList.remove('hidden');
      placeholder.replaceChildren(h('div', { style: { fontSize: '3rem' } }, '📷'), h('button', { class: 'btn primary lg', onclick: () => startCamera() }, 'Mulai scan'));
    }
    renderCamBtns();
  }

  async function switchCamera() {
    if (cameras.length < 2) return;
    camIndex = (camIndex + 1) % cameras.length;
    localStorage.setItem('camera-id', cameras[camIndex].id);
    await stopCamera(true);
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

  updateCount(); renderRecent(); renderCamBtns(); renderCamOpts(); updatePending();
  if (!navigator.onLine) onOffline();
  if (localStorage.getItem('scan-autostart') === '1') startCamera();

  return () => {
    if (guideRO) guideRO.disconnect(); else window.removeEventListener('resize', sizeGuide);
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
