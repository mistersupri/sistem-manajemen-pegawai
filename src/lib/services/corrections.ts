import { z } from 'zod';
import { clampPage, listSchema } from '../list';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { audit } from '../audit';
import { can, employeeScopeWhere, getEmployeeInScope, type Actor } from '../auth/actor';
import { realUserId } from '../auth/system';
import { conflict, forbidden, notFound, unprocessable } from '../errors';
import { getSettings } from '../settings';
import { addDays, fmtJam, fmtTglPendek, fromDbDate, isValidDate, isValidTime, toDbDate, todayIn } from '../time';
import { rebuildRecord } from '../attendance/record';
import { notifyEmployee, notifyPermission, notifyUsers } from './notifications';

export const KIND_LABEL: Record<string, string> = {
  LUPA_MASUK: 'Lupa absen masuk',
  LUPA_PULANG: 'Lupa absen pulang',
  LUPA_KEDUANYA: 'Lupa absen masuk dan pulang',
  TERLAMBAT: 'Terlambat karena alasan sah',
  PULANG_CEPAT: 'Pulang lebih awal karena alasan sah',
  GANGGUAN_ALAT: 'Gangguan kamera atau mesin absensi',
  LAINNYA: 'Lainnya',
  KOREKSI_ADMIN: 'Koreksi oleh petugas',
};

const time = z.string().optional().nullable().transform((v) => v || null).refine((v) => v === null || isValidTime(v), 'Format jam HH:MM');

export const requestInput = z.object({
  workDate: z.string().refine(isValidDate, 'Tanggal tidak valid'),
  kind: z.enum(['LUPA_MASUK', 'LUPA_PULANG', 'LUPA_KEDUANYA', 'TERLAMBAT', 'PULANG_CEPAT', 'GANGGUAN_ALAT', 'LAINNYA']),
  proposedCheckIn: time,
  proposedCheckOut: time,
  reason: z.string().trim().min(10, 'Jelaskan alasan minimal 10 karakter').max(1000),
});

export const adminInput = z.object({
  employeeId: z.string().uuid(),
  workDate: z.string().refine(isValidDate, 'Tanggal tidak valid'),
  proposedCheckIn: time,
  proposedCheckOut: time,
  proposedStatus: z.enum(['HADIR', 'TERLAMBAT', 'DINAS_LUAR', 'IZIN', 'SAKIT', 'CUTI', 'TIDAK_HADIR']).optional().nullable().transform((v) => v ?? null),
  dispensation: z.boolean().default(false),
  reason: z.string().trim().min(10, 'Jelaskan alasan minimal 10 karakter').max(1000),
});

export const reviewInput = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(1000).optional().nullable(),
  proposedCheckIn: time,
  proposedCheckOut: time,
  proposedStatus: z.enum(['HADIR', 'TERLAMBAT', 'DINAS_LUAR', 'IZIN', 'SAKIT', 'CUTI', 'TIDAK_HADIR']).optional().nullable().transform((v) => v ?? null),
  dispensation: z.boolean().optional(),
});

async function snapshot(employeeId: string, workDate: string, tz: string) {
  const rec = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate: toDbDate(workDate) } } });
  return rec
    ? { checkIn: fmtJam(rec.checkInAt, tz), checkOut: fmtJam(rec.checkOutAt, tz), status: rec.status, lateMinutes: rec.lateMinutes, earlyLeaveMinutes: rec.earlyLeaveMinutes, dispensation: rec.dispensation, recordId: rec.id }
    : null;
}

async function checkWindow(workDate: string) {
  const s = await getSettings();
  const today = todayIn(s['org.timezone']);
  if (workDate > today) throw unprocessable('Tanggal tidak boleh di masa depan.', { workDate: 'Maksimal hari ini' });
  if (workDate < addDays(today, -Number(s['rules.backdateDays']))) throw unprocessable(`Koreksi hanya untuk ${s['rules.backdateDays']} hari ke belakang.`, { workDate: 'Terlalu lama' });
  return s;
}

