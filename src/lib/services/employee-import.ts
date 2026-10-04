import ExcelJS from 'exceljs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db';
import { audit } from '../audit';
import { assertCan, unitInScope, type Actor } from '../auth/actor';
import { randomToken } from '../crypto';
import { env } from '../env';
import { notFound, unprocessable } from '../errors';
import { readSheets } from '../files/sheets';
import { normDateTime } from '../devices/parsers';
import { createEmployee, employeeInput, updateEmployee } from './employees';
import { EMPLOYEE_COLUMNS } from './exports';

type Action = 'BARU' | 'PERBARUI' | 'GALAT';
export interface PreviewRow {
  line: number;
  action: Action;
  messages: string[];
  values: Record<string, string>;
  data?: Record<string, unknown>;
  employeeId?: string | null;
  result?: 'BERHASIL' | 'GAGAL' | 'DILEWATI';
}
interface ImportFile {
  actorId: string;
  createdAt: number;
  fileName: string;
  rows: PreviewRow[];
  committed?: boolean;
}

const dir = () => path.resolve(env().STORAGE_DIR, 'impor');
const fileOf = (token: string) => {
  if (!/^[A-Za-z0-9_-]{20,60}$/.test(token)) throw notFound('Data impor tidak ditemukan.');
  return path.join(dir(), `${token}.json`);
};

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const HEADER_MAP = new Map<string, string>();
for (const [key, label] of EMPLOYEE_COLUMNS) { HEADER_MAP.set(norm(key), key); HEADER_MAP.set(norm(label), key); }
HEADER_MAP.set('nama', 'nama');
HEADER_MAP.set('unit', 'kode_unit');
HEADER_MAP.set('unit_kerja', 'kode_unit');

const LABEL = new Map<string, string>(EMPLOYEE_COLUMNS.map(([k, label]) => [k, label]));
// Nama isian di skema pegawai -> kolom berkas, agar pesan galat memakai judul kolom yang dilihat pengguna.
const FIELD_COLUMN: Record<string, string> = {
  employeeNumber: 'nip', nik: 'nik', fullName: 'nama', frontTitle: 'gelar_depan', backTitle: 'gelar_belakang', birthPlace: 'tempat_lahir',
  birthDate: 'tanggal_lahir', gender: 'jenis_kelamin', address: 'alamat', phone: 'telepon', email: 'email', employmentStatus: 'status_kepegawaian',
  position: 'jabatan', rank: 'pangkat_golongan', unitId: 'kode_unit', supervisorId: 'nip_atasan', startDate: 'tanggal_mulai', machinePin: 'id_mesin',
};
// Kolom nomor identitas. Excel menyimpan angka hanya sampai 15 digit, jadi NIP 18 digit yang diketik di kolom
// berformat General sudah berubah sebelum sampai ke sini; tolak alih-alih menyimpan nomor yang salah.
const ID_COLUMNS = new Set(['nip', 'nik', 'nip_atasan', 'id_mesin']);

function text(v: unknown) {
  if (v instanceof Date) return normDateTime(v)?.slice(0, 10) ?? '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v ?? '').trim();
}

function dateText(v: unknown) {
  if (v instanceof Date || (typeof v === 'number' && v > 20000)) return normDateTime(v)?.slice(0, 10) ?? '';
  const s = String(v ?? '').trim();
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
}

