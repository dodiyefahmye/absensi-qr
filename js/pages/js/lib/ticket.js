// Kartu absen / e-ticket yang bisa dikustomisasi (disimpan di event.theme.ticket).
import { drawQR, loadImage, ticketUrl } from './qr.js';
import { fmtDate, hhmm } from './ui.js';
import { normalizeTheme, contrastInk, fontStack, categoryColor } from './theme.js';
import { displayValue } from './form.js';

export const DEFAULT_TICKET = {
  layout: 'portrait',          // portrait | landscape
  label: 'E-TICKET / KARTU HADIR',
  show_logo: true,
  show_banner: true,
  show_date: true,
  show_time: true,
  show_location: true,
  show_category: true,
  fields: [],                  // key field peserta yang ditampilkan (+ _email, _phone)
  show_field_labels: true,
  photo_field: '',             // key field foto peserta
  name_size: 'm',              // s | m | l
  qr_size: 'm',                // s | m | l
  header_style: 'gradient',    // gradient | solid
  note: '',                    // teks tambahan (mis. info tempat duduk)
  footer: 'Tunjukkan QR ini kepada panitia saat registrasi',
};

export function ticketConfig(event) {
  return { ...DEFAULT_TICKET, ...(event?.theme?.ticket || {}) };
}

/** Daftar data peserta yang bisa ditampilkan di kartu. */
export function ticketFieldOptions(event) {
  const opts = (event.form_schema || [])
    .filter((f) => f.key !== 'nama' && !['signature', 'photo'].includes(f.type))
    .map((f) => ({ key: f.key, label: f.label || f.key, field: f }));
  if (!opts.some((o) => o.field?.type === 'email')) opts.push({ key: '_email', label: 'Email' });
  if (!opts.some((o) => o.field?.type === 'tel')) opts.push({ key: '_phone', label: 'No. HP' });
  return opts;
}
export function photoFieldOptions(event) {
  return (event.form_schema || []).filter((f) => f.type === 'photo').map((f) => ({ key: f.key, label: f.label || f.key }));
}

function fieldValue(p, opt) {
  if (opt.key === '_email') return p.email || '';
  if (opt.key === '_phone') return p.phone || '';
  return displayValue(opt.field, p.data?.[opt.key]);
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
function fitText(ctx, text, maxWidth) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}
function roundRect(ctx, x, y, w, hgt, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hgt, r); ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
  ctx.arcTo(x, y + hgt, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function shade(hex, pct) {
  const c = String(hex || '#000').replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (pct / 100) * 255)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function metaText(event, cfg) {
  const time = event.start_time ? `${hhmm(event.start_time)}${event.end_time ? '–' + hhmm(event.end_time) : ''}` : '';
  return [cfg.show_date && event.event_date ? fmtDate(event.event_date) : '', cfg.show_time ? time : ''].filter(Boolean).join(' • ');
}

function fillHeader(ctx, t, cfg, x, y, w, hgt, banner) {
  if (cfg.header_style === 'solid') ctx.fillStyle = t.primary;
  else { const g = ctx.createLinearGradient(x, y, x + w, y + hgt); g.addColorStop(0, t.primary); g.addColorStop(1, shade(t.primary, -25)); ctx.fillStyle = g; }
  ctx.fillRect(x, y, w, hgt);
  if (banner && cfg.show_banner) {
    const s = Math.max(w / banner.width, hgt / banner.height);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, hgt); ctx.clip();
    ctx.globalAlpha = 0.35; ctx.drawImage(banner, x + (w - banner.width * s) / 2, y + (hgt - banner.height * s) / 2, banner.width * s, banner.height * s);
    ctx.restore(); ctx.globalAlpha = 1;
  }
}

function drawLogo(ctx, logo, cx, y, maxW, lh) {
  const lw = Math.min(maxW, logo.width * (lh / logo.height));
  ctx.fillStyle = 'rgba(255,255,255,.95)'; roundRect(ctx, cx - lw / 2 - 14, y - 10, lw + 28, lh + 20, 18); ctx.fill();
  ctx.drawImage(logo, cx - lw / 2, y, lw, lh);
  return lh + 20;
}

function drawPhoto(ctx, img, cx, cy, r, ring) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
  ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
  ctx.restore();
}

