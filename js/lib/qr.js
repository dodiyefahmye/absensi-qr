// Pembuatan QR Code & e-ticket (canvas).
import { loadQRGen } from './vendor.js';
import { baseUrl, fmtDate, hhmm } from './ui.js';
import { normalizeTheme, contrastInk, fontStack, categoryColor } from './theme.js';

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

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, hgt, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hgt, r); ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
  ctx.arcTo(x, y + hgt, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Render e-ticket peserta ke canvas (900x1400). */
export async function renderTicket(participant, event, canvas = document.createElement('canvas')) {
  const t = normalizeTheme(event.theme);
  const W = 900, H = 1400;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const font = fontStack(t.font);
  try { await document.fonts?.load(`700 40px ${font}`); } catch (e) { /* abaikan */ }
  const ink = contrastInk(t.primary);

  // latar
  ctx.fillStyle = '#ffffff'; roundRect(ctx, 0, 0, W, H, 36); ctx.fill();
  ctx.save(); roundRect(ctx, 0, 0, W, H, 36); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W, 420);
  g.addColorStop(0, t.primary); g.addColorStop(1, shade(t.primary, -25));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 420);
  const banner = await loadImage(t.banner_url);
  if (banner) {
    const s = Math.max(W / banner.width, 420 / banner.height);
    ctx.globalAlpha = 0.35; ctx.drawImage(banner, (W - banner.width * s) / 2, (420 - banner.height * s) / 2, banner.width * s, banner.height * s); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = t.secondary; ctx.fillRect(0, 420, W, 12);
  ctx.restore();

  // logo
  let y = 60;
  const logo = await loadImage(t.logo_url);
  if (logo) {
    const lh = 110, lw = Math.min(260, logo.width * (lh / logo.height));
    ctx.fillStyle = 'rgba(255,255,255,.95)'; roundRect(ctx, (W - lw) / 2 - 14, y - 10, lw + 28, lh + 20, 18); ctx.fill();
    ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
    y += lh + 40;
  } else y += 30;

  // judul acara
  ctx.fillStyle = ink; ctx.textAlign = 'center';
  ctx.font = `800 46px ${font}`;
  const titleLines = wrapText(ctx, event.name, W - 120).slice(0, 3);
  for (const l of titleLines) { ctx.fillText(l, W / 2, y + 40); y += 56; }
  ctx.font = `500 26px ${font}`; ctx.globalAlpha = 0.9;
  const meta = [event.event_date ? fmtDate(event.event_date) : '', event.start_time ? `${hhmm(event.start_time)}${event.end_time ? '–' + hhmm(event.end_time) : ''} ` : ''].filter(Boolean).join(' • ');
  if (meta && y < 400) ctx.fillText(meta, W / 2, Math.min(y + 30, 400));
  ctx.globalAlpha = 1;

  // nama peserta
  y = 500;
  ctx.fillStyle = '#64748b'; ctx.font = `600 24px ${font}`; ctx.fillText('E-TICKET / KARTU HADIR', W / 2, y);
  ctx.fillStyle = '#0f172a'; ctx.font = `800 54px ${font}`;
  const nameLines = wrapText(ctx, participant.name, W - 120).slice(0, 2);
  y += 70;
  for (const l of nameLines) { ctx.fillText(l, W / 2, y); y += 62; }

  if (participant.category) {
    ctx.font = `800 28px ${font}`;
    const cw = ctx.measureText(participant.category).width + 56;
    const col = categoryColor(event, participant.category);
    ctx.fillStyle = col; roundRect(ctx, (W - cw) / 2, y - 18, cw, 50, 25); ctx.fill();
    ctx.fillStyle = contrastInk(col); ctx.fillText(participant.category, W / 2, y + 17);
    y += 60;
  }

  // QR
  const qrSize = 520;
  const qrCanvas = await drawQR(document.createElement('canvas'), ticketUrl(participant.qr_token), { size: qrSize, margin: 2, ecl: 'M' });
  const qy = Math.max(y + 10, 760);
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3; roundRect(ctx, (W - qrSize) / 2 - 16, qy - 16, qrSize + 32, qrSize + 32, 24); ctx.stroke();
  ctx.drawImage(qrCanvas, (W - qrSize) / 2, qy, qrSize, qrSize);
  y = qy + qrSize + 60;

  ctx.fillStyle = '#475569'; ctx.font = `600 24px ${font}`;
  if (event.location) { ctx.fillText('Lokasi: ' + event.location, W / 2, Math.min(y, H - 70)); y += 36; }
  ctx.fillStyle = '#94a3b8'; ctx.font = `500 20px ${font}`;
  ctx.fillText('Tunjukkan QR ini kepada panitia saat registrasi', W / 2, H - 36);
  return canvas;
}

function shade(hex, pct) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (pct / 100) * 255)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function safeFileName(s) { return String(s || 'file').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'file'; }
