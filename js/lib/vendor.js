// Pemuat library pihak ketiga dari CDN (dimuat hanya saat dibutuhkan).
// Bisa ditimpa lewat window.APP_CDN (misalnya untuk self-host / pengujian).
export const CDN = Object.assign({
  supabase: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
  qrcode: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
  html5qrcode: 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs',
  jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm',
  autotable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/+esm',
  jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm',
  sortable: 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/+esm',
}, window.APP_CDN || {});

const cache = new Map();
function once(key, fn) {
  if (!cache.has(key)) {
    const p = fn().catch((e) => { cache.delete(key); throw e; });
    cache.set(key, p);
  }
  return cache.get(key);
}

export function loadScript(src, globalName) {
  return new Promise((resolve, reject) => {
    if (globalName && window[globalName]) return resolve(window[globalName]);
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve(globalName ? window[globalName] : true);
    s.onerror = () => reject(new Error('Gagal memuat ' + src + '. Periksa koneksi internet.'));
    document.head.appendChild(s);
  });
}

export const loadSupabase = () => once('supabase', () => import(CDN.supabase));
export const loadQRGen = () => once('qrcode', () => loadScript(CDN.qrcode, 'qrcode'));
export const loadScanner = () => once('html5qrcode', () => loadScript(CDN.html5qrcode, 'Html5Qrcode'));
export const loadXLSX = () => once('xlsx', () => import(CDN.xlsx));
export const loadJSZip = () => once('jszip', async () => (await import(CDN.jszip)).default);
export const loadSortable = () => once('sortable', async () => (await import(CDN.sortable)).default);
export const loadPDF = () => once('pdf', async () => {
  const m = await import(CDN.jspdf);
  const at = await import(CDN.autotable);
  return { jsPDF: m.jsPDF || m.default, autoTable: at.default || at.autoTable };
});