function drawBadge(ctx, text, cx, y, font, col) {
  ctx.font = `800 28px ${font}`;
  const cw = ctx.measureText(text).width + 56;
  ctx.fillStyle = col; roundRect(ctx, cx - cw / 2, y, cw, 50, 25); ctx.fill();
  ctx.fillStyle = contrastInk(col); ctx.textAlign = 'center'; ctx.fillText(text, cx, y + 35);
  return 50;
}

/** Baris "Label: nilai" — rata tengah (align='center') atau kiri. */
function drawFieldRow(ctx, label, value, x, y, maxW, font, align, showLabel) {
  const lblTxt = showLabel ? label + ': ' : '';
  ctx.font = `500 26px ${font}`; const lw = ctx.measureText(lblTxt).width;
  ctx.font = `700 26px ${font}`;
  const val = fitText(ctx, value, Math.max(80, maxW - lw));
  const vw = ctx.measureText(val).width;
  const startX = align === 'center' ? x - (lw + vw) / 2 : x;
  ctx.textAlign = 'left';
  ctx.font = `500 26px ${font}`; ctx.fillStyle = '#64748b'; ctx.fillText(lblTxt, startX, y);
  ctx.font = `700 26px ${font}`; ctx.fillStyle = '#0f172a'; ctx.fillText(val, startX + lw, y);
}

const NAME_PX = { s: 42, m: 54, l: 66 };
const QR_PORTRAIT = { s: 380, m: 480, l: 580 };
const QR_LANDSCAPE = { s: 340, m: 400, l: 460 };

/** Render kartu ke canvas. participant: { name, category, qr_token, data, email, phone } */
export async function renderTicket(participant, event, canvas = document.createElement('canvas')) {
  const cfg = ticketConfig(event);
  const t = normalizeTheme(event.theme);
  const font = fontStack(t.font);
  try { await document.fonts?.load(`700 40px ${font}`); } catch (e) { /* abaikan */ }
  const [logo, banner] = await Promise.all([cfg.show_logo ? loadImage(t.logo_url) : null, loadImage(t.banner_url)]);
  const photoSrc = cfg.photo_field ? participant.data?.[cfg.photo_field] : '';
  const photo = photoSrc && String(photoSrc).startsWith('data:image') ? await loadImage(photoSrc) : null;
  const opts = ticketFieldOptions(event);
  const rows = (cfg.fields || []).map((k) => opts.find((o) => o.key === k)).filter(Boolean)
    .map((o) => ({ label: o.label, value: fieldValue(participant, o) })).filter((r) => r.value);
  const qrCanvas = await drawQR(document.createElement('canvas'), ticketUrl(participant.qr_token), { size: 600, margin: 2, ecl: 'M' });

  const args = { participant, event, cfg, t, font, logo, banner, photo, rows, qrCanvas };
  return cfg.layout === 'landscape' ? renderLandscape(canvas, args) : renderPortrait(canvas, args);
}

