import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../db';
import { audit } from '../audit';
import { assertCan, can, type Actor } from '../auth/actor';
import { decryptOptional } from '../crypto';
import { toCsv } from '../files/csv';
import { getSettings } from '../settings';
import { BULAN, HARI_PENDEK, fmtJam, fmtTglPendek, fromDbDate, todayIn } from '../time';
import { METHOD_LABEL, STATUS_LABEL } from '../attendance/engine';
import { CALENDAR_LEGEND, calendarRecap, dailyRecords, recap, recordStatus, type RecapRow } from './reports';
import { employeeWhere, listQuery } from './employees';

const RECAP_HEADERS = ['Nama', 'NIP', 'Unit', 'Hari kerja terjadwal', 'Hadir', 'Terlambat (kali)', 'Terlambat (menit)', 'Pulang awal (kali)', 'Pulang awal (menit)', 'Dinas luar', 'Izin', 'Sakit', 'Cuti', 'Alfa', 'Alfa awal', 'Alfa akhir', '% Kehadiran'];
const recapCells = (r: RecapRow) => [r.name, r.employeeNumber ?? '', r.unit ?? '', r.scheduledDays, r.present, r.late, r.lateMinutes, r.earlyLeave, r.earlyLeaveMinutes, r.fieldDuty, r.permit, r.sick, r.leave, r.alfa, r.alfaAwal, r.alfaAkhir, r.attendancePct ?? ''];

const DETAIL_HEADERS = ['Tanggal', 'Nama', 'NIP', 'Unit', 'Jadwal', 'Masuk', 'Metode masuk', 'Pulang', 'Metode pulang', 'Status', 'Terlambat (menit)', 'Pulang awal (menit)', 'Dispensasi', 'Perlu ditinjau', 'Catatan'];

async function detailRows(actor: Actor, raw: unknown) {
  const tz = (await getSettings())['org.timezone'];
  const today = todayIn(tz);
  const out: unknown[][] = [];
  for (let page = 1; ; page++) {
    const r = await dailyRecords(actor, raw, { page, pageSize: 1000, perm: 'attendance.export' });
    for (const x of r.rows) {
      out.push([
        fromDbDate(x.workDate), x.employee.fullName, x.employee.employeeNumber ?? '', x.employee.unit?.name ?? '',
        x.schedule ? `${x.schedule.code} ${x.schedule.checkIn}-${x.schedule.checkOut}` : '',
        fmtJam(x.checkInAt, tz) ?? '', METHOD_LABEL[x.checkInMethod ?? ''] ?? x.checkInMethod ?? '', fmtJam(x.checkOutAt, tz) ?? '', METHOD_LABEL[x.checkOutMethod ?? ''] ?? x.checkOutMethod ?? '',
        STATUS_LABEL[recordStatus(x, today)] ?? x.status, x.lateMinutes, x.earlyLeaveMinutes, x.dispensation ? 'Ya' : '', x.needsReview ? x.reviewReason ?? 'Ya' : '', x.note ?? '',
      ]);
    }
    if (page * r.pageSize >= r.total) break;
  }
  return out;
}

function styleHeader(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A6CC2' } };
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
      ['Catatan', 'Alfa = hari kerja yang sudah lewat tanpa absen. Alfa awal = tidak absen masuk. Alfa akhir = tidak absen pulang. Ajukan koreksi bila ada absen yang tidak tercatat.'],
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
      { h: 'Alfa', w: 40, v: (r: RecapRow) => r.alfa },
      { h: 'Alfa awal/akhir', w: 70, v: (r: RecapRow) => `${r.alfaAwal}/${r.alfaAkhir}` },
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
      .text('Alfa = hari kerja yang sudah lewat tanpa absen. Alfa awal/akhir = tidak absen masuk/pulang.', doc.page.margins.left);
    doc.end();
  });
}

// Pegawai
const CAL_FILL: Record<string, string> = { H: 'FFDCF3E3', T: 'FFFDE7D7', DL: 'FFDCE6FB', I: 'FFD8EFEC', S: 'FFD8EFEC', C: 'FFD8EFEC', A: 'FFF8D9D9', AW: 'FFFBE0EB', AK: 'FFFBE0EB', L: 'FFEEF1F6' };