/** Pegawai mengajukan koreksi absensinya sendiri. */
export async function requestCorrection(actor: Actor, raw: unknown, attachmentPath: string | null) {
  if (!can(actor, 'correction.request') || !actor.employeeId) throw forbidden();
  const v = requestInput.parse(raw);
  const needIn = ['LUPA_MASUK', 'LUPA_KEDUANYA'].includes(v.kind);
  const needOut = ['LUPA_PULANG', 'LUPA_KEDUANYA'].includes(v.kind);
  const fields: Record<string, string> = {};
  if (needIn && !v.proposedCheckIn) fields.proposedCheckIn = 'Isi jam masuk sebenarnya';
  if (needOut && !v.proposedCheckOut) fields.proposedCheckOut = 'Isi jam pulang sebenarnya';
  if (Object.keys(fields).length) throw unprocessable('Lengkapi jam yang diajukan.', fields);
  const s = await checkWindow(v.workDate);
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: actor.employeeId } });
  const dup = await prisma.attendanceCorrection.findFirst({ where: { employeeId: emp.id, workDate: toDbDate(v.workDate), status: 'PENDING' } });
  if (dup) throw conflict('Masih ada pengajuan koreksi yang menunggu untuk tanggal ini.');
  const original = await snapshot(emp.id, v.workDate, s['org.timezone']);
  const c = await prisma.attendanceCorrection.create({
    data: {
      employeeId: emp.id, attendanceRecordId: original?.recordId ?? null, workDate: toDbDate(v.workDate), kind: v.kind,
      originalValues: original ?? undefined, proposedCheckIn: v.proposedCheckIn, proposedCheckOut: v.proposedCheckOut,
      reason: v.reason, attachmentPath, requestedById: actor.userId,
    },
  });
  await audit(actor, { action: 'correction.request', entityType: 'AttendanceCorrection', entityId: c.id, after: { ...v, attachment: !!attachmentPath } });
  await notifyPermission('correction.review', emp.unitId, {
    type: 'correction_pending', title: `Koreksi absensi dari ${emp.fullName}`, body: `${KIND_LABEL[v.kind]} untuk ${fmtTglPendek(v.workDate)}`, link: `/absensi/koreksi/${c.id}`,
  }, actor.userId);
  return c;
}

/** Petugas membuat koreksi untuk pegawai. Tercatat lengkap dengan alasan dan nilai awal. */
export async function adminCorrection(actor: Actor, raw: unknown) {
  if (!can(actor, 'correction.review')) throw forbidden();
  const v = adminInput.parse(raw);
  const emp = await getEmployeeInScope(actor, 'correction.review', v.employeeId);
  if (emp.id === actor.employeeId) throw forbidden('Koreksi absensi sendiri harus diajukan dan disetujui pihak lain.');
  if (!v.proposedCheckIn && !v.proposedCheckOut && !v.proposedStatus && !v.dispensation) throw unprocessable('Tidak ada perubahan yang diajukan.');
  const s = await checkWindow(v.workDate);
  const original = await snapshot(emp.id, v.workDate, s['org.timezone']);
  const c = await prisma.attendanceCorrection.create({
    data: {
      employeeId: emp.id, attendanceRecordId: original?.recordId ?? null, workDate: toDbDate(v.workDate), kind: 'KOREKSI_ADMIN',
      originalValues: original ?? undefined, proposedCheckIn: v.proposedCheckIn, proposedCheckOut: v.proposedCheckOut, proposedStatus: v.proposedStatus,
      dispensation: v.dispensation, reason: v.reason, requestedById: actor.userId,
      status: 'APPROVED', reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: 'Dibuat dan disetujui petugas',
    },
  });
  const rec = await rebuildRecord(emp.id, v.workDate);
  const tz = s['org.timezone'];
  await prisma.attendanceCorrection.update({ where: { id: c.id }, data: { attendanceRecordId: rec?.id ?? null, appliedValues: rec ? { checkIn: fmtJam(rec.checkInAt, tz), checkOut: fmtJam(rec.checkOutAt, tz), status: rec.status, lateMinutes: rec.lateMinutes } : undefined } });
  await audit(actor, { action: 'correction.admin', entityType: 'AttendanceCorrection', entityId: c.id, before: original, after: v });
  await notifyEmployee(emp.id, { type: 'correction', title: `Absensi ${fmtTglPendek(v.workDate)} dikoreksi petugas`, body: v.reason, link: `/absensi/koreksi/${c.id}` });
  return c;
}