function renderPortrait(canvas, { participant, event, cfg, t, font, logo, banner, photo, rows, qrCanvas }) {
  const W = 900, HEADER = 420;
  const work = document.createElement('canvas'); work.width = W; work.height = 3000;
  const ctx = work.getContext('2d');
  const ink = contrastInk(t.primary);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, work.height);

  // header
  fillHeader(ctx, t, cfg, 0, 0, W, HEADER, banner);
  ctx.fillStyle = t.secondary; ctx.fillRect(0, HEADER, W, 12);
  let y = 60;
  if (logo) y += drawLogo(ctx, logo, W / 2, y, 260, 110) + 20; else y += 30;
  ctx.fillStyle = ink; ctx.textAlign = 'center';
  ctx.font = `800 46px ${font}`;
  for (const l of wrapText(ctx, event.name, W - 120).slice(0, logo ? 2 : 3)) { ctx.fillText(l, W / 2, y + 40); y += 56; }
  const meta = metaText(event, cfg);
  ctx.font = `500 26px ${font}`; ctx.globalAlpha = 0.9;
  if (meta && y < HEADER - 20) ctx.fillText(meta, W / 2, Math.min(y + 30, HEADER - 24));
  ctx.globalAlpha = 1;

  // badan kartu
  y = HEADER + 70;
  if (photo) { drawPhoto(ctx, photo, W / 2, y + 85, 85, t.secondary); y += 200; }
  if (cfg.label) { ctx.fillStyle = '#64748b'; ctx.font = `600 24px ${font}`; ctx.textAlign = 'center'; ctx.fillText(cfg.label, W / 2, y); y += 18; }
  const nameSize = NAME_PX[cfg.name_size] || 54;
  ctx.fillStyle = '#0f172a'; ctx.font = `800 ${nameSize}px ${font}`; ctx.textAlign = 'center';
  y += nameSize + 4;
  for (const l of wrapText(ctx, participant.name, W - 100).slice(0, 2)) { ctx.fillText(l, W / 2, y); y += nameSize + 8; }
  if (cfg.show_category && participant.category) { y += 4; y += drawBadge(ctx, participant.category, W / 2, y - 18, font, categoryColor(event, participant.category)) + 10; }
  if (rows.length) {
    y += 22;
    for (const r of rows) { drawFieldRow(ctx, r.label, r.value, W / 2, y, W - 120, font, 'center', cfg.show_field_labels); y += 42; }
  }

  // QR
  const qs = QR_PORTRAIT[cfg.qr_size] || 480;
  y += 30;
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3; roundRect(ctx, (W - qs) / 2 - 16, y, qs + 32, qs + 32, 24); ctx.stroke();
  ctx.drawImage(qrCanvas, (W - qs) / 2, y + 16, qs, qs);
  y += qs + 32 + 50;

  ctx.textAlign = 'center';
  if (cfg.show_location && event.location) { ctx.fillStyle = '#475569'; ctx.font = `600 24px ${font}`; ctx.fillText(fitText(ctx, 'Lokasi: ' + event.location, W - 100), W / 2, y); y += 38; }
  if (cfg.note) {
    ctx.fillStyle = '#0f172a'; ctx.font = `600 24px ${font}`;
    for (const l of wrapText(ctx, cfg.note, W - 120).slice(0, 3)) { ctx.fillText(l, W / 2, y); y += 34; }
  }
  if (cfg.footer) { y += 6; ctx.fillStyle = '#94a3b8'; ctx.font = `500 20px ${font}`; for (const l of wrapText(ctx, cfg.footer, W - 100).slice(0, 2)) { ctx.fillText(l, W / 2, y); y += 28; } }
  return finish(canvas, work, W, Math.max(y + 24, 1100));
}

