// Formulir publik (mode QR Acara) — diakses peserta tanpa login.
import * as api from '../lib/api.js';
import { h, errMsg, fmtDate, hhmm, fmtTime } from '../lib/ui.js';
import { applyTheme } from '../lib/theme.js';
import { renderForm } from '../lib/form.js';
import { deviceId } from '../lib/offline.js';

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
    meta ? h('div', { class: 'meta' }, meta) : null);
  const card = h('div', { class: 't-card' });
  page.append(hero, h('div', { class: 't-accent' }), h('div', { style: { padding: '0 1rem' } }, card), h('div', { class: 't-footer' }, ev.organizer || ''));

  if (ev.mode !== 'event_qr') {
    card.append(h('div', { class: 'result-ok' }, h('div', { class: 'icon warn' }, 'i'), h('h2', null, 'Absensi lewat panitia'), h('p', null, 'Acara ini memakai e-ticket QR. Tunjukkan e-ticket Anda kepada panitia di meja registrasi.')));
    return;
  }
  if (!ev.is_open) {
    card.append(h('div', { class: 'result-ok' }, h('div', { class: 'icon err' }, '🔒'), h('h2', null, 'Absensi ditutup'), h('p', null, 'Daftar hadir belum dibuka atau sudah ditutup oleh panitia.')));
    return;
  }

  const prev = JSON.parse(localStorage.getItem(storeKey) || 'null');
  if (prev && !query.again) return success(prev);

  const form = renderForm(ev.form_schema, JSON.parse(localStorage.getItem('form-memory') || '{}'));
  const btn = h('button', { class: 'btn primary block lg', type: 'submit', style: { marginTop: '1.25rem' } }, 'Kirim Kehadiran');
  const errBox = h('div', { class: 'field-error', style: { marginTop: '.6rem', textAlign: 'center', fontSize: '.9rem' } });
  card.append(
    h('h2', { style: { marginBottom: '.25rem' } }, 'Daftar Hadir'),
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
        const info = { name: r.name, at: r.checked_in_at };
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
      }[r.status] || 'Gagal mengirim.';
      errBox.textContent = msg;
    } catch (err) {
      errBox.textContent = errMsg(err);
    }
    btn.disabled = false; btn.textContent = 'Kirim Kehadiran';
  }

  function success(info) {
    card.replaceChildren(h('div', { class: 'result-ok' },
      h('div', { class: 'icon' }, '✓'),
      h('h2', null, 'Kehadiran tercatat'),
      h('p', { style: { fontSize: '1.15rem', fontWeight: 700 } }, info.name),
      h('p', { style: { color: '#64748b' } }, `Pukul ${fmtTime(info.at)}`),
      h('p', null, ev.settings?.success_message || 'Terima kasih atas kehadiran Anda.'),
      h('a', { href: `#/f/${params.token}?again=1${query.c ? '&c=' + encodeURIComponent(query.c) : ''}`, class: 'small', style: { color: '#64748b' }, onclick: () => localStorage.removeItem(storeKey) }, 'Isi untuk orang lain')));
  }
}

function message(page, icon, title, text) {
  page.append(h('div', { class: 'container narrow' }, h('div', { class: 'card result-ok', style: { marginTop: '10vh' } },
    h('div', { class: 'icon err' }, icon), h('h2', null, title), h('p', { class: 'muted' }, text))));
}
