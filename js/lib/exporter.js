// Ekspor ke Excel, CSV, dan PDF.
import { loadXLSX, loadPDF } from './vendor.js';
import { downloadBlob } from './ui.js';
import { loadImage } from './qr.js';

export async function toExcel(sheets, filename) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ Info: 'Tidak ada data' }]);
    const keys = Object.keys(s.rows[0] || { Info: '' });
    ws['!cols'] = keys.map((k) => ({ wch: Math.min(48, Math.max(k.length, ...s.rows.slice(0, 200).map((r) => String(r[k] ?? '').length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
}

export function toCSV(rows, filename) {
  const keys = Object.keys(rows[0] || {});
  const q = (v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [keys.map(q).join(','), ...rows.map((r) => keys.map((k) => q(r[k])).join(','))].join('\r\n');
  downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : filename + '.csv');
}

/** Baca file Excel/CSV menjadi array objek. */
export async function readSpreadsheet(file) {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
}

function hexToRgb(hex) {
  const c = String(hex || '#1d4ed8').replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

async function imageToPng(url) {
  const img = await loadImage(url);
  if (!img) return null;
  try {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return { data: c.toDataURL('image/png'), w: img.width, h: img.height };
  } catch (e) { return null; }
}

/**
 * toPDF({ title, lines:[], logoUrl, color, head:[...], body:[[...]], filename, landscape })
 */
export async function toPDF({ title, lines = [], logoUrl, color, head, body, filename, landscape = false, imageCol = -1, images = [] }) {
  const { jsPDF, autoTable } = await loadPDF();
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let x = 14;
  const logo = await imageToPng(logoUrl);
  if (logo) {
    const hgt = 20, w = Math.min(40, logo.w * (hgt / logo.h));
    doc.addImage(logo.data, 'PNG', 14, 10, w, hgt);
    x = 14 + w + 5;
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(doc.splitTextToSize(title, W - x - 14), x, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  let y = 22;
  for (const l of lines.filter(Boolean)) { doc.text(String(l), x, y); y += 4.6; }
  y = Math.max(y, 32);
  doc.setDrawColor(...hexToRgb(color)); doc.setLineWidth(0.8); doc.line(14, y, W - 14, y);
  autoTable(doc, {
    head: [head], body, startY: y + 4,
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: hexToRgb(color), textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
    columnStyles: imageCol >= 0 ? { [imageCol]: { minCellHeight: 13, cellWidth: 32 } } : {},
    didDrawCell: (d) => {
      if (imageCol < 0 || d.section !== 'body' || d.column.index !== imageCol) return;
      const img = images[d.row.index];
      if (!img || !String(img).startsWith('data:image')) return;
      try {
        const fmt = img.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
        const props = doc.getImageProperties(img);
        const maxW = d.cell.width - 2, maxH = d.cell.height - 2;
        const s = Math.min(maxW / props.width, maxH / props.height);
        doc.addImage(img, fmt, d.cell.x + 1 + (maxW - props.width * s) / 2, d.cell.y + 1 + (maxH - props.height * s) / 2, props.width * s, props.height * s);
      } catch (e) { /* abaikan gambar rusak */ }
    },
    didDrawPage: () => {
      const pg = doc.internal.getNumberOfPages();
      doc.setFontSize(8); doc.setTextColor(140);
      doc.text(`Dicetak ${new Date().toLocaleString('id-ID')} — hal. ${pg}`, 14, doc.internal.pageSize.getHeight() - 8);
      doc.setTextColor(0);
    },
  });
  doc.save(filename.endsWith('.pdf') ? filename : filename + '.pdf');
}
