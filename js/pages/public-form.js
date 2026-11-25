// Halaman publik dari QR layar: formulir (mode QR Acara) atau check-in mandiri / tamu tambahan (mode Campuran).
import * as api from '../lib/api.js';
import { h, errMsg, fmtDate, hhmm, fmtTime } from '../lib/ui.js';
import { applyTheme } from '../lib/theme.js';
import { renderForm } from '../lib/form.js';
import { deviceId } from '../lib/offline.js';
import { SELF_MSG } from './ticket.js';

export default async function publicForm(root, { params, query }) {
  const page = h('div');
  root.appendChild(page);
  let ev;
  try {
    ev = await api.getPublicEvent(params.token);
  } catch (e) {
    return message(page, '⚠️', 'Gagal memuat', errMsg(e));
  }
  if (!ev) return message(page, '✕', 'Formulir tidak ditemukan', 'Link tidak valid atau acara sudah dinonaktifkan.');
  const t = applyTheme(page, ev.theme);
  document.title = ev.name;

  const storeKey = 'submitted:' + params.token;
  const meta = [ev.event_date ? fmtDate(ev.event_date) : '', ev.start_time ? `${hhmm(ev.start_time)}${ev.end_time ? '–' + hhmm(ev.end_time) : ''}` : '', ev.location].filter(Boolean).join(' · ');
  const hero = h('div', { class: 't-hero' + (t.banner_url ? ' has-banner' : ''), style: t.banner_url ? { backgroundImage: `url("${t.banner_url}")` } : null },
    t.logo_url ? h('img', { class: 't-logo', src: t.logo_url, alt: 'Logo' }) : null,
    h('h1', null, ev.name),
    meta ? h('div', { class: 'meta' }, meta) : null,
    ev.session ? h('div', { class: 'meta', style: { marginTop: '.4rem', fontWeight: 700, fontSize: '1rem' } }, '🗓 ' + ev.session.name) : null);
  const card = h('div', { class: 't-card' });
  page.append(hero, h('div', { class: 't-accent' }), h('div', { style: { padding: '0 1rem' } }, card), h('div', { class: 't-footer' }, ev.organizer || ''));

  if (ev.mode === 'participant_qr') {
    card.append(h('div', { class: 'result-ok' }, h('div', { class: 'icon warn' }, 'i'), h('h2', null, 'Absensi lewat panitia'), h('p', null, 'Acara ini memakai e-ticket QR. Tunjukkan e-ticket Anda kepada panitia di meja registrasi.')));
    return;
  }
  if (!ev.is_open) {
    card.append(h('div', { class: 'result-ok' }, h('div', { class: 'icon err' }, '🔒'), h('h2', null, 'Absensi ditutup'), h('p', null, 'Daftar hadir belum dibuka atau sudah ditutup oleh panitia.')));
    return;
  }

  if (ev.has_sessions && !ev.session) {
    card.append(h('div', { class: 'result-ok' }, h('div', { class: 'icon warn' }, '🗓'), h('h2', null, 'Belum ada sesi berlangsung'),
      h('p', null, 'Absensi dibuka sesuai jadwal sesi. Silakan scan ulang QR di layar saat sesi dimulai.')));
    return;
  }
  // status "sudah mengisi" diingat per sesi
  const prev = JSON.parse(localStorage.getItem(storeKey) || 'null');
  if (prev && !query.again && (prev.session_id || null) === (ev.session?.id || null)) return success(prev);

  if (ev.mode === 'hybrid' && !query.walkin) return hybridChooser();
  showForm();

  // ---------- mode Campuran: pilih cara check-in ----------
  function hybridChooser() {
    const selfOn = !!ev.settings?.self_checkin, walkOn = !!ev.settings?.walkin;
    let mine = null;
    try { mine = JSON.parse(localStorage.getItem('myticket:' + ev.id) || 'null'); } catch (e) { /* */ }
    const errBox = h('div', { class: 'field-error', style: { marginTop: '.6rem', textAlign: 'center', fontSize: '.95rem' } });
    const parts = [h('h2', { style: { marginBottom: '.5rem' } }, 'Check-in')];

    if (selfOn && mine?.token) {
      const btn = h('button', { class: 'btn primary block lg', style: { marginTop: '.5rem' }, onclick: async () => {
        btn.disabled = true; btn.textContent = 'Memproses…'; errBox.textContent = '';
        try {
          const r = await api.selfCheckIn(mine.token, params.token, query.c || null, deviceId());
          if (r.status === 'ok' || r.status === 'duplicate') {
            const info = { name: r.name || mine.name, at: r.checked_in_at, dup: r.status === 'duplicate', late: r.is_late, session: r.session?.name, session_id: ev.session?.id || null };
            localStorage.setItem(storeKey, JSON.stringify(info));
            return success(info);
          }
          errBox.textContent = SELF_MSG[r.status] || 'Check-in gagal.';
        } catch (e) { errBox.textContent = errMsg(e); }
        btn.disabled = false; btn.textContent = 'Check-in sekarang';
      } }, 'Check-in sekarang');
      parts.push(h('div', { class: 'card flat', style: { background: '#f8fafc', borderColor: '#e2e8f0', padding: '1rem' } },
        h('div', { style: { color: '#64748b', fontSize: '.85rem' } }, 'E-ticket di HP ini atas nama:'),
        h('div', { style: { fontSize: '1.3rem', fontWeight: 800 } }, mine.name),
        btn, errBox,
        h('a', { href: 'javascript:void 0', class: 'small', style: { color: '#64748b', display: 'block', textAlign: 'center', marginTop: '.6rem' },
          onclick: () => { localStorage.removeItem('myticket:' + ev.id); card.replaceChildren(); hybridChooser(); } }, 'Bukan saya')));
    } else if (selfOn) {
      parts.push(h('div', { class: 'card flat', style: { background: '#f8fafc', borderColor: '#e2e8f0', padding: '1rem' } },
        h('b', null, '🎫 Punya e-ticket?'),
        h('ol', { style: { margin: '.5rem 0 0', paddingLeft: '1.2rem', color: '#334155' } },
          h('li', null, 'Buka link e-ticket Anda (dari WhatsApp/email) di HP ini.'),
          h('li', null, 'Tekan tombol "Saya sudah tiba, Check-in".'),
          h('li', null, 'Scan QR yang tampil di layar.'))));
    }
    if (walkOn) {
      parts.push(h('div', { style: { marginTop: '1rem' } },
        h('a', { class: 'btn block', href: `#/f/${params.token}?walkin=1${query.c ? '&c=' + encodeURIComponent(query.c) : ''}` }, '📝 Saya tamu tidak terdaftar, isi formulir')));
    }
    if (!selfOn && !walkOn) {
      parts.push(h('div', { class: 'result-ok' }, h('div', { class: 'icon warn' }, 'i'), h('p', null, 'Check-in dilakukan oleh panitia. Silakan menuju meja registrasi dan tunjukkan e-ticket Anda.')));
    } else {
      parts.push(h('p', { class: 'small', style: { color: '#64748b', textAlign: 'center', marginTop: '1rem' } }, 'Tidak bisa check-in sendiri? Silakan ke meja registrasi panitia.'));
    }
    card.replaceChildren(...parts);
  }

  function showForm() {
  const form = renderForm(ev.form_schema, JSON.parse(localStorage.getItem('form-memory') || '{}'));
  const btn = h('button', { class: 'btn primary block lg', type: 'submit', style: { marginTop: '1.25rem' } }, 'Kirim Kehadiran');
  const errBox = h('div', { class: 'field-error', style: { marginTop: '.6rem', textAlign: 'center', fontSize: '.9rem' } });
  card.append(
    h('h2', { style: { marginBottom: '.25rem' } }, ev.mode === 'hybrid' ? 'Formulir tamu' : 'Daftar Hadir'),
    ev.description ? h('p', { style: { color: '#64748b' } }, ev.description) : h('p', { style: { color: '#64748b' } }, 'Silakan isi data berikut untuk mencatat kehadiran Anda.'),
    h('form', { onsubmit: submit, novalidate: true }, form.el, btn, errBox));

  async function submit(e) {
    e.preventDefault();
    errBox.textContent = '';
    if (!form.validate()) return;
    btn.disabled = true; btn.textContent = 'Mengirim…';
    const data = form.getValues();
    try {
      const r = await api.submitPublic(params.token, query.c || null, data, deviceId());
      if (r.status === 'ok') {
        // ingat data teks (bukan tanda tangan/foto) untuk acara berikutnya
        const mem = {};
        for (const f of ev.form_schema) if (['text', 'email', 'tel', 'number', 'select'].includes(f.type) && data[f.key]) mem[f.key] = data[f.key];
        localStorage.setItem('form-memory', JSON.stringify(mem));
        const info = { name: r.name, at: r.checked_in_at, late: r.is_late, session: r.session?.name, session_id: ev.session?.id || null };
        localStorage.setItem(storeKey, JSON.stringify(info));
        return success(info);
      }
      const msg = {
        closed: 'Absensi sudah ditutup.',
        expired_code: 'QR sudah kedaluwarsa. Silakan scan ulang QR yang tampil di layar.',
        duplicate: r.reason === 'device' ? 'Perangkat ini sudah dipakai untuk mengisi daftar hadir.' : 'Data Anda sudah tercatat sebelumnya.',
        missing_field: `Kolom "${r.field}" wajib diisi.`,
        too_large: 'Ukuran data terlalu besar (foto/tanda tangan). Coba lagi.',
        invalid: 'Formulir tidak valid.',
        walkin_disabled: 'Pendaftaran tamu tidak terdaftar sedang ditutup. Silakan ke meja registrasi panitia.',
        no_session: 'Belum ada sesi absensi yang sedang berlangsung.',
      }[r.status] || 'Gagal mengirim.';
      errBox.textContent = msg;
    } catch (err) {
      errBox.textContent = errMsg(err);
    }
    btn.disabled = false; btn.textContent = 'Kirim Kehadiran';
  }

  }

  function success(info) {
    card.replaceChildren(h('div', { class: 'result-ok' },
      h('div', { class: 'icon' }, '✓'),
      h('h2', null, info.dup ? 'Sudah tercatat sebelumnya' : 'Kehadiran tercatat'),
      h('p', { style: { fontSize: '1.15rem', fontWeight: 700 } }, info.name),
      info.session ? h('p', { style: { fontWeight: 700 } }, '🗓 ' + info.session) : null,
      h('p', { style: { color: '#64748b' } }, `Pukul ${fmtTime(info.at)}`),
      info.late ? h('p', null, h('span', { class: 'badge warn', style: { fontSize: '.95rem' } }, '⏰ Terlambat')) : null,
      h('p', null, ev.settings?.success_message || 'Terima kasih atas kehadiran Anda.'),
      h('a', { href: `#/f/${params.token}?again=1${query.c ? '&c=' + encodeURIComponent(query.c) : ''}`, class: 'small', style: { color: '#64748b' }, onclick: () => localStorage.removeItem(storeKey) }, ev.mode === 'hybrid' ? 'Check-in untuk orang lain' : 'Isi untuk orang lain')));
  }
}

function message(page, icon, title, text) {
  page.append(h('div', { class: 'container narrow' }, h('div', { class: 'card result-ok', style: { marginTop: '10vh' } },
    h('div', { class: 'icon err' }, icon), h('h2', null, title), h('p', { class: 'muted' }, text))));
}
