// Parser file ekspor mesin absensi: laporan standar Solution (.xls/.xlsx, mis. P280
// "StandardReport.xls"), attlog teks (.dat/.txt), dan CSV/Excel berkolom ID + Waktu.
// Waktu dikembalikan sebagai jam dinding perangkat 'YYYY-MM-DD HH:MM:SS' (belum dikonversi zona).
import { parseCsv } from '../files/csv';
import { readSheets, type Sheet } from '../files/sheets';
import { dateRange, isValidDate, isValidTime } from '../time';

export interface ParsedScan {
  pin: string;
  local: string;
  verifyMode?: string | null;
  statusCode?: string | null;
}
export interface ParsedUser {
  pin: string;
  name?: string;
  department?: string;
}
export interface ParsedExport {
  format: string;
  period?: { from: string; to: string } | null;
  users: ParsedUser[];
  scans: ParsedScan[];
}

const pad = (n: number | string) => String(n).padStart(2, '0');

export function cleanPin(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? String(Math.round(v)) : String(v).trim();
  s = s.replace(/\.0+$/, '');
  return /^[A-Za-z0-9_-]{1,30}$/.test(s) ? s : '';
}

/** Normalisasi berbagai format tanggal/jam menjadi 'YYYY-MM-DD HH:MM:SS' atau null. */
export function normDateTime(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // ExcelJS memberi Date UTC yang mewakili jam dinding sel.
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) return normDateTime(new Date(Math.round((v - 25569) * 86400) * 1000));
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])} ${pad(m[4])}:${m[5]}:${pad(m[6] || 0)}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])} ${pad(m[4])}:${m[5]}:${pad(m[6] || 0)}`;
  return null;
}

export const validStamp = (s: string | null): s is string => !!s && isValidDate(s.slice(0, 10)) && isValidTime(s.slice(11, 16));

/**
 * Laporan standar Solution, sheet "Lap. Log Absen": baris "ID: <pin> ... Nama: <nama> ... Dept.: <dept>"
 * diikuti baris berisi jam scan per tanggal yang digabung tanpa pemisah, mis. "06:1017:00".
 */
export function parseSolutionReport(sheets: Sheet[]): ParsedExport | null {
  for (const sheet of sheets) {
    const rows = sheet.rows;
    // Baris pegawai diawali label "ID:" (dengan titik dua; judul kolom "ID" tanpa titik dua diabaikan).
    const idRows = rows.map((r, i) => (r && /^ID\s*[:：]$/i.test(String(r[0] ?? '').trim()) ? i : -1)).filter((i) => i >= 0);
    if (!idRows.length) continue;
    let period: { from: string; to: string } | null = null;
    let periodRow = -1;
    for (let i = 0; i < idRows[0] && !period; i++) {
      for (const c of rows[i] || []) {
        const m = /(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/.exec(String(c));
        if (m) { period = { from: m[1], to: m[2] }; periodRow = i; break; }
      }
    }
    if (!period) throw new Error(`Periode laporan tidak ditemukan pada sheet "${sheet.name}".`);
    const dates = dateRange(period.from, period.to);
    const colDate: Record<number, string> = {};
    for (let i = periodRow + 1; i < idRows[0]; i++) {
      const r = rows[i] || [];
      const nums = r.map((v, c) => ({ c, d: Number(v) })).filter((x) => String(r[x.c] ?? '').trim() !== '' && Number.isInteger(x.d) && x.d >= 1 && x.d <= 31);
      if (nums.length >= Math.min(dates.length, 5)) {
        let k = 0;
        for (const { c, d } of nums) {
          while (k < dates.length && +dates[k].slice(8) !== d) k++;
          if (k < dates.length) colDate[c] = dates[k++];
        }
        break;
      }
    }
    if (!Object.keys(colDate).length) throw new Error('Baris tanggal pada laporan tidak dikenali.');
    const labelValue = (r: unknown[], re: RegExp) => {
      const idx = r.findIndex((v) => re.test(String(v ?? '').trim()));
      if (idx < 0) return '';
      for (let c = idx + 1; c < r.length; c++) if (String(r[c] ?? '').trim() !== '') return String(r[c]).trim();
      return '';
    };
    const users: ParsedUser[] = [];
    const scans: ParsedScan[] = [];
    const seen = new Set<string>();
    for (const i of idRows) {
      const r = rows[i];
      const pin = cleanPin(labelValue(r, /^ID[:：]?$/i));
      if (!pin) continue;
      users.push({ pin, name: labelValue(r, /^(Nama|Name)[:：]?$/i), department: labelValue(r, /^(Dept\.?|Departemen|Department)[:：]?$/i) });
      const times = rows[i + 1] || [];
      for (const [c, date] of Object.entries(colDate)) {
        for (const t of String(times[Number(c)] ?? '').match(/\d{1,2}:\d{2}/g) || []) {
          const stamp = `${date} ${t.padStart(5, '0')}:00`;
          const key = `${pin}|${stamp}`;
          if (validStamp(stamp) && !seen.has(key)) { seen.add(key); scans.push({ pin, local: stamp }); }
        }
      }
    }
    return { format: 'Laporan standar Solution', period, users, scans };
  }
  return null;
}

const PIN_HEADER = /^(pin|id|enno|en_no|ac_no|no_id|user_id|userid|id_mesin|id_pegawai|no_pegawai|badgenumber|no_absen|nik|nip)$/;
const DATETIME_HEADER = /^(waktu|datetime|date_time|time|checktime|check_time|waktu_absen|tanggal_jam|tgl_jam)$/;
const DATE_HEADER = /^(tanggal|tgl|date)$/;
const TIME_HEADER = /^(jam|time|pukul)$/;
const NAME_HEADER = /^(nama|name)$/;
const DEPT_HEADER = /^(departemen|dept|department|bagian|unit)$/;
const normHeader = (h: unknown) => String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function cellDate(v: unknown) {
  if (v instanceof Date || (typeof v === 'number' && v > 20000)) return normDateTime(v)?.slice(0, 10) ?? '';
  const s = String(v ?? '').trim();
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : s;
}

function cellTime(v: unknown) {
  if (v instanceof Date) return normDateTime(v)?.slice(11) ?? '';
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const sec = Math.round(v * 86400);
    return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
  }
  return String(v ?? '').trim();
}

/** Tabel umum dengan header (PIN/ID + Waktu atau Tanggal + Jam), atau attlog tanpa header. */
export function parseTable(input: unknown[][], format: string): ParsedExport | null {
  const rows = input.filter((r) => r && r.some((v) => String(v ?? '').trim() !== ''));
  if (!rows.length) return null;
  const users = new Map<string, ParsedUser>();
  const scans: ParsedScan[] = [];
  for (let h = 0; h < Math.min(rows.length, 10); h++) {
    const hdr = rows[h].map(normHeader);
    const iPin = hdr.findIndex((x) => PIN_HEADER.test(x));
    let iDt = hdr.findIndex((x) => DATETIME_HEADER.test(x));
    const iDate = hdr.findIndex((x) => DATE_HEADER.test(x));
    const iTime = hdr.findIndex((x, i) => TIME_HEADER.test(x) && i !== iDt);
    if (iPin < 0 || (iDt < 0 && iDate < 0)) continue;
    if (iDt >= 0 && iDate >= 0 && iTime < 0 && hdr[iDt] === 'time') iDt = -1;
    const iName = hdr.findIndex((x) => NAME_HEADER.test(x));
    const iDept = hdr.findIndex((x) => DEPT_HEADER.test(x));
    for (const r of rows.slice(h + 1)) {
      const pin = cleanPin(r[iPin]);
      let stamp = iDt >= 0 ? normDateTime(r[iDt]) : null;
      if (!stamp && iDate >= 0) stamp = normDateTime(`${cellDate(r[iDate])} ${cellTime(iTime >= 0 ? r[iTime] : '00:00')}`);
      if (!pin || !validStamp(stamp)) continue;
      scans.push({ pin, local: stamp });
      if (!users.has(pin) && (iName >= 0 || iDept >= 0)) {
        users.set(pin, { pin, name: iName >= 0 ? String(r[iName] ?? '').trim() : '', department: iDept >= 0 ? String(r[iDept] ?? '').trim() : '' });
      }
    }
    return scans.length ? { format, users: [...users.values()], scans } : null;
  }
  // Tanpa header: attlog ZK/Solution "PIN<TAB>YYYY-MM-DD HH:MM:SS<TAB>verify<TAB>status..."
  for (const r of rows) {
    const pin = cleanPin(r[0]);
    const idx = r.findIndex((v, i) => i > 0 && normDateTime(v));
    if (!pin || idx < 0) continue;
    const stamp = normDateTime(r[idx]);
    if (!validStamp(stamp)) continue;
    scans.push({ pin, local: stamp, verifyMode: r[idx + 1] == null ? null : String(r[idx + 1]), statusCode: r[idx + 2] == null ? null : String(r[idx + 2]) });
  }
  return scans.length ? { format, users: [], scans } : null;
}

function splitTextRows(text: string) {
  return text.replace(/^﻿/, '').split(/\r?\n/).map((line) => {
    if (line.includes('\t')) return line.split('\t').map((x) => x.trim());
    if (/[,;]/.test(line)) return null;
    return line.trim().split(/\s{2,}|\s(?=\d{4}-\d{2}-\d{2})/).map((x) => x.trim());
  });
}

/** Deteksi format file ekspor mesin dari isi dan nama berkas. */
export async function parseExportFile(buffer: Buffer, filename: string): Promise<ParsedExport> {
  const name = filename.toLowerCase();
  const isXls = name.endsWith('.xls') || (buffer[0] === 0xd0 && buffer[1] === 0xcf);
  const isXlsx = name.endsWith('.xlsx') || (buffer[0] === 0x50 && buffer[1] === 0x4b);
  if (isXls || isXlsx) {
    const sheets = await readSheets(buffer, isXls ? 'x.xls' : 'x.xlsx');
    const report = parseSolutionReport(sheets);
    if (report) return { ...report, format: `${report.format} (${isXls ? '.xls' : '.xlsx'})` };
    for (const sh of sheets) {
      const t = parseTable(sh.rows, isXls ? 'Excel 97-2003 (.xls)' : 'Excel (.xlsx)');
      if (t) return t;
    }
    throw new Error('Isi file Excel tidak dikenali sebagai data absensi mesin.');
  }
  const text = buffer.toString('utf8');
  const tabs = splitTextRows(text);
  let parsed: ParsedExport | null = null;
  if (tabs.every((r) => r !== null)) parsed = parseTable(tabs as string[][], 'Attlog teks (.dat/.txt)');
  if (!parsed) parsed = parseTable(parseCsv(text), 'CSV');
  if (!parsed) throw new Error('Format file tidak dikenali. Gunakan laporan standar .xls, attlog .dat/.txt, atau CSV berkolom ID dan Waktu.');
  return parsed;
}