export async function reviewCorrection(actor: Actor, id: string, raw: unknown) {
  if (!can(actor, 'correction.review')) throw forbidden();
  const v = reviewInput.parse(raw);
  const c = await prisma.attendanceCorrection.findUnique({ where: { id }, include: { employee: true } });
  if (!c) throw notFound('Pengajuan tidak ditemukan.');
  await getEmployeeInScope(actor, 'correction.review', c.employeeId);
  if (c.employeeId === actor.employeeId || c.requestedById === actor.userId) throw forbidden('Anda tidak dapat meninjau pengajuan sendiri.');
  if (c.status !== 'PENDING') throw conflict('Pengajuan ini sudah diproses.');
  if (!v.approve && !v.note) throw unprocessable('Tuliskan alasan penolakan.', { note: 'Wajib diisi saat menolak' });
  const tz = (await getSettings())['org.timezone'];
  const workDate = fromDbDate(c.workDate);
  const update: Prisma.AttendanceCorrectionUpdateManyMutationInput & { reviewedById: string } = {
    status: v.approve ? 'APPROVED' : 'REJECTED', reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: v.note ?? null,
  };
  if (v.approve) {
    // Peninjau boleh menyesuaikan nilai usulan sebelum menyetujui.
    if (v.proposedCheckIn !== undefined && v.proposedCheckIn !== null) update.proposedCheckIn = v.proposedCheckIn;
    if (v.proposedCheckOut !== undefined && v.proposedCheckOut !== null) update.proposedCheckOut = v.proposedCheckOut;
    if (v.proposedStatus) update.proposedStatus = v.proposedStatus;
    if (v.dispensation !== undefined) update.dispensation = v.dispensation;
  }
  // Bersyarat agar dua peninjau yang memutus bersamaan tidak sama-sama berhasil.
  const done = await prisma.attendanceCorrection.updateMany({ where: { id, status: 'PENDING' }, data: update });
  if (!done.count) throw conflict('Pengajuan ini sudah diproses.');
  let applied = null;
  if (v.approve) {
    const rec = await rebuildRecord(c.employeeId, workDate);
    applied = rec ? { checkIn: fmtJam(rec.checkInAt, tz), checkOut: fmtJam(rec.checkOutAt, tz), status: rec.status, lateMinutes: rec.lateMinutes, earlyLeaveMinutes: rec.earlyLeaveMinutes } : null;
    await prisma.attendanceCorrection.update({ where: { id }, data: { appliedValues: applied ?? undefined, attendanceRecordId: rec?.id ?? null } });
  }
  await audit(actor, { action: v.approve ? 'correction.approve' : 'correction.reject', entityType: 'AttendanceCorrection', entityId: id, before: c.originalValues, after: applied ?? { note: v.note } });
  await notifyUsers([c.requestedById], {
    type: 'correction', title: `Koreksi ${fmtTglPendek(workDate)} ${v.approve ? 'disetujui' : 'ditolak'}`, body: v.note ?? null, link: `/absensi/koreksi/${id}`,
  });
}

export async function cancelCorrection(actor: Actor, id: string) {
  const c = await prisma.attendanceCorrection.findUnique({ where: { id } });
  if (!c || c.requestedById !== actor.userId) throw notFound('Pengajuan tidak ditemukan.');
  if (c.status !== 'PENDING') throw conflict('Hanya pengajuan yang masih menunggu yang bisa dibatalkan.');
  await prisma.attendanceCorrection.update({ where: { id }, data: { status: 'CANCELLED' } });
  await audit(actor, { action: 'correction.cancel', entityType: 'AttendanceCorrection', entityId: id });
}

