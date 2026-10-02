import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../db';
import { audit } from '../audit';
import { assertCan, can, type Actor } from '../auth/actor';
import { decryptOptional } from '../crypto';
import { toCsv } from '../files/csv';
import { getSettings } from '../settings';
import { fmtJam, fmtTglPendek, fromDbDate } from '../time';
import { METHOD_LABEL, STATUS_LABEL } from '../attendance/engine';
import { dailyRecords, recap, type RecapRow } from './reports';
import { employeeWhere, listQuery } from './employees';

const RECAP_HEADERS = ['Nama', 'NIP', 'Unit', 'Hari kerja terjadwal', 'Hadir', 'Terlambat (kali)', 'Terlambat (menit)', 'Pulang awal (kali)', 'Pulang awal (menit)', 'Dinas luar', 'Izin', 'Sakit', 'Cuti', 'Tidak hadir', 'Tanpa transaksi', '% Kehadiran'];
const recapCells = (r: RecapRow) => [r.name, r.employeeNumber ?? '', r.unit ?? '', r.scheduledDays, r.present, r.late, r.lateMinutes, r.earlyLeave, r.earlyLeaveMinutes, r.fieldDuty, r.permit, r.sick, r.leave, r.absent, r.noRecord, r.attendancePct ?? ''];

const DETAIL_HEADERS = ['Tanggal', 'Nama', 'NIP', 'Unit', 'Jadwal', 'Masuk', 'Metode masuk', 'Pulang', 'Metode pulang', 'Status', 'Terlambat (menit)', 'Pulang awal (menit)', 'Dispensasi', 'Perlu ditinjau', 'Catatan'];

async function detailRows(actor: Actor, raw: unknown) {
  const tz = (await getSettings())['org.timezone'];
  const out: unknown[][] = [];
  for (let page = 1; ; page++) {
    const r = await dailyRecords(actor, raw, { page, pageSize: 1000, perm: 'attendance.export' });
    for (const x of r.rows) {
      out.push([
        fromDbDate(x.workDate), x.employee.fullName, x.employee.employeeNumber ?? '', x.employee.unit?.name ?? '',
        x.schedule ? `${x.schedule.code} ${x.schedule.checkIn}-${x.schedule.checkOut}` : '',
        fmtJam(x.checkInAt, tz) ?? '', METHOD_LABEL[x.checkInMethod ?? ''] ?? x.checkInMethod ?? '', fmtJam(x.checkOutAt, tz) ?? '', METHOD_LABEL[x.checkOutMethod ?? ''] ?? x.checkOutMethod ?? '',
        STATUS_LABEL[x.status] ?? x.status, x.lateMinutes, x.earlyLeaveMinutes, x.dispensation ? 'Ya' : '', x.needsReview ? x.reviewReason ?? 'Ya' : '', x.note ?? '',
      ]);
    }
    if (page * r.pageSize >= r.total) break;
  }
  return out;
}

function styleHeader(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C1A45' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.columns.forEach((c) => { c.width = 16; });
  if (ws.columns[1]) ws.getColumn(2).width = 30;
}

