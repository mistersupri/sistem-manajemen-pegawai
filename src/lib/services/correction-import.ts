import ExcelJS from 'exceljs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db';
import { audit } from '../audit';
import { assertCan, employeeScopeWhere, type Actor } from '../auth/actor';
import { randomToken } from '../crypto';
import { env } from '../env';
import { notFound, unprocessable } from '../errors';
import { readSheets } from '../files/sheets';
import { addDays, isValidDate, isValidTime, todayIn } from '../time';
import { getSettings } from '../settings';
import { adminCorrection } from './corrections';

type Action = 'KOREKSI' | 'GALAT';
export interface CorrectionRow {
  line: number;
  action: Action;
  messages: string[];
  values: Record<string, string>;
  data?: { employeeId: string; workDate: string; proposedCheckIn: string | null; proposedCheckOut: string | null; proposedStatus: string | null; dispensation: boolean; reason: string };
  result?: 'BERHASIL' | 'GAGAL' | 'DILEWATI';
}
interface ImportFile { actorId: string; createdAt: number; fileName: string; rows: CorrectionRow[]; committed?: boolean }

export const CORRECTION_COLUMNS = [
  ['nip', 'NIP'], ['tanggal', 'Tanggal'], ['jam_masuk', 'Jam masuk'], ['jam_pulang', 'Jam pulang'],
  ['status', 'Status'], ['dispensasi', 'Dispensasi'], ['alasan', 'Alasan'],
] as const;
const STATUS_WORDS: Record<string, string> = {
  hadir: 'HADIR', terlambat: 'TERLAMBAT', dinas_luar: 'DINAS_LUAR', izin: 'IZIN', sakit: 'SAKIT', cuti: 'CUTI', tidak_hadir: 'TIDAK_HADIR', alfa: 'TIDAK_HADIR', alpa: 'TIDAK_HADIR',
};
const MAX_ROWS = 2000;

const dir = () => path.resolve(env().STORAGE_DIR, 'impor-koreksi');
const fileOf = (token: string) => {
  if (!/^[A-Za-z0-9_-]{20,60}$/.test(token)) throw notFound('Data impor tidak ditemukan.');
  return path.join(dir(), `${token}.json`);
};
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const HEADER_MAP = new Map<string, string>();
for (const [k, label] of CORRECTION_COLUMNS) { HEADER_MAP.set(norm(k), k); HEADER_MAP.set(norm(label), k); }
HEADER_MAP.set('nama_pegawai', 'nama');
HEADER_MAP.set('nama', 'nama');
HEADER_MAP.set('masuk', 'jam_masuk');
HEADER_MAP.set('pulang', 'jam_pulang');
HEADER_MAP.set('keterangan', 'alasan');

const pad = (n: number) => String(n).padStart(2, '0');

function dateText(v: unknown) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) return dateText(new Date(Math.round((v - 25569) * 86400) * 1000));
  const s = String(v ?? '').trim();
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  return iso ? `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}` : s;
}