export async function previewImport(actor: Actor, buffer: Buffer, fileName: string) {
  assertCan(actor, 'employee.import');
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
  if (!header.includes('nama')) throw unprocessable('Kolom "Nama lengkap" tidak ditemukan. Gunakan template impor.');
  if (rowsRaw.length > 5001) throw unprocessable('Maksimal 5.000 baris per impor.');

  const units = await prisma.organizationUnit.findMany({ where: { deletedAt: null }, select: { id: true, code: true } });
  const unitByCode = new Map(units.map((u) => [u.code.toLowerCase(), u.id]));
  const nips = rowsRaw.slice(1).map((r) => text(r[header.indexOf('nip')])).filter(Boolean);
  const supNips = rowsRaw.slice(1).map((r) => text(r[header.indexOf('nip_atasan')])).filter(Boolean);
  const existing = await prisma.employee.findMany({ where: { employeeNumber: { in: [...new Set([...nips, ...supNips])] }, deletedAt: null }, select: { id: true, employeeNumber: true, unitId: true, machinePin: true } });
  const byNip = new Map(existing.map((e) => [e.employeeNumber!, e]));
  const seenNip = new Map<string, number>();
  const seenPin = new Map<string, number>();

  const out: PreviewRow[] = [];
  for (let i = 1; i < rowsRaw.length; i++) {
    const r = rowsRaw[i];
    const values: Record<string, string> = {};
    const messages: string[] = [];
    header.forEach((k, c) => {
      if (!k) return;
      const raw = r[c];
      if (ID_COLUMNS.has(k) && typeof raw === 'number' && !Number.isSafeInteger(raw)) {
        messages.push(`${LABEL.get(k)} tersimpan sebagai angka sehingga digit terakhirnya berubah. Format kolom sebagai Teks di Excel lalu ketik ulang nomornya.`);
      }
      // Telepon yang diketik sebagai angka kehilangan 0 di depan (81234... menjadi 081234...).
      values[k] = ['tanggal_lahir', 'tanggal_mulai'].includes(k) ? dateText(raw)
        : k === 'telepon' && typeof raw === 'number' && /^8/.test(String(raw)) ? `0${raw}` : text(raw);
    });
    if (/\(hapus baris ini\)/i.test(values.nama ?? '')) messages.push('Baris contoh dari template lama; hapus baris ini');
    const nip = values.nip || '';
    if (nip) {
      if (seenNip.has(nip)) messages.push(`NIP sama dengan baris ${seenNip.get(nip)}`);
      else seenNip.set(nip, i + 1);
    }
    if (values.id_mesin) {
      if (seenPin.has(values.id_mesin)) messages.push(`ID mesin sama dengan baris ${seenPin.get(values.id_mesin)}`);
      else seenPin.set(values.id_mesin, i + 1);
    }
    let unitId: string | null = null;
    if (values.kode_unit) {
      unitId = unitByCode.get(values.kode_unit.toLowerCase()) ?? null;
      if (!unitId) messages.push(`Kode unit "${values.kode_unit}" tidak dikenal`);
      else if (!unitInScope(actor, 'employee.write', unitId)) messages.push('Unit di luar kewenangan Anda');
    } else if (!unitInScope(actor, 'employee.write', null)) messages.push('Kode unit wajib diisi');
    let supervisorId: string | null = null;
    if (values.nip_atasan) {
      supervisorId = byNip.get(values.nip_atasan)?.id ?? null;
      if (!supervisorId) messages.push(`Atasan dengan NIP ${values.nip_atasan} belum ada di data pegawai`);
    }
    const gender = values.jenis_kelamin ? (/^l/i.test(values.jenis_kelamin) ? 'L' : /^p/i.test(values.jenis_kelamin) ? 'P' : '?') : null;
    if (gender === '?') messages.push('Jenis kelamin harus L atau P');
    const data = {
      employeeNumber: nip || null, nik: values.nik || null, fullName: values.nama || '', frontTitle: values.gelar_depan || null, backTitle: values.gelar_belakang || null,
      birthPlace: values.tempat_lahir || null, birthDate: values.tanggal_lahir || null, gender: gender === '?' ? null : gender, address: values.alamat || null,
      phone: values.telepon || null, email: values.email || null, employmentStatus: values.status_kepegawaian || null, position: values.jabatan || null,
      rank: values.pangkat_golongan || null, unitId, supervisorId, startDate: values.tanggal_mulai || null, machinePin: values.id_mesin || null,
    };
    const parsed = employeeInput.safeParse(data);
    if (!parsed.success) for (const iss of parsed.error.issues) {
      const col = FIELD_COLUMN[String(iss.path[0] ?? '')];
      messages.push(col ? `${LABEL.get(col)}: ${iss.message}` : iss.message);
    }
    const ex = nip ? byNip.get(nip) : undefined;
    if (ex && !unitInScope(actor, 'employee.write', ex.unitId)) messages.push('NIP ini milik pegawai di luar kewenangan Anda');
    if (data.machinePin) {
      const other = await prisma.employee.findFirst({ where: { machinePin: data.machinePin, NOT: ex ? { id: ex.id } : undefined }, select: { fullName: true } });
      if (other) messages.push(`ID mesin sudah dipakai ${other.fullName}`);
    }
    out.push({ line: i + 1, action: messages.length ? 'GALAT' : ex ? 'PERBARUI' : 'BARU', messages, values, data: messages.length ? undefined : data, employeeId: ex?.id ?? null });
  }
  await mkdir(dir(), { recursive: true });
  const token = randomToken(24);
  const file: ImportFile = { actorId: actor.userId, createdAt: Date.now(), fileName, rows: out };
  await writeFile(fileOf(token), JSON.stringify(file), { mode: 0o600 });
  return { token, fileName, summary: summarize(out), rows: out.slice(0, 300) };
}