export async function exportAttendance(actor: Actor, raw: unknown, format: 'xlsx' | 'csv' | 'csv-rekap' | 'pdf') {
  assertCan(actor, 'attendance.export');
  const { filter, rows } = await recap(actor, raw, 'attendance.export');
  const s = await getSettings();
  const title = `Rekap absensi ${fmtTglPendek(filter.from)} sampai ${fmtTglPendek(filter.to)}`;
  await audit(actor, { action: 'attendance.export', entityType: 'AttendanceRecord', meta: { format, ...filter, rows: rows.length } });
  const base = `absensi-${filter.from}_sd_${filter.to}`;
  if (format === 'csv-rekap') return { filename: `${base}-rekap.csv`, type: 'text/csv; charset=utf-8', body: Buffer.from(toCsv([RECAP_HEADERS, ...rows.map(recapCells)])) };
  if (format === 'csv') return { filename: `${base}-detail.csv`, type: 'text/csv; charset=utf-8', body: Buffer.from(toCsv([DETAIL_HEADERS, ...(await detailRows(actor, raw))])) };
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIMPEG';
    const r = wb.addWorksheet('Rekap');
    r.addRow(RECAP_HEADERS);
    rows.forEach((x) => r.addRow(recapCells(x)));
    styleHeader(r);
    const d = wb.addWorksheet('Detail');
    d.addRow(DETAIL_HEADERS);
    (await detailRows(actor, raw)).forEach((x) => d.addRow(x));
    styleHeader(d);
    const info = wb.addWorksheet('Keterangan');
    info.addRows([
      ['Instansi', s['org.name']], ['Periode', `${filter.from} sampai ${filter.to}`], ['Dibuat', new Date().toISOString()], ['Oleh', actor.username],
      ['Catatan', '"Tanpa transaksi" adalah hari kerja terjadwal tanpa catatan absensi. Bukan otomatis tidak hadir sebelum diperiksa petugas.'],
    ]);
    info.getColumn(1).width = 14;
    info.getColumn(2).width = 100;
    return { filename: `${base}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: Buffer.from(await wb.xlsx.writeBuffer()) };
  }
  return { filename: `${base}.pdf`, type: 'application/pdf', body: await recapPdf(s['org.name'], title, rows) };
}

function recapPdf(org: string, title: string, rows: RecapRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32, info: { Title: title, Author: org } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(14).text(org);
    doc.font('Helvetica').fontSize(11).text(title);
    doc.moveDown(0.6);
    const cols = [
      { h: 'Nama', w: 170, v: (r: RecapRow) => r.name },
      { h: 'NIP', w: 95, v: (r: RecapRow) => r.employeeNumber ?? '' },
      { h: 'Unit', w: 110, v: (r: RecapRow) => r.unit ?? '' },
      { h: 'Hari kerja', w: 50, v: (r: RecapRow) => r.scheduledDays },
      { h: 'Hadir', w: 40, v: (r: RecapRow) => r.present },
      { h: 'Terlambat', w: 55, v: (r: RecapRow) => `${r.late} (${r.lateMinutes}m)` },
      { h: 'Dinas', w: 38, v: (r: RecapRow) => r.fieldDuty },
      { h: 'Izin/Sakit/Cuti', w: 70, v: (r: RecapRow) => r.permit + r.sick + r.leave },
      { h: 'Tidak hadir', w: 50, v: (r: RecapRow) => r.absent },
      { h: 'Tanpa transaksi', w: 60, v: (r: RecapRow) => r.noRecord },
      { h: '%', w: 40, v: (r: RecapRow) => (r.attendancePct == null ? '' : `${r.attendancePct}`) },
    ];
    const drawRow = (vals: string[], bold: boolean) => {
      const y = doc.y;
      let x = doc.page.margins.left;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
      vals.forEach((v, i) => { doc.text(v, x + 2, y + 3, { width: cols[i].w - 4, height: 12, ellipsis: true }); x += cols[i].w; });
      doc.moveTo(doc.page.margins.left, y + 16).lineTo(x, y + 16).strokeColor('#e2e7f0').stroke();
      doc.y = y + 17;
    };
    drawRow(cols.map((c) => c.h), true);
    for (const r of rows) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 30) { doc.addPage(); drawRow(cols.map((c) => c.h), true); }
      drawRow(cols.map((c) => String(c.v(r))), false);
    }
    doc.moveDown(1).font('Helvetica').fontSize(8).fillColor('#556079')
      .text('"Tanpa transaksi" = hari kerja terjadwal tanpa catatan absensi; bukan otomatis tidak hadir sebelum diperiksa petugas.', doc.page.margins.left);
    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Pegawai
// ---------------------------------------------------------------------------

export const EMPLOYEE_COLUMNS = [
  ['nip', 'NIP'], ['nik', 'NIK'], ['nama', 'Nama lengkap'], ['gelar_depan', 'Gelar depan'], ['gelar_belakang', 'Gelar belakang'],
  ['tempat_lahir', 'Tempat lahir'], ['tanggal_lahir', 'Tanggal lahir (YYYY-MM-DD)'], ['jenis_kelamin', 'Jenis kelamin (L/P)'], ['alamat', 'Alamat'],
  ['telepon', 'Telepon'], ['email', 'Email'], ['status_kepegawaian', 'Status kepegawaian'], ['jabatan', 'Jabatan'], ['pangkat_golongan', 'Pangkat/golongan'],
  ['kode_unit', 'Kode unit kerja'], ['nip_atasan', 'NIP atasan langsung'], ['tanggal_mulai', 'Tanggal mulai bekerja (YYYY-MM-DD)'], ['id_mesin', 'ID mesin absensi'],
] as const;

export async function exportEmployees(actor: Actor, raw: unknown, format: 'xlsx' | 'csv', includeNik: boolean) {
  assertCan(actor, 'employee.export');
  const q = listQuery.parse({ ...(raw as object), page: 1, pageSize: 200 });
  const withNik = includeNik && can(actor, 'employee.read_sensitive');
  const rows = await prisma.employee.findMany({
    where: employeeWhere(actor, q, 'employee.export'),
    include: { unit: { select: { code: true } }, supervisor: { select: { employeeNumber: true } } },
    orderBy: { fullName: 'asc' },
  });
  const cols = EMPLOYEE_COLUMNS.filter(([k]) => k !== 'nik' || withNik);
  const data = rows.map((e) => {
    const m: Record<string, unknown> = {
      nip: e.employeeNumber ?? '', nik: withNik ? decryptOptional(e.nikEnc) ?? '' : '', nama: e.fullName, gelar_depan: e.frontTitle ?? '', gelar_belakang: e.backTitle ?? '',
      tempat_lahir: e.birthPlace ?? '', tanggal_lahir: e.birthDate ? fromDbDate(e.birthDate) : '', jenis_kelamin: e.gender ?? '', alamat: e.address ?? '', telepon: e.phone ?? '',
      email: e.email ?? '', status_kepegawaian: e.employmentStatus ?? '', jabatan: e.position ?? '', pangkat_golongan: e.rank ?? '', kode_unit: e.unit?.code ?? '',
      nip_atasan: e.supervisor?.employeeNumber ?? '', tanggal_mulai: e.startDate ? fromDbDate(e.startDate) : '', id_mesin: e.machinePin ?? '',
    };
    return cols.map(([k]) => m[k]);
  });
  await audit(actor, { action: withNik ? 'employee.export_sensitive' : 'employee.export', entityType: 'Employee', meta: { format, rows: rows.length, nik: withNik } });
  if (format === 'csv') return { filename: 'pegawai.csv', type: 'text/csv; charset=utf-8', body: Buffer.from(toCsv([cols.map(([, h]) => h), ...data])) };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pegawai');
  ws.addRow(cols.map(([, h]) => h));
  data.forEach((r) => ws.addRow(r));
  styleHeader(ws);
  return { filename: 'pegawai.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: Buffer.from(await wb.xlsx.writeBuffer()) };
}

export async function employeeTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pegawai');
  ws.addRow(EMPLOYEE_COLUMNS.map(([, h]) => h));
  ws.addRow(['198001012005011001', '', 'Contoh Nama Pegawai (hapus baris ini)', '', 'S.Pd.', 'Jakarta', '1980-01-01', 'L', '', '08123456789', 'contoh@instansi.go.id', 'PNS', 'Guru Ahli Pertama', 'III/a', 'KODE-UNIT', '', '2005-01-01', '101']);
  styleHeader(ws);
  ws.getColumn(3).width = 36;
  const units = await prisma.organizationUnit.findMany({ where: { deletedAt: null, isActive: true }, select: { code: true, name: true }, orderBy: { name: 'asc' } });
  const u = wb.addWorksheet('Kode unit');
  u.addRow(['Kode unit', 'Nama unit']);
  units.forEach((x) => u.addRow([x.code, x.name]));
  styleHeader(u);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
