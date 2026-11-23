// Halaman e-ticket publik untuk peserta (link dari WhatsApp/email).
import * as api from '../lib/api.js';
import { h, errMsg, fmtTime, downloadBlob } from '../lib/ui.js';
import { applyTheme } from '../lib/theme.js';
import { renderTicket, safeFileName } from '../lib/qr.js';

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
  applyTheme(page, data.event.theme);
  document.title = 'E-ticket — ' + data.event.name;
  const canvas = h('canvas', { class: 'ticket-canvas' });
  const p = { ...data.participant };
  page.append(
    data.checked_in_at ? h('div', { class: 'center', style: { marginBottom: '1rem' } }, h('span', { class: 'badge ok', style: { fontSize: '.95rem', padding: '.4rem .9rem' } }, `✓ Sudah check-in pukul ${fmtTime(data.checked_in_at)}`)) : null,
    canvas,
    h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1rem' } },
      h('button', { class: 'btn primary', onclick: () => canvas.toBlob((b) => downloadBlob(b, `tiket_${safeFileName(p.name)}.png`)) }, '⬇ Simpan tiket')),
    h('p', { class: 'center small', style: { opacity: .7, marginTop: '1rem' } }, 'Perbesar kecerahan layar saat menunjukkan QR kepada panitia.'));
  await renderTicket(p, data.event, canvas);
}
