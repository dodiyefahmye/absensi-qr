// Komponen form builder: tambah/hapus/urutkan field secara dinamis.
import { h, slugify, modal } from '../lib/ui.js';
import { FIELD_TYPES, renderForm } from '../lib/form.js';
import { loadSortable } from '../lib/vendor.js';
import { nameField } from '../lib/theme.js';

export function formBuilder(initial, onChange) {
  let fields = JSON.parse(JSON.stringify(initial || []));
  if (!fields.some((f) => f.key === 'nama')) fields.unshift(nameField());
  fields.forEach((f) => { if (f.key === 'nama') { f.locked = true; f.required = true; f.type = 'text'; } });
  let openKey = null;

  const list = h('div', { class: 'fb-list' });
  const types = h('div', { class: 'fb-types' }, Object.entries(FIELD_TYPES).map(([type, t]) =>
    h('button', { type: 'button', class: 'btn sm', onclick: () => add(type) }, `${t.icon} ${t.label}`)));
  const el = h('div', { class: 'stack' },
    list,
    h('div', { class: 'card flat', style: { padding: '1rem' } }, h('div', { class: 'small muted', style: { marginBottom: '.5rem', fontWeight: 600 } }, 'Tambah field:'), types));

  const changed = () => onChange && onChange(get());

  function uniqueKey(base) {
    let k = slugify(base), i = 2;
    while (fields.some((f) => f.key === k)) k = slugify(base) + '_' + i++;
    return k;
  }

  function add(type) {
    const label = FIELD_TYPES[type].label;
    const f = { key: uniqueKey(label), label, type, required: false, placeholder: '', autoKey: true };
    if (FIELD_TYPES[type].options) f.options = ['Pilihan 1', 'Pilihan 2'];
    fields.push(f);
    openKey = f.key;
    render(); changed();
  }

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    [fields[i], fields[j]] = [fields[j], fields[i]];
    render(); changed();
  }

  function item(f, i) {
    const t = FIELD_TYPES[f.type] || FIELD_TYPES.text;
    const open = openKey === f.key;
    const head = h('div', { class: 'fb-head', onclick: (e) => { if (e.target.closest('button')) return; openKey = open ? null : f.key; render(); } },
      h('span', { class: 'handle', title: 'Seret untuk mengurutkan' }, '⋮⋮'),
      h('span', null, t.icon),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontWeight: 600 } }, f.label || '(tanpa label)', f.required ? h('span', { class: 'req', style: { color: 'var(--err)' } }, ' *') : null),
        h('div', { class: 'small muted' }, `${t.label} · ${f.key}`)),
      f.locked ? h('span', { class: 'badge' }, 'Wajib sistem') : null,
      h('button', { type: 'button', class: 'btn ghost icon sm', title: 'Naik', onclick: () => move(i, -1), disabled: i === 0 }, '↑'),
      h('button', { type: 'button', class: 'btn ghost icon sm', title: 'Turun', onclick: () => move(i, 1), disabled: i === fields.length - 1 }, '↓'),
      !f.locked ? h('button', { type: 'button', class: 'btn ghost icon sm', title: 'Hapus', onclick: () => { fields.splice(i, 1); render(); changed(); } }, '🗑') : null);

    const body = open ? editor(f) : null;
    return h('div', { class: 'fb-item' + (f.locked ? ' locked' : ''), dataset: { key: f.key } }, head, body);
  }

  function editor(f) {
    const set = (k, v) => { f[k] = v; changed(); };
    const labelIn = h('input', { type: 'text', value: f.label || '', oninput: (e) => {
      set('label', e.target.value);
      if (f.autoKey && e.target.value.trim()) {
        const old = f.key; f.key = '';
        f.key = uniqueKey(e.target.value);
        if (openKey === old) openKey = f.key;
        keyIn.value = f.key;
      }
    } });
    const keyIn = h('input', { type: 'text', value: f.key, disabled: !!f.locked, class: 'mono',
      onchange: (e) => { const k = slugify(e.target.value); if (k !== f.key && fields.some((x) => x.key === k)) { e.target.value = f.key; return; } f.autoKey = false; openKey = k; set('key', k); render(); } });
    const typeSel = h('select', { disabled: !!f.locked, onchange: (e) => {
      f.type = e.target.value;
      if (FIELD_TYPES[f.type].options && !f.options?.length) f.options = ['Pilihan 1', 'Pilihan 2'];
      render(); changed();
    } }, Object.entries(FIELD_TYPES).map(([k, t]) => h('option', { value: k }, t.label)));
    typeSel.value = f.type;
    const ph = h('input', { type: 'text', value: f.placeholder || '', oninput: (e) => set('placeholder', e.target.value) });
    const help = h('input', { type: 'text', value: f.help || '', oninput: (e) => set('help', e.target.value) });
    const req = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!f.required, disabled: !!f.locked, onchange: (e) => { set('required', e.target.checked); render(); } }), h('span', null, 'Wajib diisi'));
    const opts = FIELD_TYPES[f.type]?.options
      ? h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Pilihan (satu per baris)'),
        h('textarea', { oninput: (e) => set('options', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)) }, (f.options || []).join('\n')))
      : null;
    return h('div', { class: 'fb-body stack' },
      h('div', { class: 'grid grid-2' },
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Label'), labelIn),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Tipe'), typeSel)),
      h('div', { class: 'grid grid-2' },
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Placeholder / teks bantu'), ph),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Kunci data (key)'), keyIn, h('div', { class: 'help' }, 'Dipakai sebagai nama kolom import/ekspor.'))),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Keterangan di bawah field'), help),
      opts, req);
  }

  let sortable = null;
  function render() {
    list.replaceChildren(...fields.map(item));
    if (sortable) { sortable.destroy(); sortable = null; }
    loadSortable().then((Sortable) => {
      sortable = Sortable.create(list, {
        handle: '.handle', animation: 150, ghostClass: 'sortable-ghost',
        onEnd: (e) => {
          if (e.oldIndex === e.newIndex) return;
          const [m] = fields.splice(e.oldIndex, 1);
          fields.splice(e.newIndex, 0, m);
          render(); changed();
        },
      });
    }).catch(() => { /* tombol ↑↓ tetap tersedia */ });
  }

  function get() {
    return fields.map(({ locked, autoKey, ...f }) => {
      const out = { ...f };
      if (!FIELD_TYPES[f.type]?.options) delete out.options;
      if (f.key === 'nama') out.locked = true;
      return out;
    });
  }

  function preview() {
    const form = renderForm(get(), {});
    modal({ title: 'Pratinjau formulir', body: form.el, actions: [{ label: 'Uji validasi', class: 'primary', onClick: () => { form.validate(); return false; } }, { label: 'Tutup' }] });
  }

  render();
  return { el, get, preview };
}
