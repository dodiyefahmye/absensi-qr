// Pembuatan QR Code & e-ticket (canvas).
import { loadQRGen } from './vendor.js';
import { baseUrl } from './ui.js';

export const ticketUrl = (token) => `${baseUrl()}#/t/${token}`;
export const publicFormUrl = (token, code) => `${baseUrl()}#/f/${token}${code ? '?c=' + encodeURIComponent(code) : ''}`;
export const joinUrl = (code) => `${baseUrl()}#/join/${code}`;

/** Ambil token peserta dari isi QR (URL e-ticket, "ABSEN:token", atau token mentah). */
export function parseScanned(text) {
  const s = String(text || '').trim();
  const m = s.match(/#\/t\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^ABSEN:/i.test(s)) return s.slice(6).trim();
  if (/^[A-Za-z0-9_-]{6,128}$/.test(s)) return s;
  return null;
}

/** Gambar QR ke canvas. */
export async function drawQR(canvas, text, { size = 512, dark = '#000000', light = '#ffffff', margin = 2, ecl = 'M' } = {}) {
  const qrcode = await loadQRGen();
  const qr = qrcode(0, ecl);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = Math.floor(size / (n + margin * 2)) || 1;
  const px = cell * (n + margin * 2);
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = light; ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
  return canvas;
}

export async function qrDataUrl(text, opts) {
  const c = document.createElement('canvas');
  await drawQR(c, text, opts);
  return c.toDataURL('image/png');
}

export function loadImage(src, timeout = 6000) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => resolve(null), timeout);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = src;
  });
}

export function safeFileName(s) { return String(s || 'file').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'file'; }
