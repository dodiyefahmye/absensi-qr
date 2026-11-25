// Halaman e-ticket publik untuk peserta (link dari WhatsApp/email) + check-in mandiri (mode Campuran).
import * as api from '../lib/api.js';
import { h, errMsg, fmtTime, downloadBlob, modal, toast } from '../lib/ui.js';
import { applyTheme } from '../lib/theme.js';
import { safeFileName } from '../lib/qr.js';
import { renderTicket } from '../lib/ticket.js';
import { loadScanner } from '../lib/vendor.js';
import { deviceId } from '../lib/offline.js';
import { verifyPrompt } from '../lib/rules.js';

/** Ambil token acara & kode dari isi QR layar: ...#/f/<token>?c=<kode> */
export function parseEventQR(text) {
  const m = String(text || '').match(/#\/f\/([A-Za-z0-9_-]+)(?:\?(?:[^#]*&)?c=([A-Za-z0-9]+))?/);
  return m ? { eventToken: m[1], code: m[2] || null } : null;
}

export const SELF_MSG = {
  duplicate: 'Anda sudah tercatat hadir sebelumnya.',
  not_allowed: 'Check-in untuk Anda dilakukan oleh panitia. Silakan tunjukkan e-ticket ini di meja registrasi.',
  closed: 'Absensi belum dibuka atau sudah ditutup.',
  expired_code: 'QR/kode sudah berganti. Silakan scan ulang QR yang sedang tampil di layar.',
  wrong_event: 'QR yang dipindai bukan milik acara ini.',
  invalid: 'E-ticket tidak valid.',
  no_session: 'Belum ada sesi absensi yang sedang berlangsung. Coba lagi saat sesi dimulai.',
  verify_required: 'Isi data verifikasi terlebih dahulu.',
  verify_failed: 'Data verifikasi tidak cocok dengan data pendaftaran.',
  verify_locked: 'Terlalu banyak percobaan salah. Coba lagi 15 menit lagi, atau check-in melalui panitia.',
  verify_unavailable: 'Data verifikasi Anda belum tercatat. Silakan check-in melalui panitia di meja registrasi.',
  not_in_session: 'Anda tidak terdaftar di sesi yang sedang berlangsung.',
};

export default async function ticket(root, { params }) {
  const page = h('div', { style: { padding: '1.5rem 1rem' } });
  root.appendChild(page);
  let data;
  try { data = await api.getTicket(params.token); } catch (e) {
    page.append(h('div', { class: 'card center narrow container' }, h('h2', null, 'Gagal memuat tiket'), h('p', { class: 'muted' }, errMsg(e))));
    return;
  }
  if (!data) {
    page.append(h('div', { class: 'card center container narrow' }, h('h2', null, 'Tiket tidak ditemukan'), h('p', { class: 'muted' }, 'Link tiket tidak valid atau sudah diganti panitia.')));
    return;
  }
  const ev = data.event;
  applyTheme(page, ev.theme);
  document.title = 'E-ticket — ' + ev.name;
  // ingat tiket di HP ini, agar scan QR layar dengan kamera biasa langsung mengenali peserta
  try { localStorage.setItem('myticket:' + ev.id, JSON.stringify({ token: params.token, name: data.participant.name })); } catch (e) { /* */ }

  const canvas = h('canvas', { class: 'ticket-canvas' });
  const p = { ...data.participant };
  const statusBox = h('div', { class: 'center', style: { marginBottom: '1rem' } });
  const sessionsBox = h('div', { style: { maxWidth: '380px', margin: '0 auto 1rem' } });
  const hasSessions = () => (data.sessions || []).length > 0;
  function renderSessions() {
    if (!hasSessions()) { sessionsBox.replaceChildren(); return; }
    const now = Date.now();
    sessionsBox.replaceChildren(h('div', { class: 'card', style: { background: '#fff', color: '#0f172a', padding: '.9rem 1rem' } },
      h('b', null, '🗓 Sesi absensi Anda'),
      h('ul', { style: { listStyle: 'none', padding: 0, margin: '.5rem 0 0' } }, data.sessions.map((x) => {
        const live = now >= +new Date(x.starts_at) && now <= +new Date(x.ends_at);
        const past = now > +new Date(x.ends_at);
        const st = x.checked_in_at ? (x.is_late ? ['⏰', 'Terlambat ' + fmtTime(x.checked_in_at).slice(0, 5), '#d97706'] : ['✓', 'Hadir ' + fmtTime(x.checked_in_at).slice(0, 5), '#16a34a'])
          : live ? ['●', 'Sedang berlangsung', '#2563eb'] : past ? ['✕', 'Tidak hadir', '#dc2626'] : ['○', 'Akan datang', '#64748b'];
        const when = new Date(x.starts_at).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        return h('li', { style: { display: 'flex', gap: '.6rem', alignItems: 'center', padding: '.45rem 0', borderBottom: '1px solid #eef2f7' } },
          h('span', { style: { color: st[2], fontWeight: 900, width: '1.2rem', textAlign: 'center' } }, st[0]),
          h('span', { style: { flex: 1, minWidth: 0 } }, h('div', { style: { fontWeight: 700 } }, x.name), h('div', { style: { fontSize: '.78rem', color: '#64748b' } }, when)),
          h('span', { style: { fontSize: '.8rem', fontWeight: 700, color: st[2], whiteSpace: 'nowrap' } }, st[1]));
      }))));
  }
  async function reloadTicket() {
    try { const d = await api.getTicket(params.token); if (d) { data = d; checkedAt = d.checked_in_at; renderStatus(); renderSessions(); } } catch (e) { /* */ }
  }
  let checkedAt = data.checked_in_at;
  const hybridSelf = ev.mode === 'hybrid' && ev.settings?.self_checkin;

  const infoCard = (title, text) => h('div', { class: 'card', style: { maxWidth: '380px', margin: '0 auto', background: '#fff', color: '#0f172a' } },
    h('b', null, title), h('div', { class: 'small', style: { color: '#64748b' } }, text));
  function renderStatus() {
    const sesi = data.session ? ` (${data.session.name})` : '';
    if (checkedAt) {
      statusBox.replaceChildren(h('span', { class: 'badge ok', style: { fontSize: '1rem', padding: '.5rem 1rem' } }, `✓ Sudah check-in${sesi} pukul ${fmtTime(checkedAt)}`));
    } else if (hybridSelf && data.self_checkin_allowed && hasSessions() && !data.session) {
      statusBox.replaceChildren(h('div', { class: 'card', style: { maxWidth: '380px', margin: '0 auto', background: '#fff', color: '#0f172a' } },
        h('b', null, 'Belum ada sesi yang berlangsung'), h('div', { class: 'small', style: { color: '#64748b' } }, 'Tombol check-in akan muncul saat sesi dimulai. Muat ulang halaman ini nanti.')));
    } else if (hybridSelf && data.self_checkin_allowed) {
      statusBox.replaceChildren(
        h('button', { class: 'btn primary lg wrap checkin-btn', onclick: openSelfCheckin },
          h('span', { class: 'cb-main' }, '📍 Saya sudah tiba, Check-in'),
          data.session ? h('span', { class: 'cb-sub' }, '🗓 ' + data.session.name) : null),
        h('div', { class: 'small', style: { opacity: .75, marginTop: '.5rem' } }, 'Tekan tombol ini saat sudah di lokasi, lalu scan QR yang tampil di layar acara.'));
    } else if (ev.mode === 'event_qr') {
      statusBox.replaceChildren(infoCard('Absensi lewat QR di layar acara', 'Saat di lokasi, scan QR yang tampil di layar/proyektor acara dengan kamera HP, lalu isi formulir daftar hadir.'));
    } else {
      statusBox.replaceChildren(infoCard('Check-in melalui panitia', 'Tunjukkan QR di bawah ini kepada panitia di meja registrasi.'));
    }
  }

  function success(info) {
    checkedAt = info.checked_in_at || new Date().toISOString();
    renderStatus(); reloadTicket();
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    modal({
      title: 'Check-in berhasil',
      body: h('div', { class: 'result-ok' }, h('div', { class: 'icon' }, '✓'),
        h('h2', null, info.name || p.name),
        info.session ? h('p', { style: { fontWeight: 700 } }, '🗓 ' + info.session.name) : null,
        h('p', null, `Tercatat hadir pukul ${fmtTime(checkedAt)}`),
        info.is_late ? h('p', null, h('span', { class: 'badge warn', style: { fontSize: '.95rem' } }, '⏰ Terlambat')) : null,
        h('p', { class: 'muted' }, ev.settings?.success_message || 'Selamat datang, terima kasih atas kehadiran Anda.')),
      actions: [{ label: 'Tutup', class: 'primary' }],
    });
  }

  async function submit(eventToken, code, verify) {
    const r = await api.selfCheckIn(params.token, eventToken, code, deviceId(), verify);
    if (r.status === 'ok') return { done: true, r };
    if (r.status === 'duplicate') { checkedAt = r.checked_in_at; renderStatus(); return { done: true, r, msg: SELF_MSG.duplicate }; }
    let msg = SELF_MSG[r.status] || 'Check-in gagal.';
    if (r.status === 'verify_failed' && r.attempts_left !== undefined) msg += ` Sisa percobaan: ${r.attempts_left}.`;
    return { done: false, msg, status: r.status, fatal: ['not_allowed', 'closed', 'invalid', 'verify_locked', 'verify_unavailable'].includes(r.status) };
  }

  async function openSelfCheckin() {
    let qr = null, busy = false, lastText = '';
    const reader = h('div', { id: 'self-reader', style: { width: '100%', minHeight: '220px', background: '#000', borderRadius: '12px', overflow: 'hidden' } });
    const msg = h('div', { class: 'small', style: { minHeight: '1.4em', marginTop: '.5rem', fontWeight: 600 } }, 'Arahkan kamera ke QR di layar acara…');
    const codeIn = h('input', { type: 'text', placeholder: 'mis. A1B2C3D4', maxlength: 8, style: { textTransform: 'uppercase', letterSpacing: '.15em', fontFamily: 'ui-monospace, monospace' } });
    const stop = async () => { try { if (qr) await qr.stop(); } catch (e) { /* */ } try { if (qr) qr.clear(); } catch (e) { /* */ } qr = null; };
    const vp = verifyPrompt(ev);
    const verifyIn = vp ? h('input', { type: vp.inputType, placeholder: vp.placeholder, maxlength: vp.maxlength, inputmode: vp.inputmode, autocomplete: 'off',
      style: { fontSize: '1.2rem', textAlign: 'center', letterSpacing: vp.maxlength === 4 ? '.4em' : 'normal' } }) : null;
    const verifyBox = vp ? h('div', { class: 'card flat', style: { padding: '.8rem', background: '#f8fafc', borderColor: '#cbd5e1' } },
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, '🔐 Verifikasi: ' + vp.label), verifyIn),
      h('div', { class: 'small muted' }, 'Isi dulu, lalu scan QR di layar.')) : null;
    const verifyVal = () => (verifyIn ? verifyIn.value.trim() : null);

    const handle = async (eventToken, code) => {
      if (busy) return;
      if (vp && !verifyVal()) { msg.style.color = 'var(--err)'; msg.textContent = '🔐 Isi ' + vp.label + ' terlebih dahulu.'; verifyIn.focus(); return; }
      if (vp && vp.maxlength === 4 && verifyVal().length !== 4) { msg.style.color = 'var(--err)'; msg.textContent = 'Isi tepat 4 digit/karakter.'; verifyIn.focus(); return; }
      busy = true; msg.style.color = ''; msg.textContent = 'Memproses…';
      try {
        const res = await submit(eventToken, code, verifyVal());
        if (res.done) { await stop(); m.close(); if (res.r.status === 'ok') success(res.r); else toast(res.msg, 'warn'); return; }
        msg.style.color = 'var(--err)'; msg.textContent = res.msg;
        if (res.status === 'verify_failed' && verifyIn) { verifyIn.value = ''; verifyIn.focus(); }
        if (res.fatal) { await stop(); }
      } catch (e) { msg.style.color = 'var(--err)'; msg.textContent = errMsg(e); }
      setTimeout(() => { busy = false; }, 1500);
    };

    const m = modal({
      title: 'Check-in mandiri',
      body: h('div', { class: 'stack' },
        h('p', { class: 'small muted', style: { margin: 0 } }, `Check-in sebagai ${p.name}. Scan QR yang sedang tampil di layar/proyektor acara.`),
        verifyBox, reader, msg,
        h('div', { class: 'small muted', style: { marginTop: '.5rem' } }, 'Kamera tidak bisa dipakai? Ketik kode yang tertulis di bawah QR layar:'),
        h('div', { class: 'row' }, codeIn, h('button', { class: 'btn primary', onclick: () => {
          const c = codeIn.value.trim().toUpperCase();
          if (c.length < 6) { msg.style.color = 'var(--err)'; msg.textContent = 'Kode terdiri dari 8 huruf/angka.'; return; }
          handle(null, c);
        } }, 'Kirim kode'))),
      onClose: () => { stop(); },
    });

    try {
      const Html5Qrcode = await loadScanner();
      qr = new Html5Qrcode('self-reader', { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
      await qr.start({ facingMode: 'environment' }, { fps: 10, disableFlip: false }, (text) => {
        if (busy || text === lastText) return;
        lastText = text; setTimeout(() => { if (lastText === text) lastText = ''; }, 2500);
        const info = parseEventQR(text);
        if (!info) { msg.style.color = 'var(--err)'; msg.textContent = 'Ini bukan QR check-in acara. Scan QR di layar acara.'; return; }
        handle(info.eventToken, info.code);
      }, () => {});
    } catch (e) {
      reader.replaceChildren(h('div', { style: { color: '#cbd5e1', padding: '1.2rem', textAlign: 'center' } }, 'Kamera tidak dapat dibuka. Izinkan akses kamera, atau ketik kode di bawah.'));
    }
  }

  page.append(sessionsBox, statusBox, canvas,
    h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1rem' } },
      h('button', { class: 'btn', onclick: () => canvas.toBlob((b) => downloadBlob(b, `tiket_${safeFileName(p.name)}.png`)) }, '⬇ Simpan tiket')),
    h('p', { class: 'center small', style: { opacity: .7, marginTop: '1rem' } }, 'Perbesar kecerahan layar saat menunjukkan QR kepada panitia.'));
  renderStatus(); renderSessions();
  await renderTicket(p, ev, canvas);
}
