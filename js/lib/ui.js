// Utilitas UI kecil tanpa framework.

// append/replaceChildren/prepend bawaan browser mengubah null menjadi teks "null".
// Patch kecil ini mengabaikan null/undefined/false dan meratakan array, sehingga
// pola `kondisi ? elemen : null` aman dipakai di seluruh aplikasi.
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const m of ['append', 'prepend', 'replaceChildren']) {
    const orig = proto[m];
    if (!orig || orig.__patched) continue;
    const patched = function (...nodes) {
      return orig.apply(this, nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
    };
    patched.__patched = true;
    proto[m] = patched;
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Membuat elemen DOM: h('div', {class:'x', onclick: fn}, 'teks', childNode) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  appendChildren(el, children);
  return el;
}
function appendChildren(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, type = '') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = h('div', { class: 'toast ' + type, role: 'status' }, msg);
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => t.remove(), 3000);
}

/**
 * modal({ title, body: Node|string, actions:[{label, class, onClick}], wide })
 * onClick boleh mengembalikan false (atau Promise<false>) agar modal tetap terbuka.
 */
export function modal({ title, body, actions = [], wide = false, onClose } = {}) {
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const foot = h('div', { class: 'modal-foot' });
  for (const a of actions) {
    const b = h('button', { class: 'btn ' + (a.class || ''), type: 'button' }, a.label);
    b.addEventListener('click', async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try {
        const r = await a.onClick({ close, button: b });
        if (r !== false) close();
      } catch (e) {
        toast(e.message || String(e), 'err');
      } finally { b.disabled = false; }
    });
    foot.appendChild(b);
  }
  const bodyEl = h('div', { class: 'modal-body' });
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const m = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-head' }, h('h3', null, title || ''), h('button', { class: 'btn ghost icon', 'aria-label': 'Tutup', onclick: close }, '✕')),
    bodyEl, actions.length ? foot : null);
  const backdrop = h('div', { class: 'modal-backdrop' }, m);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  const first = m.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return { close, el: m, body: bodyEl };
}

export function confirmDialog(message, { okLabel = 'Ya, lanjutkan', danger = false, title = 'Konfirmasi' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title,
      body: h('p', null, message),
      onClose: () => { if (!done) resolve(false); },
      actions: [
        { label: 'Batal', onClick: () => { done = true; resolve(false); } },
        { label: okLabel, class: danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); } },
      ],
    });
  });
}

export function promptDialog(title, { label = '', value = '', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', value, placeholder });
    let done = false;
    modal({
      title,
      body: h('label', { class: 'field' }, label ? h('span', { class: 'lbl' }, label) : null, input),
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: 'Batal', onClick: () => { done = true; resolve(null); } },
        { label: 'OK', class: 'primary', onClick: () => { done = true; resolve(input.value.trim()); } },
      ],
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.closest('.modal').querySelector('.modal-foot .primary').click(); } });
  });
}

const LOCALE = 'id-ID';
export function fmtDate(d) {
  if (!d) return '';
  const dt = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
  return dt.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
export function fmtTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
export function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function hhmm(t) { return t ? String(t).slice(0, 5) : ''; }

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'field';
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function downloadDataUrl(dataUrl, filename) {
  const a = h('a', { href: dataUrl, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
}

export function spinner(text = 'Memuat…') {
  return h('div', { class: 'boot', style: { minHeight: '40vh' } }, h('div', { class: 'spinner' }), h('p', null, text));
}

export function errorBox(msg) {
  return h('div', { class: 'empty' }, h('div', { class: 'big' }, '⚠️'), h('p', null, msg));
}

export function switchEl(checked, label, onchange) {
  const input = h('input', { type: 'checkbox', checked: !!checked, onchange: (e) => onchange && onchange(e.target.checked) });
  return { el: h('label', { class: 'switch' }, input, h('span', { class: 'track' }), h('span', null, label)), input };
}

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => toast('Disalin ke clipboard', 'ok'));
  }
  const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Disalin ke clipboard', 'ok'); } catch (e) { toast('Gagal menyalin', 'err'); }
  ta.remove();
  return Promise.resolve();
}

export function navigate(path) { location.hash = '#' + path; }

export function baseUrl() { return location.origin + location.pathname; }

export function errMsg(e) {
  if (!e) return 'Terjadi kesalahan';
  const m = e.message || e.error_description || String(e);
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Tidak ada koneksi ke server. Periksa internet Anda.';
  if (/Invalid login credentials/i.test(m)) return 'Email atau password salah.';
  if (/Email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Cek kotak masuk Anda.';
  if (/User already registered/i.test(m)) return 'Email sudah terdaftar. Silakan masuk.';
  if (/row-level security/i.test(m)) return 'Anda tidak punya izin untuk tindakan ini.';
  return m;
}