/** Rekap kalender satu bulan: satu baris per pegawai, satu kolom per tanggal (kode, jam masuk, jam pulang). */
export async function exportCalendar(actor: Actor, raw: Record<string, unknown>) {
  assertCan(actor, 'attendance.export');
  const s = await getSettings();
  const first = await calendarRecap(actor, { ...raw, page: 1, pageSize: 500 }, 'attendance.export');
  const rows = [...first.rows];
  for (let page = 2; (page - 1) * 500 < first.total; page++) rows.push(...(await calendarRecap(actor, { ...raw, page, pageSize: 500 }, 'attendance.export')).rows);
  const { columns, month } = first;
  const label = `${BULAN[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
  await audit(actor, { action: 'attendance.export', entityType: 'AttendanceRecord', meta: { format: 'kalender', month, unitId: raw.unitId || null, q: raw.q || null, rows: rows.length } });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIMPEG';
  const ws = wb.addWorksheet(`Kalender ${month}`);
  ws.addRow([`Rekap absensi ${label}`, `${s['org.name']}`]).font = { bold: true, size: 13 };
  ws.addRow([]);
  const head = ws.addRow(['Nama', 'NIP', 'Unit', ...columns.map((c) => `${HARI_PENDEK[c.weekday]}\n${String(c.day).padStart(2, '0')}`)]);
  head.height = 32;
  head.eachCell((cell, i) => {
    const c = columns[i - 4];
    const bg = c?.holiday ? 'FF5F6878' : c?.weekend ? 'FF0E1B3D' : 'FF1A3A8F';
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    cell.alignment = { horizontal: i > 3 ? 'center' : 'left', vertical: 'middle', wrapText: true };
    if (c?.holiday) cell.note = c.holiday.name;
  });
  for (const r of rows) {
    const row = ws.addRow([
      r.employee.fullName, r.employee.employeeNumber ?? '', r.employee.unit?.name ?? '',
      ...r.cells.map((c) => (c.code ? [c.code, c.code !== 'L' && c.code !== '-' ? `${c.checkIn ?? '--:--'} ${c.checkOut ?? '--:--'}` : '', c.corrected ? 'dikoreksi' : ''].filter(Boolean).join('\n') : '')),
    ]);
    row.height = 44;
    r.cells.forEach((c, i) => {
      const cell = row.getCell(i + 4);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.font = { size: 9, color: { argb: c.missingIn || c.missingOut ? 'FFB91C1C' : 'FF1F2937' } };
      const fill = c.code ? CAL_FILL[c.code] : undefined;
      if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    });
  }
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 18;
  columns.forEach((_, i) => { ws.getColumn(i + 4).width = 9; });
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }];
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  const info = wb.addWorksheet('Keterangan');
  info.addRows([
    ['Instansi', s['org.name']], ['Bulan', label], ['Dibuat', new Date().toISOString()], ['Oleh', actor.username], [],
    ['Kode', 'Arti'], ...CALENDAR_LEGEND,
    [], ['Jam', 'Kiri jam masuk, kanan jam pulang. --:-- berwarna merah = tidak absen masuk atau pulang.'],
    ['Kepala kolom', 'Biru tua = akhir pekan, abu-abu = hari libur (nama libur ada di komentar sel).'],
    ...columns.filter((c) => c.holiday).map((c) => [c.date, `${c.holiday!.name}${c.holiday!.kind === 'CUTI_BERSAMA' ? ' (cuti bersama)' : ''}`]),
  ]);
  info.getColumn(1).width = 14;
  info.getColumn(2).width = 70;
  return { filename: `absensi-kalender-${month}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: Buffer.from(await wb.xlsx.writeBuffer()) };
}

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
  styleHeader(ws);
  ws.getColumn(3).width = 36;
  const units = await prisma.organizationUnit.findMany({ where: { deletedAt: null, isActive: true }, select: { code: true, name: true }, orderBy: { name: 'asc' } });
  // Nomor dan tanggal diformat Teks: tanpa ini Excel mengubah NIP 18 digit menjadi angka 15 digit dan membuang 0 di depan telepon.
  const ROWS = 2000;
  const col = (k: string) => EMPLOYEE_COLUMNS.findIndex(([key]) => key === k) + 1;
  for (const k of ['nip', 'nik', 'tanggal_lahir', 'telepon', 'nip_atasan', 'tanggal_mulai', 'id_mesin']) ws.getColumn(col(k)).numFmt = '@';
  for (let r = 2; r <= ROWS + 1; r++) {
    ws.getCell(r, col('jenis_kelamin')).dataValidation = { type: 'list', allowBlank: true, formulae: ['"L,P"'], showErrorMessage: true, errorTitle: 'Jenis kelamin', error: 'Isi L atau P.' };
    if (units.length) ws.getCell(r, col('kode_unit')).dataValidation = { type: 'list', allowBlank: true, formulae: [`'Kode unit'!$A$2:$A$${units.length + 1}`], showErrorMessage: true, errorTitle: 'Kode unit', error: 'Pilih kode dari sheet "Kode unit".' };
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const u = wb.addWorksheet('Kode unit');
  u.addRow(['Kode unit', 'Nama unit']);
  units.forEach((x) => u.addRow([x.code, x.name]));
  styleHeader(u);

  const help = wb.addWorksheet('Petunjuk');
  help.addRow(['Kolom', 'Wajib', 'Contoh', 'Keterangan']);
  const notes: Record<string, [string, string, string]> = {
    nip: ['Tidak', '198001012005011001', 'Ketik sebagai teks (kolom sudah berformat Teks). NIP yang sudah ada akan diperbarui.'],
    nik: ['Tidak', '3171010101800001', '16 angka.'],
    nama: ['Ya', 'Contoh Nama Pegawai', 'Tanpa gelar; gelar diisi di kolomnya sendiri.'],
    gelar_belakang: ['Tidak', 'S.Pd.', ''],
    tanggal_lahir: ['Tidak', '1980-01-01', 'Format YYYY-MM-DD atau DD/MM/YYYY.'],
    jenis_kelamin: ['Tidak', 'L', 'L atau P.'],
    telepon: ['Tidak', '08123456789', ''],
    email: ['Tidak', 'nama@instansi.go.id', ''],
    status_kepegawaian: ['Tidak', 'PNS', 'Mis. PNS, PPPK, Honorer.'],
    kode_unit: ['Ya*', units[0]?.code ?? 'KODE-UNIT', 'Pilih dari sheet "Kode unit". *Wajib bila Anda hanya berwenang atas unit tertentu.'],
    nip_atasan: ['Tidak', '197501012000011001', 'Atasan harus sudah ada di data pegawai.'],
    tanggal_mulai: ['Tidak', '2005-01-01', ''],
    id_mesin: ['Tidak', '101', 'PIN/ID pegawai di mesin absensi; tidak boleh dipakai pegawai lain.'],
  };
  for (const [k, label] of EMPLOYEE_COLUMNS) { const n = notes[k]; help.addRow([label, n?.[0] ?? 'Tidak', n?.[1] ?? '', n?.[2] ?? '']); }
  styleHeader(help);
  help.getColumn(1).width = 34; help.getColumn(3).width = 24; help.getColumn(4).width = 80;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
