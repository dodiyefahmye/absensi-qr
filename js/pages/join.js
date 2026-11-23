// Bergabung ke acara sebagai operator lewat link undangan.
import * as api from '../lib/api.js';
import { h, toast, errMsg, navigate } from '../lib/ui.js';
import { usesParticipantScan } from '../lib/rules.js';

export default async function join(root, { params }) {
  const box = h('div', { class: 'container narrow' }, h('div', { class: 'card center', style: { marginTop: '8vh' } }, h('div', { class: 'spinner', style: { margin: '1rem auto' } }), h('p', null, 'Bergabung ke acara…')));
  root.appendChild(box);
  try {
    const r = await api.joinEvent(params.code);
    if (r?.status !== 'ok') throw new Error('Kode undangan tidak valid atau acara sudah nonaktif.');
    toast(`Anda sekarang operator "${r.name}"`, 'ok');
    const ev = await api.getEvent(r.event_id);
    navigate(`/event/${r.event_id}/${usesParticipantScan(ev) ? 'scan' : 'display'}`);
  } catch (e) {
    box.replaceChildren(h('div', { class: 'card center', style: { marginTop: '8vh' } }, h('h2', null, 'Gagal bergabung'), h('p', { class: 'muted' }, errMsg(e)), h('a', { class: 'btn', href: '#/' }, 'Ke beranda')));
  }
}