function renderLandscape(canvas, { participant, event, cfg, t, font, logo, banner, photo, rows, qrCanvas }) {
  const W = 1500, H = 900, LEFT = 470;
  const work = document.createElement('canvas'); work.width = W; work.height = H;
  const ctx = work.getContext('2d');
  const ink = contrastInk(t.primary);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  // panel kiri
  fillHeader(ctx, t, cfg, 0, 0, LEFT, H, banner);
  ctx.fillStyle = t.secondary; ctx.fillRect(LEFT, 0, 12, H);
  let y = 70;
  if (logo) y += drawLogo(ctx, logo, LEFT / 2, y, 300, 130) + 30;
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.font = `800 42px ${font}`;
  for (const l of wrapText(ctx, event.name, LEFT - 70).slice(0, 4)) { ctx.fillText(l, LEFT / 2, y + 36); y += 52; }
  y += 30; ctx.font = `500 25px ${font}`; ctx.globalAlpha = 0.92;
  const time = event.start_time ? `${hhmm(event.start_time)}${event.end_time ? '–' + hhmm(event.end_time) : ''}` : '';
  for (const m of [cfg.show_date && event.event_date ? fmtDate(event.event_date) : '', cfg.show_time ? time : '', cfg.show_location ? event.location : ''].filter(Boolean)) {
    for (const l of wrapText(ctx, m, LEFT - 70).slice(0, 2)) { ctx.fillText(l, LEFT / 2, y); y += 34; }
    y += 6;
  }
  ctx.globalAlpha = 1;

  // area tengah (identitas)
  const qs = QR_LANDSCAPE[cfg.qr_size] || 400;
  const qx = W - qs - 70;
  const mx = LEFT + 70, mw = qx - mx - 40;
  y = 110;
  if (photo) { drawPhoto(ctx, photo, mx + 80, y + 80, 80, t.secondary); y += 200; }
  ctx.textAlign = 'left';
  if (cfg.label) { ctx.fillStyle = '#64748b'; ctx.font = `600 24px ${font}`; ctx.fillText(cfg.label, mx, y); y += 16; }
  const nameSize = NAME_PX[cfg.name_size] || 54;
  ctx.fillStyle = '#0f172a'; ctx.font = `800 ${nameSize}px ${font}`;
  y += nameSize + 4;
  for (const l of wrapText(ctx, participant.name, mw).slice(0, 2)) { ctx.fillText(l, mx, y); y += nameSize + 8; }
  if (cfg.show_category && participant.category) {
    ctx.font = `800 28px ${font}`;
    const cw = ctx.measureText(participant.category).width + 56;
    const col = categoryColor(event, participant.category);
    ctx.fillStyle = col; roundRect(ctx, mx, y - 10, cw, 50, 25); ctx.fill();
    ctx.fillStyle = contrastInk(col); ctx.textAlign = 'center'; ctx.fillText(participant.category, mx + cw / 2, y + 25); ctx.textAlign = 'left';
    y += 70;
  }
  y += 14;
  for (const r of rows) { if (y > H - 120) break; drawFieldRow(ctx, r.label, r.value, mx, y, mw, font, 'left', cfg.show_field_labels); y += 42; }
  if (cfg.note && y < H - 90) { y += 10; ctx.fillStyle = '#0f172a'; ctx.font = `600 24px ${font}`; for (const l of wrapText(ctx, cfg.note, mw).slice(0, 2)) { ctx.fillText(l, mx, y); y += 32; } }

  // QR
  const qy = (H - qs) / 2 - 20;
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3; roundRect(ctx, qx - 16, qy - 16, qs + 32, qs + 32, 24); ctx.stroke();
  ctx.drawImage(qrCanvas, qx, qy, qs, qs);
  if (cfg.footer) {
    ctx.fillStyle = '#94a3b8'; ctx.font = `500 19px ${font}`; ctx.textAlign = 'center';
    let fy = qy + qs + 56;
    for (const l of wrapText(ctx, cfg.footer, qs + 40).slice(0, 2)) { ctx.fillText(l, qx + qs / 2, fy); fy += 26; }
  }
  return finish(canvas, work, W, H);
}

function finish(canvas, work, W, H) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.save(); roundRect(ctx, 0, 0, W, H, 36); ctx.clip();
  ctx.drawImage(work, 0, 0, W, H, 0, 0, W, H);
  ctx.restore();
  return canvas;
}

/** Cetak banyak kartu ke PDF A4 (siap potong). */
export async function ticketsToPDF(list, event, filename, onProgress) {
  const { loadPDF } = await import('./vendor.js');
  const { jsPDF } = await loadPDF();
  const cfg = ticketConfig(event);
  const landscape = cfg.layout === 'landscape';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 8, GAP = 4;
  const cardW = landscape ? 95 : 62;
  const canvas = document.createElement('canvas');
  const small = document.createElement('canvas');
  let x = M, y = M, rowH = 0, first = true;
  for (let i = 0; i < list.length; i++) {
    await renderTicket(list[i], event, canvas);
    const cardH = cardW * (canvas.height / canvas.width);
    if (x + cardW > PW - M + 0.01) { x = M; y += rowH + GAP; rowH = 0; }
    if (y + cardH > PH - M + 0.01) { doc.addPage(); x = M; y = M; rowH = 0; }
    // perkecil agar ukuran PDF wajar
    const scale = 700 / canvas.width;
    small.width = Math.round(canvas.width * scale); small.height = Math.round(canvas.height * scale);
    const sctx = small.getContext('2d'); sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, small.width, small.height);
    sctx.drawImage(canvas, 0, 0, small.width, small.height);
    doc.addImage(small.toDataURL('image/jpeg', 0.88), 'JPEG', x, y, cardW, cardH);
    doc.setDrawColor(200); doc.setLineWidth(0.1); doc.rect(x, y, cardW, cardH);
    x += cardW + GAP; rowH = Math.max(rowH, cardH); first = false;
    onProgress && onProgress(i + 1, list.length);
  }
  doc.save(filename.endsWith('.pdf') ? filename : filename + '.pdf');
}
