const ExcelJS = require('exceljs');

/** Parser CSV sederhana (mendukung tanda kutip, pemisah koma atau titik koma). */
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text);
    if (v.result != null) return cellText(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.hyperlink) return String(v.hyperlink);
  }
  return String(v);
}

const normHeader = (h) => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Baca file .xlsx / .csv menjadi array objek dengan kunci header yang dinormalisasi. */
async function readTable(buffer, filename) {
  let rows;
  if (/\.csv$/i.test(filename)) {
    rows = parseCsv(buffer.toString('utf8'));
  } else if (/\.xlsx$/i.test(filename)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    rows = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const vals = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellText(r.getCell(c).value).trim());
      rows.push(vals);
    });
  } else {
    throw new Error('Format file harus .xlsx atau .csv');
  }
  if (!rows.length) return [];
  const headers = rows[0].map(normHeader);
  return rows.slice(1).map((r, idx) => {
    const obj = { __row: idx + 2 };
    headers.forEach((h, i) => { if (h) obj[h] = String(r[i] ?? '').trim(); });
    return obj;
  });
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns: [{ header, key, width }] */
function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvEscape(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvEscape(r[c.key])).join(','));
  return '﻿' + lines.join('\r\n');
}

function addSheet(wb, name, columns, rows, opts = {}) {
  const ws = wb.addWorksheet(name);
  let startRow = 1;
  if (opts.title) {
    ws.mergeCells(1, 1, 1, columns.length);
    ws.getCell(1, 1).value = opts.title;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    if (opts.subtitle) {
      ws.mergeCells(2, 1, 2, columns.length);
      ws.getCell(2, 1).value = opts.subtitle;
    }
    startRow = opts.subtitle ? 4 : 3;
  }
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 15; });
  const header = ws.getRow(startRow);
  columns.forEach((c, i) => { header.getCell(i + 1).value = c.header; });
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  rows.forEach((r, idx) => {
    const row = ws.getRow(startRow + 1 + idx);
    columns.forEach((c, i) => { row.getCell(i + 1).value = r[c.key] ?? ''; });
  });
  const last = startRow + rows.length;
  for (let r = startRow; r <= last; r++) {
    for (let c = 1; c <= columns.length; c++) {
      ws.getCell(r, c).border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
      };
    }
  }
  ws.views = [{ state: 'frozen', ySplit: startRow }];
  return ws;
}

async function sendWorkbook(res, wb, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

function sendCsv(res, columns, rows, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(columns, rows));
}

module.exports = { ExcelJS, parseCsv, readTable, toCsv, addSheet, sendWorkbook, sendCsv };
