import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { audit } from '../audit';
import { can, employeeScopeWhere, unitInScope, type Actor } from '../auth/actor';
import { realUserId } from '../auth/system';
import { conflict, forbidden, notFound, unprocessable } from '../errors';
import { getSetting } from '../settings';
import { dateRange, fromDbDate, isValidDate, toDbDate, todayIn, BULAN } from '../time';
import { removeStored, saveFile } from '../storage';
import { notifyEmployee, notifyUsers, usersWithPermission } from './notifications';

export const monthText = (m: string) => `${BULAN[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const isMonth = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 5_000_000;
const DOC_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'txt', 'csv']);
export const ATTACH_MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
  txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
};

/** Jenis berkas dari ISI (bukan nama): tanda tangan biner untuk gambar, PDF, Office; teks polos untuk txt dan csv. */
export function documentExt(name: string, buf: Buffer): string | null {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (!DOC_EXT.has(ext)) return null;
  const starts = (sig: number[]) => sig.every((b, i) => buf[i] === b);
  const kind =
    ext === 'pdf' ? starts([0x25, 0x50, 0x44, 0x46])
    : ext === 'png' ? starts([0x89, 0x50, 0x4e, 0x47])
    : ext === 'jpg' || ext === 'jpeg' ? starts([0xff, 0xd8, 0xff])
    : ext === 'webp' ? starts([0x52, 0x49, 0x46, 0x46])
    : ['docx', 'xlsx', 'pptx'].includes(ext) ? starts([0x50, 0x4b, 0x03, 0x04])
    : ['doc', 'xls', 'ppt'].includes(ext) ? starts([0xd0, 0xcf, 0x11, 0xe0])
    : !buf.subarray(0, 4096).includes(0); // txt, csv: tanpa byte nol
  return kind ? ext : null;
}

const content = z.string().trim().min(5, 'Uraikan pekerjaan minimal 5 karakter').max(4000, 'Maksimal 4.000 karakter');

export const dailyInput = z.object({ date: z.string().refine(isValidDate, 'Tanggal tidak valid'), content });

async function ownEmployeeId(actor: Actor) {
  if (!actor.employeeId || !can(actor, 'report.self')) throw forbidden('Laporan kinerja hanya untuk akun pegawai.');
  return actor.employeeId;
}

/** Bulan yang masih bisa diedit: belum dikirim, atau dikembalikan atasan. */
const editable = (status: string | undefined) => !status || status === 'DRAFT' || status === 'RETURNED';

// ---------------------------------------------------------------------------
// Pegawai
// ---------------------------------------------------------------------------

/** Laporan satu bulan milik pegawai: header bulan dan satu baris per tanggal sampai hari ini. */
export async function myMonth(actor: Actor, month: string) {
  const employeeId = await ownEmployeeId(actor);
  if (!isMonth(month)) throw unprocessable('Bulan tidak valid.');
  const tz = await getSetting('org.timezone');
  const today = todayIn(tz);
  const last = month === today.slice(0, 7) ? today : `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()).padStart(2, '0')}`;
  const [header, reports, records] = await Promise.all([
    prisma.monthlyReport.findUnique({ where: { employeeId_month: { employeeId, month } } }),
    prisma.dailyReport.findMany({ where: { employeeId, workDate: { gte: toDbDate(`${month}-01`), lte: toDbDate(last) } }, include: { attachments: { orderBy: { createdAt: 'asc' } } } }),
    prisma.attendanceRecord.findMany({ where: { employeeId, workDate: { gte: toDbDate(`${month}-01`), lte: toDbDate(last) } }, select: { workDate: true, status: true, isOffDay: true } }),
  ]);
  const byDate = new Map(reports.map((r) => [fromDbDate(r.workDate), r]));
  const rec = new Map(records.map((r) => [fromDbDate(r.workDate), r]));
  const days = month > today.slice(0, 7) ? [] : dateRange(`${month}-01`, last).reverse().map((date) => {
    const r = byDate.get(date);
    return {
      date, isOff: rec.get(date)?.isOffDay ?? false, attendance: rec.get(date)?.status ?? null,
      report: r ? { id: r.id, content: r.content, updatedAt: r.updatedAt, attachments: r.attachments.map((a) => ({ id: a.id, fileName: a.fileName, size: a.size })) } : null,
    };
  });
  return {
    month, today, header: header && { id: header.id, status: header.status, summary: header.summary, score: header.score, reviewNote: header.reviewNote, submittedAt: header.submittedAt, reviewedAt: header.reviewedAt },
    editable: editable(header?.status), days, filled: reports.length,
  };
}

/** Simpan laporan satu hari (buat atau ubah) beserta lampiran baru dan lampiran yang dihapus. */
export async function saveDailyReport(actor: Actor, raw: unknown, files: { name: string; buffer: Buffer }[], removeIds: string[]) {
  const employeeId = await ownEmployeeId(actor);
  const v = dailyInput.parse(raw);
  const today = todayIn(await getSetting('org.timezone'));
  if (v.date > today) throw unprocessable('Laporan tidak bisa diisi untuk tanggal yang belum tiba.', { date: 'Maksimal hari ini' });
  const month = v.date.slice(0, 7);
  const header = await prisma.monthlyReport.findUnique({ where: { employeeId_month: { employeeId, month } } });
  if (!editable(header?.status)) throw conflict(`Laporan ${monthText(month)} sudah dikirim ke atasan dan tidak bisa diubah.`);

  const wd = toDbDate(v.date);
  const existing = await prisma.dailyReport.findUnique({ where: { employeeId_workDate: { employeeId, workDate: wd } }, include: { attachments: true } });
  const keep = (existing?.attachments ?? []).filter((a) => !removeIds.includes(a.id));
  if (keep.length + files.length > MAX_FILES) throw unprocessable(`Maksimal ${MAX_FILES} lampiran per hari.`, { files: 'Terlalu banyak' });
  const checked = files.map((f) => {
    const ext = documentExt(f.name, f.buffer);
    if (!ext) throw unprocessable(`Berkas "${f.name}" tidak didukung. Gunakan PDF, gambar, Word, Excel, PowerPoint, TXT, atau CSV.`, { files: 'Format tidak didukung' });
    if (f.buffer.length > MAX_FILE_BYTES) throw unprocessable(`Berkas "${f.name}" lebih dari ${MAX_FILE_BYTES / 1_000_000} MB.`, { files: 'Terlalu besar' });
    return { ...f, ext };
  });
  const stored: { fileName: string; path: string; mime: string; size: number }[] = [];
  for (const f of checked) stored.push({ fileName: f.name.slice(0, 150), path: await saveFile(`laporan/${month}`, f.buffer, f.ext), mime: ATTACH_MIME[f.ext], size: f.buffer.length });

  const report = existing
    ? await prisma.dailyReport.update({ where: { id: existing.id }, data: { content: v.content } })
    : await prisma.dailyReport.create({ data: { employeeId, workDate: wd, content: v.content } });
  const gone = (existing?.attachments ?? []).filter((a) => removeIds.includes(a.id));
  if (gone.length) await prisma.dailyReportAttachment.deleteMany({ where: { id: { in: gone.map((a) => a.id) } } });
  if (stored.length) await prisma.dailyReportAttachment.createMany({ data: stored.map((s) => ({ ...s, dailyReportId: report.id })) });
  for (const g of gone) await removeStored(g.path);
  // Bulan yang dikembalikan tetap bisa diperbaiki; status baru berubah saat dikirim ulang.
  if (!header) await prisma.monthlyReport.create({ data: { employeeId, month } }).catch(() => undefined);
  await audit(actor, { action: existing ? 'report.daily_update' : 'report.daily_create', entityType: 'DailyReport', entityId: report.id, meta: { date: v.date, files: stored.length, removed: gone.length } });
  return { id: report.id };
}

export async function deleteDailyReport(actor: Actor, id: string) {
  const employeeId = await ownEmployeeId(actor);
  const r = await prisma.dailyReport.findFirst({ where: { id, employeeId }, include: { attachments: true } });
  if (!r) throw notFound('Laporan tidak ditemukan.');
  const month = fromDbDate(r.workDate).slice(0, 7);
  const header = await prisma.monthlyReport.findUnique({ where: { employeeId_month: { employeeId, month } } });
  if (!editable(header?.status)) throw conflict(`Laporan ${monthText(month)} sudah dikirim ke atasan dan tidak bisa diubah.`);
  await prisma.dailyReport.delete({ where: { id } });
  for (const a of r.attachments) await removeStored(a.path);
  await audit(actor, { action: 'report.daily_delete', entityType: 'DailyReport', entityId: id });
}

/** Kirim laporan bulan itu ke atasan langsung untuk dinilai. */
export async function submitMonth(actor: Actor, month: string, summary: string | null) {
  const employeeId = await ownEmployeeId(actor);
  if (!isMonth(month)) throw unprocessable('Bulan tidak valid.');
  const today = todayIn(await getSetting('org.timezone'));
  if (month > today.slice(0, 7)) throw unprocessable('Bulan ini belum bisa dikirim.');
  const header = await prisma.monthlyReport.findUnique({ where: { employeeId_month: { employeeId, month } } });
  if (!editable(header?.status)) throw conflict('Laporan bulan ini sudah dikirim.');
  const filled = await prisma.dailyReport.count({ where: { employeeId, workDate: { gte: toDbDate(`${month}-01`), lte: toDbDate(`${month}-31`) } } });
  if (!filled) throw unprocessable('Isi minimal satu laporan harian sebelum mengirim.');
  const data = { status: 'SUBMITTED' as const, summary: summary?.trim().slice(0, 2000) || null, submittedAt: new Date(), reviewerId: null, reviewedAt: null, score: null, reviewNote: null };
  const rep = await prisma.monthlyReport.upsert({ where: { employeeId_month: { employeeId, month } }, update: data, create: { employeeId, month, ...data } });
  await audit(actor, { action: 'report.submit', entityType: 'MonthlyReport', entityId: rep.id, meta: { month, filled } });

  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { fullName: true, unitId: true, supervisorId: true } });
  const n = { type: 'report_submitted', title: `Laporan kinerja ${monthText(month)} dari ${emp.fullName}`, body: `${filled} laporan harian menunggu penilaian Anda.`, link: `/kinerja/tinjau/${rep.id}` };
  if (emp.supervisorId) await notifyEmployee(emp.supervisorId, n);
  else await notifyUsers(await usersWithPermission('report.manage', emp.unitId), n);
  await notifyEmployee(employeeId, { type: 'report_sent', title: `Laporan ${monthText(month)} terkirim`, body: 'Menunggu penilaian atasan langsung.', link: `/kinerja/laporan?bulan=${month}` });
  return { id: rep.id };
}

// ---------------------------------------------------------------------------
// Atasan
// ---------------------------------------------------------------------------

/** Laporan yang boleh dilihat/dinilai: bawahan langsung, atau semua pegawai dalam cakupan untuk pengelola. */
function reviewScope(actor: Actor): Prisma.MonthlyReportWhereInput {
  const ors: Prisma.MonthlyReportWhereInput[] = [];
  if (can(actor, 'report.review') && actor.employeeId) ors.push({ employee: { supervisorId: actor.employeeId } });
  if (can(actor, 'report.manage')) ors.push({ employee: employeeScopeWhere(actor, 'report.manage') });
  if (!ors.length) throw forbidden();
  const self = actor.employeeId ? { NOT: { employeeId: actor.employeeId } } : {};
  return { AND: [{ OR: ors }, self] };
}

export const reviewQuery = z.object({
  status: z.enum(['SUBMITTED', 'APPROVED', 'RETURNED', 'ALL']).catch('SUBMITTED').default('SUBMITTED'),
  month: z.string().refine(isMonth).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  per: z.coerce.number().int().catch(20).default(20),
});

export async function reviewQueue(actor: Actor, raw: unknown) {
  const q = reviewQuery.parse(raw);
  const where: Prisma.MonthlyReportWhereInput = {
    AND: [reviewScope(actor), q.status === 'ALL' ? { status: { not: 'DRAFT' } } : { status: q.status }, q.month ? { month: q.month } : {}],
  };
  const per = [5, 10, 20, 50, 100, 200, 500].includes(q.per) ? q.per : 20;
  const total = await prisma.monthlyReport.count({ where });
  const page = Math.min(q.page, Math.max(1, Math.ceil(total / per)));
  const rows = await prisma.monthlyReport.findMany({
    where, orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * per, take: per,
    include: { employee: { select: { id: true, fullName: true, employeeNumber: true, unit: { select: { name: true } } } } },
  });
  const filled = await Promise.all(rows.map((r) => prisma.dailyReport.count({ where: { employeeId: r.employeeId, workDate: { gte: toDbDate(`${r.month}-01`), lte: toDbDate(`${r.month}-31`) } } })));
  return { total, page, pageSize: per, status: q.status, rows: rows.map((r, i) => ({ ...r, filled: filled[i] })) };
}

async function reportForReview(actor: Actor, id: string) {
  // Tanpa izin menilai, hanya laporan milik sendiri yang terlihat; selebihnya dianggap tidak ada.
  let scope: Prisma.MonthlyReportWhereInput[] = [];
  try { scope = [reviewScope(actor)]; } catch { /* tidak berhak menilai */ }
  const rep = await prisma.monthlyReport.findFirst({ where: { AND: [{ id }, { OR: [...scope, ...(actor.employeeId ? [{ employeeId: actor.employeeId }] : [])] }] }, include: { employee: { select: { id: true, fullName: true, employeeNumber: true, position: true, supervisorId: true, unitId: true, unit: { select: { name: true } } } } } });
  if (!rep) throw notFound('Laporan tidak ditemukan.');
  return rep;
}

export async function getReport(actor: Actor, id: string) {
  const rep = await reportForReview(actor, id);
  const days = await prisma.dailyReport.findMany({
    where: { employeeId: rep.employeeId, workDate: { gte: toDbDate(`${rep.month}-01`), lte: toDbDate(`${rep.month}-31`) } },
    include: { attachments: { orderBy: { createdAt: 'asc' } } }, orderBy: { workDate: 'asc' },
  });
  const own = rep.employeeId === actor.employeeId;
  const isSupervisor = !!actor.employeeId && rep.employee.supervisorId === actor.employeeId;
  const reviewer = rep.reviewerId ? await prisma.user.findUnique({ where: { id: rep.reviewerId }, select: { username: true, employee: { select: { fullName: true } } } }) : null;
  return {
    ...rep,
    reviewerName: reviewer ? reviewer.employee?.fullName ?? reviewer.username : null,
    days: days.map((d) => ({ id: d.id, date: fromDbDate(d.workDate), content: d.content, attachments: d.attachments.map((a) => ({ id: a.id, fileName: a.fileName, size: a.size })) })),
    canReview: !own && rep.status === 'SUBMITTED' && (isSupervisor ? can(actor, 'report.review') : can(actor, 'report.manage') && unitInScope(actor, 'report.manage', rep.employee.unitId)),
  };
}

export const reviewInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), score: z.coerce.number().int().min(1, 'Nilai 1 sampai 100').max(100, 'Nilai 1 sampai 100'), note: z.string().trim().max(1000).optional().nullable() }),
  z.object({ action: z.literal('return'), note: z.string().trim().min(5, 'Jelaskan bagian yang perlu diperbaiki (min. 5 karakter)').max(1000) }),
]);

export async function reviewMonthly(actor: Actor, id: string, raw: unknown) {
  const v = reviewInput.parse(raw);
  const rep = await getReport(actor, id);
  if (rep.employeeId === actor.employeeId) throw forbidden('Laporan sendiri dinilai oleh atasan.');
  if (!rep.canReview) throw conflict(rep.status === 'SUBMITTED' ? 'Anda bukan atasan langsung pegawai ini.' : 'Laporan ini sudah diproses.');
  const done = await prisma.monthlyReport.updateMany({
    where: { id, status: 'SUBMITTED' },
    data: v.action === 'approve'
      ? { status: 'APPROVED', score: v.score, reviewNote: v.note || null, reviewerId: realUserId(actor), reviewedAt: new Date() }
      : { status: 'RETURNED', score: null, reviewNote: v.note, reviewerId: realUserId(actor), reviewedAt: new Date() },
  });
  if (!done.count) throw conflict('Laporan ini sudah diproses.');
  await audit(actor, { action: v.action === 'approve' ? 'report.approve' : 'report.return', entityType: 'MonthlyReport', entityId: id, meta: { month: rep.month, employeeId: rep.employeeId, ...(v.action === 'approve' ? { score: v.score } : {}) } });
  await notifyEmployee(rep.employeeId, v.action === 'approve'
    ? { type: 'report_reviewed', title: `Laporan ${monthText(rep.month)} dinilai: ${v.score}`, body: v.note || null, link: `/kinerja/laporan?bulan=${rep.month}` }
    : { type: 'report_reviewed', title: `Laporan ${monthText(rep.month)} dikembalikan`, body: v.note, link: `/kinerja/laporan?bulan=${rep.month}` });
}

/** Berkas lampiran, dengan pemeriksaan hak akses: pemilik, atasan langsung, atau pengelola dalam cakupan. */
export async function attachmentFor(actor: Actor, attachmentId: string) {
  const a = await prisma.dailyReportAttachment.findUnique({ where: { id: attachmentId }, include: { report: true } });
  if (!a) throw notFound('Lampiran tidak ditemukan.');
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: a.report.employeeId }, select: { id: true, supervisorId: true, unitId: true } });
  const ok =
    emp.id === actor.employeeId ||
    (!!actor.employeeId && emp.supervisorId === actor.employeeId && can(actor, 'report.review')) ||
    (can(actor, 'report.manage') && unitInScope(actor, 'report.manage', emp.unitId));
  if (!ok) throw notFound('Lampiran tidak ditemukan.');
  return a;
}

/** Jumlah laporan bulanan yang menunggu penilaian (lencana menu). */
export async function pendingReviewCount(actor: Actor) {
  if (!can(actor, 'report.review') && !can(actor, 'report.manage')) return 0;
  return prisma.monthlyReport.count({ where: { AND: [reviewScope(actor), { status: 'SUBMITTED' }] } });
}
