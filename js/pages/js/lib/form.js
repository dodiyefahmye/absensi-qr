// Renderer formulir dinamis berdasarkan form_schema (JSON).
import { h } from './ui.js';

export const FIELD_TYPES = {
  text:      { label: 'Teks singkat', icon: '🔤' },
  textarea:  { label: 'Paragraf', icon: '📝' },
  number:    { label: 'Angka', icon: '🔢' },
  email:     { label: 'Email', icon: '✉️' },
  tel:       { label: 'No. HP', icon: '📱' },
  date:      { label: 'Tanggal', icon: '📅' },
  select:    { label: 'Dropdown', icon: '🔽', options: true },
  radio:     { label: 'Pilihan ganda', icon: '🔘', options: true },
  checkbox:  { label: 'Kotak centang', icon: '☑️', options: true },
  signature: { label: 'Tanda tangan', icon: '✍️' },
  photo:     { label: 'Foto', icon: '📷' },
};

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * renderForm(schema, values) → { el, getValues(), validate() }
 * options.skip: daftar key yang tidak ditampilkan
 */
export function renderForm(schema, values = {}, options = {}) {
  const skip = new Set(options.skip || []);
  const controls = [];
  const el = h('div', { class: 'stack dyn-form' });

  for (const f of schema || []) {
    if (!f || !f.key || skip.has(f.key)) continue;
    const ctrl = buildControl(f, values[f.key]);
    controls.push(ctrl);
    el.appendChild(ctrl.wrap);
  }

  return {
    el,
    getValues() {
      const out = {};
      for (const c of controls) out[c.field.key] = c.get();
      return out;
    },
    validate() {
      let ok = true, first = null;
      for (const c of controls) {
        const msg = c.check();
        c.wrap.classList.toggle('invalid', !!msg);
        c.err.textContent = msg || '';
        if (msg && !first) first = c.wrap;
        if (msg) ok = false;
      }
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return ok;
    },
  };
}

function buildControl(f, value) {
  const id = 'f_' + f.key + '_' + Math.random().toString(36).slice(2, 6);
  const label = h('span', { class: 'lbl' }, f.label || f.key, f.required ? h('span', { class: 'req' }, ' *') : null);
  const err = h('div', { class: 'field-error' });
  const help = f.help ? h('div', { class: 'help' }, f.help) : null;
  const opts = (f.options || []).filter(Boolean);
  let input, get, extra;

  switch (f.type) {
    case 'textarea':
      input = h('textarea', { id, placeholder: f.placeholder || '' }, value || '');
      get = () => input.value.trim();
      break;
    case 'select':
      input = h('select', { id }, h('option', { value: '' }, f.placeholder || '— Pilih —'), opts.map((o) => h('option', { value: o }, o)));
      input.value = value || '';
      get = () => input.value;
      break;
    case 'radio': {
      const name = id;
      input = h('div', { class: 'options-list' }, opts.map((o) =>
        h('label', { class: 'check' }, h('input', { type: 'radio', name, value: o, checked: value === o }), h('span', null, o))));
      get = () => input.querySelector('input:checked')?.value || '';
      break;
    }
    case 'checkbox': {
      const vals = Array.isArray(value) ? value : [];
      if (opts.length) {
        input = h('div', { class: 'options-list' }, opts.map((o) =>
          h('label', { class: 'check' }, h('input', { type: 'checkbox', value: o, checked: vals.includes(o) }), h('span', null, o))));
        get = () => Array.from(input.querySelectorAll('input:checked')).map((x) => x.value);
      } else {
        const cb = h('input', { type: 'checkbox', checked: !!value });
        input = h('label', { class: 'check' }, cb, h('span', null, f.placeholder || 'Ya'));
        get = () => cb.checked;
      }
      break;
    }
    case 'signature': {
      const pad = signaturePad(value);
      input = pad.el; get = pad.get;
      break;
    }
    case 'photo': {
      const ph = photoInput(value);
      input = ph.el; get = ph.get;
      break;
    }
    default: {
      const type = ['number', 'email', 'tel', 'date'].includes(f.type) ? f.type : 'text';
      input = h('input', { id, type, placeholder: f.placeholder || '', value: value ?? '', inputmode: f.type === 'tel' ? 'tel' : undefined, autocomplete: f.key === 'nama' ? 'name' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'off' });
      get = () => (f.type === 'number' && input.value !== '' ? Number(input.value) : input.value.trim());
    }
  }

  const check = () => {
    const v = get();
    if (f.required && (isEmpty(v) || v === false)) return `${f.label || f.key} wajib diisi`;
    if (!isEmpty(v) && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Format email tidak valid';
    if (!isEmpty(v) && f.type === 'tel' && !/^[+\d][\d\s\-]{6,}$/.test(v)) return 'Nomor HP tidak valid';
    return '';
  };

  const wrap = h('div', { class: 'field' }, h('label', { for: id }, label), input, extra, help, err);
  const clear = () => { if (wrap.classList.contains('invalid') && !check()) { wrap.classList.remove('invalid'); err.textContent = ''; } };
  wrap.addEventListener('input', clear);
  wrap.addEventListener('change', clear);
  wrap.addEventListener('pointerup', () => setTimeout(clear, 0));
  return { field: f, wrap, get, check, err };
}

function signaturePad(initial) {
  const canvas = h('canvas', { class: 'sigpad' });
  let drawn = !!initial, ctx, last = null;
  const clearBtn = h('button', { type: 'button', class: 'btn sm', onclick: () => { setup(); drawn = false; } }, 'Hapus');
  const el = h('div', null, canvas, h('div', { class: 'row', style: { marginTop: '.4rem' } }, h('span', { class: 'small muted' }, 'Tanda tangan di kotak di atas'), h('span', { class: 'spacer' }), clearBtn));

  function setup() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(300, r.width) * dpr;
    canvas.height = 170 * dpr;
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
  }
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (e) => { if (!ctx) setup(); canvas.setPointerCapture(e.pointerId); last = pos(e); });
  canvas.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p; drawn = true;
  });
  const end = () => { last = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  requestAnimationFrame(() => {
    setup();
    if (initial) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, canvas.getBoundingClientRect().width, 170); img.src = initial; }
  });

  return {
    el,
    get: () => {
      if (!drawn) return '';
      // simpan versi kecil agar hemat database
      const out = document.createElement('canvas');
      const w = 400, hgt = Math.round(400 * canvas.height / canvas.width);
      out.width = w; out.height = hgt;
      const c = out.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, w, hgt); c.drawImage(canvas, 0, 0, w, hgt);
      return out.toDataURL('image/png');
    },
  };
}

function photoInput(initial) {
  let dataUrl = initial || '';
  const prev = h('img', { class: 'photo-prev' + (dataUrl ? '' : ' hidden'), src: dataUrl || undefined, alt: 'Pratinjau foto' });
  const input = h('input', { type: 'file', accept: 'image/*', capture: 'user' });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    if (!f) return;
    dataUrl = await compressImage(f, 640, 0.7);
    prev.src = dataUrl; prev.classList.remove('hidden');
  });
  return { el: h('div', null, input, prev), get: () => dataUrl };
}

export function compressImage(file, maxSize = 640, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maxSize / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Ubah nilai field menjadi teks (untuk tabel/ekspor). */
export function displayValue(field, v) {
  if (isEmpty(v)) return '';
  if (field?.type === 'signature' || field?.type === 'photo') return typeof v === 'string' && v.startsWith('data:') ? '(gambar)' : String(v);
  if (Array.isArray(v)) return v.join(', ');
  if (v === true) return 'Ya';
  if (v === false) return 'Tidak';
  return String(v);
}