/** Jam dari sel Excel: teks "7:05", "07.05", pecahan hari (0.29), atau Date jam dinding. */
function timeText(v: unknown) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
  if (typeof v === 'number' && v >= 0 && v < 1) { const min = Math.round(v * 1440); return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`; }
  const s = String(v ?? '').trim();
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(s);
  return m ? `${pad(Number(m[1]))}:${m[2]}` : s;
}

const text = (v: unknown) => (v instanceof Date ? dateText(v) : String(v ?? '').trim());

export async function previewCorrectionImport(actor: Actor, buffer: Buffer, fileName: string) {
  assertCan(actor, 'correction.review');
  if (!/\.(xlsx|csv)$/i.test(fileName)) throw unprocessable('Gunakan berkas .xlsx atau .csv sesuai template.');
  let sheets;
  try {
    sheets = await readSheets(buffer, fileName);
  } catch {
    throw unprocessable('Berkas tidak bisa dibaca. Pastikan formatnya .xlsx atau .csv yang valid.');
  }
  const rowsRaw = (sheets[0]?.rows ?? []).filter((r) => r && r.some((v) => text(v) !== ''));
  if (rowsRaw.length < 2) throw unprocessable('Berkas tidak berisi data. Isi minimal satu baris di bawah judul kolom.');
  const header = rowsRaw[0].map((h) => HEADER_MAP.get(norm(h)) ?? null);
  if (!header.includes('nip') || !header.includes('tanggal')) throw unprocessable('Kolom "NIP" dan "Tanggal" tidak ditemukan. Gunakan template koreksi.');
  if (rowsRaw.length > MAX_ROWS + 1) throw unprocessable(`Maksimal ${MAX_ROWS.toLocaleString('id-ID')} baris per impor.`);

  const s = await getSettings();
  const today = todayIn(s['org.timezone']);
  const oldest = addDays(today, -Number(s['rules.backdateDays']));
  const col = (k: string) => header.indexOf(k);
  const nips = [...new Set(rowsRaw.slice(1).map((r) => text(r[col('nip')])).filter(Boolean))];
  const emps = await prisma.employee.findMany({
    where: { AND: [{ employeeNumber: { in: nips }, deletedAt: null }, employeeScopeWhere(actor, 'correction.review')] },
    select: { id: true, employeeNumber: true, fullName: true },
  });
  const byNip = new Map(emps.map((e) => [e.employeeNumber!, e]));
  const seen = new Map<string, number>();

  const out: CorrectionRow[] = [];
  for (let i = 1; i < rowsRaw.length; i++) {
    const r = rowsRaw[i];
    const values: Record<string, string> = {};
    const messages: string[] = [];
    header.forEach((k, c) => {
      if (!k) return;
      values[k] = k === 'tanggal' ? dateText(r[c]) : k === 'jam_masuk' || k === 'jam_pulang' ? timeText(r[c]) : text(r[c]);
    });
    const nip = values.nip ?? '';
    const emp = nip ? byNip.get(nip) : undefined;
    if (!nip) messages.push('NIP wajib diisi');
    else if (!emp) messages.push(`NIP ${nip} tidak ditemukan atau di luar kewenangan Anda`);
    else if (emp.id === actor.employeeId) messages.push('Koreksi absensi sendiri harus diajukan dan disetujui pihak lain');
    else values.nama = emp.fullName;
    const tanggal = values.tanggal ?? '';
    if (!isValidDate(tanggal)) messages.push('Tanggal tidak valid (gunakan YYYY-MM-DD atau DD/MM/YYYY)');
    else if (tanggal > today) messages.push('Tanggal tidak boleh di masa depan');
    else if (tanggal < oldest) messages.push(`Tanggal lebih lama dari batas koreksi ${s['rules.backdateDays']} hari`);
    for (const k of ['jam_masuk', 'jam_pulang']) if (values[k] && !isValidTime(values[k])) messages.push(`${k === 'jam_masuk' ? 'Jam masuk' : 'Jam pulang'} tidak valid (HH:MM)`);
    let status: string | null = null;
    if (values.status) {
      status = STATUS_WORDS[norm(values.status)] ?? null;
      if (!status) messages.push(`Status "${values.status}" tidak dikenal (Hadir, Terlambat, Dinas luar, Izin, Sakit, Cuti, Tidak hadir)`);
    }
    const dispensation = /^(ya|y|1|true|iya)$/i.test(values.dispensasi ?? '');
    if (!values.jam_masuk && !values.jam_pulang && !status && !dispensation) messages.push('Isi jam masuk, jam pulang, status, atau dispensasi');
    if (nip && isValidDate(tanggal)) {
      const key = `${nip}|${tanggal}`;
      if (seen.has(key)) messages.push(`NIP dan tanggal sama dengan baris ${seen.get(key)}`);
      else seen.set(key, i + 1);
    }
    out.push({
      line: i + 1, action: messages.length ? 'GALAT' : 'KOREKSI', messages, values,
      data: messages.length || !emp ? undefined : {
        employeeId: emp.id, workDate: tanggal, proposedCheckIn: values.jam_masuk || null, proposedCheckOut: values.jam_pulang || null,
        proposedStatus: status, dispensation, reason: values.alasan ?? '',
      },
    });
  }
  await mkdir(dir(), { recursive: true });
  const token = randomToken(24);
  const file: ImportFile = { actorId: actor.userId, createdAt: Date.now(), fileName, rows: out };
  await writeFile(fileOf(token), JSON.stringify(file), { mode: 0o600 });
  return { token, fileName, summary: summarize(out), rows: out.slice(0, 300) };
}

function summarize(rows: CorrectionRow[]) {
  return {
    total: rows.length,
    koreksi: rows.filter((r) => r.action === 'KOREKSI').length,
    galat: rows.filter((r) => r.action === 'GALAT').length,
    berhasil: rows.filter((r) => r.result === 'BERHASIL').length,
    gagal: rows.filter((r) => r.result === 'GAGAL').length,
  };
}

async function load(actor: Actor, token: string): Promise<ImportFile> {
  let f: ImportFile;
  try {
    f = JSON.parse(await readFile(fileOf(token), 'utf8'));
  } catch {
    throw notFound('Data impor tidak ditemukan atau sudah kedaluwarsa. Unggah ulang berkas.');
  }
  if (f.actorId !== actor.userId || Date.now() - f.createdAt > 24 * 3600_000) throw notFound('Data impor tidak ditemukan atau sudah kedaluwarsa.');
  return f;
}

/** Terapkan baris yang valid. Setiap baris menjadi koreksi petugas yang tercatat dengan alasan dan nilai awal. */
export async function commitCorrectionImport(actor: Actor, token: string, opts: { defaultReason?: string }) {
  assertCan(actor, 'correction.review');
  const f = await load(actor, token);
  if (f.committed) throw unprocessable('Impor ini sudah diproses.');
  const fallback = (opts.defaultReason ?? '').trim() || `Koreksi massal dari berkas ${f.fileName}`;
  for (const row of f.rows) {
    if (row.action === 'GALAT' || !row.data) { row.result = 'DILEWATI'; continue; }
    try {
      await adminCorrection(actor, { ...row.data, reason: row.data.reason.length >= 10 ? row.data.reason : fallback });
      row.result = 'BERHASIL';
    } catch (err) {
      row.result = 'GAGAL';
      const e = err as { message: string; fields?: Record<string, string> };
      row.messages.push(e.fields ? Object.values(e.fields).join('; ') : e.message);
    }
  }
  f.committed = true;
  await writeFile(fileOf(token), JSON.stringify(f), { mode: 0o600 });
  const summary = summarize(f.rows);
  await audit(actor, { action: 'correction.import', entityType: 'AttendanceCorrection', meta: { file: f.fileName, ...summary } });
  return { token, summary, rows: f.rows.slice(0, 300) };
}

export async function correctionImportResultFile(actor: Actor, token: string) {
  const f = await load(actor, token);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hasil validasi');
  ws.addRow(['Baris', 'Hasil', 'Pesan', ...CORRECTION_COLUMNS.map(([, h]) => h)]);
  for (const r of f.rows) ws.addRow([r.line, r.result ?? (r.action === 'GALAT' ? 'Tidak bisa diimpor' : 'Siap'), r.messages.join('; '), ...CORRECTION_COLUMNS.map(([k]) => r.values[k] ?? '')]);
  ws.getRow(1).font = { bold: true };
  ws.getColumn(3).width = 60;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function correctionTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Koreksi');
  ws.addRow(CORRECTION_COLUMNS.map(([, h]) => h));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF8' } };
  ws.columns.forEach((c, i) => { c.width = [22, 14, 12, 12, 16, 12, 48][i]; });
  // NIP, tanggal, dan jam berformat Teks agar Excel tidak memotong NIP 18 digit atau mengubah jam menjadi pecahan.
  for (const i of [1, 2, 3, 4]) ws.getColumn(i).numFmt = '@';
  const ROWS = 2000;
  for (let r = 2; r <= ROWS + 1; r++) {
    ws.getCell(r, 5).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Hadir,Terlambat,Dinas luar,Izin,Sakit,Cuti,Tidak hadir"'], showErrorMessage: true, errorTitle: 'Status', error: 'Pilih status dari daftar atau kosongkan.' };
    ws.getCell(r, 6).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Ya,Tidak"'], showErrorMessage: true, errorTitle: 'Dispensasi', error: 'Isi Ya atau Tidak.' };
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const help = wb.addWorksheet('Petunjuk');
  help.addRow(['Kolom', 'Wajib', 'Contoh', 'Keterangan']);
  for (const row of [
    ['NIP', 'Ya', '198001012005011001', 'Pegawai harus ada di data dan berada di unit yang menjadi kewenangan Anda.'],
    ['Tanggal', 'Ya', '2026-10-05', 'YYYY-MM-DD atau DD/MM/YYYY. Tidak boleh di masa depan dan dibatasi sesuai aturan "koreksi mundur" di pengaturan.'],
    ['Jam masuk', 'Salah satu', '07:30', 'HH:MM. Kosong = jam masuk tidak diubah.'],
    ['Jam pulang', 'Salah satu', '16:00', 'HH:MM. Kosong = jam pulang tidak diubah.'],
    ['Status', 'Salah satu', 'Dinas luar', 'Hadir, Terlambat, Dinas luar, Izin, Sakit, Cuti, atau Tidak hadir. Kosong = status dihitung dari jam.'],
    ['Dispensasi', 'Salah satu', 'Ya', 'Ya = keterlambatan dan pulang cepat tidak dihitung pada hari itu.'],
    ['Alasan', 'Tidak', 'Lupa absen karena rapat di luar kantor', 'Minimal 10 karakter. Kosong = memakai alasan umum yang Anda isi saat mengimpor.'],
  ]) help.addRow(row);
  help.getRow(1).font = { bold: true };
  help.columns.forEach((c, i) => { c.width = [14, 12, 36, 80][i]; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