export const correctionQuery = z.object({
  scope: z.enum(['saya', 'tinjau']).default('saya'),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL']).catch('PENDING').default('PENDING'),
  kind: z.string().max(30).optional().or(z.literal('')).transform((v) => v || undefined),
  q: z.string().trim().max(100).optional().or(z.literal('')).transform((v) => v || undefined),
  from: z.string().refine(isValidDate).optional().catch(undefined),
  to: z.string().refine(isValidDate).optional().catch(undefined),
}).and(listSchema(['diajukan', 'tanggal', 'nama', 'status'] as const, { sort: 'diajukan', dir: 'desc' }));

const CORRECTION_ORDER: Record<string, (d: 'asc' | 'desc') => Prisma.AttendanceCorrectionOrderByWithRelationInput[]> = {
  diajukan: (d) => [{ createdAt: d }, { id: 'asc' }],
  tanggal: (d) => [{ workDate: d }, { createdAt: 'desc' }, { id: 'asc' }],
  nama: (d) => [{ employee: { fullName: d } }, { workDate: 'desc' }, { id: 'asc' }],
  status: (d) => [{ status: d }, { createdAt: 'desc' }, { id: 'asc' }],
};

export async function listCorrections(actor: Actor, raw: unknown) {
  const q = correctionQuery.parse(raw);
  let where: Prisma.AttendanceCorrectionWhereInput;
  if (q.scope === 'tinjau') {
    if (!can(actor, 'correction.review')) throw forbidden();
    where = { employee: employeeScopeWhere(actor, 'correction.review'), ...(actor.employeeId ? { NOT: { employeeId: actor.employeeId } } : {}) };
  } else {
    if (!actor.employeeId) return { total: 0, page: 1, pageSize: q.per, sort: q.sort, dir: q.dir, rows: [] };
    where = { employeeId: actor.employeeId };
  }
  const and: Prisma.AttendanceCorrectionWhereInput[] = [where];
  if (q.status !== 'ALL') and.push({ status: q.status });
  if (q.kind) and.push({ kind: q.kind });
  if (q.from) and.push({ workDate: { gte: toDbDate(q.from) } });
  if (q.to) and.push({ workDate: { lte: toDbDate(q.to) } });
  if (q.q) and.push({ employee: { OR: [{ fullName: { contains: q.q, mode: 'insensitive' } }, { employeeNumber: { contains: q.q } }] } });
  where = { AND: and };
  const size = q.per;
  const total = await prisma.attendanceCorrection.count({ where });
  const page = clampPage(q.page, size, total);
  const rows = await prisma.attendanceCorrection.findMany({ where, include: { employee: { select: { id: true, fullName: true, employeeNumber: true, unit: { select: { name: true } } } } }, orderBy: CORRECTION_ORDER[q.sort](q.dir), skip: (page - 1) * size, take: size });
  return { total, page, pageSize: size, sort: q.sort, dir: q.dir, rows };
}

export async function getCorrection(actor: Actor, id: string) {
  const c = await prisma.attendanceCorrection.findUnique({ where: { id }, include: { employee: { include: { unit: true } } } });
  if (!c) throw notFound('Pengajuan tidak ditemukan.');
  const own = c.employeeId === actor.employeeId || c.requestedById === actor.userId;
  if (!own) await getEmployeeInScope(actor, 'correction.review', c.employeeId);
  const users = await prisma.user.findMany({ where: { id: { in: [c.requestedById, c.reviewedById].filter(Boolean) as string[] } }, select: { id: true, username: true } });
  const name = (id?: string | null) => users.find((u) => u.id === id)?.username ?? null;
  return { ...c, requestedBy: name(c.requestedById), reviewedBy: name(c.reviewedById), canReview: !own && can(actor, 'correction.review') && c.status === 'PENDING', canCancel: c.requestedById === actor.userId && c.status === 'PENDING' };
}