function summarize(rows: PreviewRow[]) {
  return {
    total: rows.length,
    baru: rows.filter((r) => r.action === 'BARU').length,
    perbarui: rows.filter((r) => r.action === 'PERBARUI').length,
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

export async function commitImport(actor: Actor, token: string, opts: { updateExisting: boolean; createAccounts: boolean }) {
  assertCan(actor, 'employee.import');
  const f = await load(actor, token);
  if (f.committed) throw unprocessable('Impor ini sudah diproses.');
  for (const row of f.rows) {
    if (row.action === 'GALAT' || !row.data) { row.result = 'DILEWATI'; continue; }
    if (row.action === 'PERBARUI' && !opts.updateExisting) { row.result = 'DILEWATI'; row.messages.push('NIP sudah ada; pembaruan tidak dipilih'); continue; }
    try {
      if (row.action === 'BARU') {
        const r = await createEmployee(actor, row.data, { createAccount: opts.createAccounts });
        row.employeeId = r.employee.id;
        if (r.account) row.messages.push(`Akun dibuat: ${r.account.username} (password awal = NIP)`);
      } else {
        const cur = await prisma.employee.findUniqueOrThrow({ where: { id: row.employeeId! } });
        // Kolom kosong di berkas tidak menghapus data yang sudah ada.
        const merged: Record<string, unknown> = { ...row.data };
        for (const [k, v] of Object.entries(merged)) if (v === null && k !== 'nik') merged[k] = (cur as Record<string, unknown>)[k] instanceof Date ? ((cur as Record<string, unknown>)[k] as Date).toISOString().slice(0, 10) : (cur as Record<string, unknown>)[k] ?? null;
        await updateEmployee(actor, row.employeeId!, merged, { changeNote: `Impor ${f.fileName}` });
      }
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
  await audit(actor, { action: 'employee.import', entityType: 'Employee', meta: { file: f.fileName, ...summary } });
  return { token, summary, rows: f.rows.slice(0, 300) };
}

/** Berkas hasil validasi/impor: data asli + status + pesan per baris. */
export async function importResultFile(actor: Actor, token: string) {
  const f = await load(actor, token);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hasil validasi');
  const keys = EMPLOYEE_COLUMNS.map(([k]) => k).filter((k) => k !== 'nik');
  ws.addRow(['Baris', 'Tindakan', 'Hasil', 'Pesan', ...EMPLOYEE_COLUMNS.filter(([k]) => k !== 'nik').map(([, h]) => h)]);
  for (const r of f.rows) ws.addRow([r.line, r.action, r.result ?? (r.action === 'GALAT' ? 'Tidak bisa diimpor' : 'Siap'), r.messages.join('; '), ...keys.map((k) => r.values[k] ?? '')]);
  ws.getRow(1).font = { bold: true };
  ws.getColumn(4).width = 60;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
