import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { audit, diff } from '../audit';
import { assertCan, can, employeeScopeWhere, getEmployeeInScope, scopeOf, type Actor } from '../auth/actor';
import { conflict, forbidden, notFound, unprocessable } from '../errors';
import { getSettings } from '../settings';
import { addDays, dateRange, fmtTglPendek, fromDbDate, isValidDate, monthBounds, toDbDate, todayIn } from '../time';
import { loadPlanContext } from '../attendance/plan';
import { rebuildRange } from '../attendance/record';
import { notifyEmployee, notifyPermission, notifyUsers } from './notifications';

async function assertModuleOn() {
  if (!(await getSettings())['modules.leave']) throw forbidden('Modul cuti dan izin sedang dinonaktifkan.');
}

// ---------------------------------------------------------------------------
// Jenis cuti/izin
// ---------------------------------------------------------------------------

export const leaveTypeInput = z.object({
  code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/, 'Hanya huruf/angka'),
  name: z.string().trim().min(2).max(100),
  attendanceStatus: z.enum(['CUTI', 'IZIN', 'SAKIT', 'DINAS_LUAR']),
  usesBalance: z.boolean(),
  defaultAnnualQuota: z.coerce.number().int().min(0).max(366).nullable().optional(),
  eligibleEmploymentStatuses: z.array(z.string().trim().min(1).max(50)).default([]),
  maxDaysPerRequest: z.coerce.number().int().min(1).max(366).nullable().optional(),
  minNoticeDays: z.coerce.number().int().min(0).max(90).default(0),
  approvalLevels: z.coerce.number().int().min(1).max(2),
  countWorkdaysOnly: z.boolean(),
  allowAttachment: z.boolean(),
  isActive: z.boolean().default(true),
});

export const listLeaveTypes = (includeInactive = false) =>
  prisma.leaveType.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' } });

export async function saveLeaveType(actor: Actor, id: string | null, raw: unknown) {
  assertCan(actor, 'leave.manage');
  const v = leaveTypeInput.parse(raw);
  const data = { ...v, defaultAnnualQuota: v.defaultAnnualQuota ?? null, maxDaysPerRequest: v.maxDaysPerRequest ?? null };
  if (!id) {
    if (await prisma.leaveType.findUnique({ where: { code: v.code } })) throw conflict('Kode sudah dipakai.', { code: 'Sudah dipakai' });
    const t = await prisma.leaveType.create({ data });
    await audit(actor, { action: 'leave_type.create', entityType: 'LeaveType', entityId: t.id, after: data });
    return t;
  }
  const cur = await prisma.leaveType.findUnique({ where: { id } });
  if (!cur) throw notFound();
  const d = diff(cur as unknown as Record<string, unknown>, data);
  const t = await prisma.leaveType.update({ where: { id }, data });
  if (d.changed) await audit(actor, { action: 'leave_type.update', entityType: 'LeaveType', entityId: id, before: d.before, after: d.after });
  return t;
}

// ---------------------------------------------------------------------------
// Saldo
// ---------------------------------------------------------------------------

/** Saldo per jenis yang memakai saldo: hak, terpakai (disetujui), dipesan (menunggu), sisa. */
export async function balancesFor(employeeId: string, year: number) {
  const types = await prisma.leaveType.findMany({ where: { usesBalance: true, isActive: true } });
  const balances = await prisma.leaveBalance.findMany({ where: { employeeId, year } });
  const reqs = await prisma.leaveRequest.findMany({
    where: { employeeId, status: { in: ['APPROVED', 'PENDING'] }, leaveType: { usesBalance: true }, startDate: { gte: toDbDate(`${year}-01-01`), lte: toDbDate(`${year}-12-31`) } },
    select: { leaveTypeId: true, days: true, status: true },
  });
  return types.map((t) => {
    const b = balances.find((x) => x.leaveTypeId === t.id);
    const entitled = b ? b.entitled + b.carriedOver + b.adjustment : 0;
    const used = reqs.filter((r) => r.leaveTypeId === t.id && r.status === 'APPROVED').reduce((n, r) => n + r.days, 0);
    const reserved = reqs.filter((r) => r.leaveTypeId === t.id && r.status === 'PENDING').reduce((n, r) => n + r.days, 0);
    return { leaveType: t, balanceId: b?.id ?? null, configured: !!b, entitled, base: b?.entitled ?? 0, carriedOver: b?.carriedOver ?? 0, adjustment: b?.adjustment ?? 0, used, reserved, remaining: entitled - used - reserved };
  });
}

export const balanceInput = z.object({
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  entitled: z.coerce.number().int().min(0).max(366),
  carriedOver: z.coerce.number().int().min(0).max(366),
  adjustment: z.coerce.number().int().min(-366).max(366),
  note: z.string().trim().max(300).optional().nullable(),
});

export async function setBalance(actor: Actor, raw: unknown) {
  assertCan(actor, 'leave.manage');
  const v = balanceInput.parse(raw);
  await getEmployeeInScope(actor, 'leave.manage', v.employeeId);
  const key = { employeeId_leaveTypeId_year: { employeeId: v.employeeId, leaveTypeId: v.leaveTypeId, year: v.year } };
  const before = await prisma.leaveBalance.findUnique({ where: key });
  const b = await prisma.leaveBalance.upsert({ where: key, update: { entitled: v.entitled, carriedOver: v.carriedOver, adjustment: v.adjustment, note: v.note ?? null }, create: { ...v, note: v.note ?? null } });
  await audit(actor, { action: 'leave_balance.set', entityType: 'LeaveBalance', entityId: b.id, before, after: v });
  return b;
}

/** Buat saldo tahun tertentu dari kuota bawaan jenis cuti untuk pegawai yang memenuhi syarat. */
export async function generateBalances(actor: Actor, year: number) {
  assertCan(actor, 'leave.manage');
  const types = await prisma.leaveType.findMany({ where: { usesBalance: true, isActive: true, defaultAnnualQuota: { not: null } } });
  const emps = await prisma.employee.findMany({ where: { AND: [{ deletedAt: null, isActive: true }, employeeScopeWhere(actor, 'leave.manage')] }, select: { id: true, employmentStatus: true } });
  let created = 0;
  for (const t of types) {
    for (const e of emps) {
      if (t.eligibleEmploymentStatuses.length && !t.eligibleEmploymentStatuses.includes(e.employmentStatus ?? '')) continue;
      const r = await prisma.leaveBalance.createMany({ data: [{ employeeId: e.id, leaveTypeId: t.id, year, entitled: t.defaultAnnualQuota! }], skipDuplicates: true });
      created += r.count;
    }
  }
  await audit(actor, { action: 'leave_balance.generate', entityType: 'LeaveBalance', meta: { year, created } });
  return { created };
}

// ---------------------------------------------------------------------------
// Pengajuan
// ---------------------------------------------------------------------------

export const requestInput = z.object({
  leaveTypeId: z.string().uuid('Pilih jenis cuti/izin'),
  startDate: z.string().refine(isValidDate, 'Tanggal tidak valid'),
  endDate: z.string().refine(isValidDate, 'Tanggal tidak valid'),
  reason: z.string().trim().min(5, 'Alasan minimal 5 karakter').max(1000),
}).refine((v) => v.endDate >= v.startDate, { message: 'Tanggal selesai harus sama atau setelah tanggal mulai', path: ['endDate'] });

/** Jumlah hari yang dihitung: hari kerja terjadwal atau hari kalender. */
export async function countLeaveDays(employeeId: string, from: string, to: string, workdaysOnly: boolean) {
  const days = dateRange(from, to);
  if (!workdaysOnly) return days.length;
  const ctx = await loadPlanContext([employeeId], from, to);
  return days.filter((d) => {
    const p = ctx.planFor(employeeId, d);
    return !p.isOffDay && (p.schedule || p.source === 'TANPA_JADWAL');
  }).length;
}

export async function requestLeave(actor: Actor, raw: unknown, attachmentPath: string | null) {
  await assertModuleOn();
  if (!can(actor, 'leave.request') || !actor.employeeId) throw forbidden();
  const v = requestInput.parse(raw);
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: actor.employeeId }, include: { supervisor: { include: { user: true } } } });
  const type = await prisma.leaveType.findFirst({ where: { id: v.leaveTypeId, isActive: true } });
  if (!type) throw unprocessable('Jenis cuti/izin tidak tersedia.', { leaveTypeId: 'Pilih jenis lain' });
  if (type.eligibleEmploymentStatuses.length && !type.eligibleEmploymentStatuses.includes(emp.employmentStatus ?? '')) {
    throw unprocessable(`${type.name} tidak berlaku untuk status kepegawaian Anda.`, { leaveTypeId: 'Tidak memenuhi syarat' });
  }
  if (attachmentPath && !type.allowAttachment) throw unprocessable('Jenis ini tidak menerima lampiran.');
  const today = todayIn((await getSettings())['org.timezone']);
  if (type.minNoticeDays && v.startDate < addDays(today, type.minNoticeDays)) {
    throw unprocessable(`${type.name} diajukan paling lambat ${type.minNoticeDays} hari sebelumnya.`, { startDate: `Minimal ${addDays(today, type.minNoticeDays)}` });
  }
  const days = await countLeaveDays(emp.id, v.startDate, v.endDate, type.countWorkdaysOnly);
  if (days < 1) throw unprocessable('Rentang tanggal tidak berisi hari kerja.', { endDate: 'Tidak ada hari kerja' });
  if (type.maxDaysPerRequest && days > type.maxDaysPerRequest) throw unprocessable(`Maksimal ${type.maxDaysPerRequest} hari per pengajuan.`, { endDate: 'Terlalu panjang' });
  const overlap = await prisma.leaveRequest.findFirst({ where: { employeeId: emp.id, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: toDbDate(v.endDate) }, endDate: { gte: toDbDate(v.startDate) } } });
  if (overlap) throw conflict('Tanggal tersebut bertabrakan dengan pengajuan lain yang menunggu atau disetujui.');
  if (type.usesBalance) {
    const year = Number(v.startDate.slice(0, 4));
    if (v.endDate.slice(0, 4) !== v.startDate.slice(0, 4)) throw unprocessable('Pengajuan yang memakai saldo tidak boleh melewati pergantian tahun. Ajukan terpisah per tahun.');
    const bal = (await balancesFor(emp.id, year)).find((b) => b.leaveType.id === type.id);
    if (!bal?.configured) throw unprocessable(`Saldo ${type.name} tahun ${year} belum diatur. Hubungi admin kepegawaian.`);
    if (bal.remaining < days) throw unprocessable(`Sisa saldo ${type.name} ${bal.remaining} hari, pengajuan ${days} hari.`);
  }
  const supervisorUser = emp.supervisor?.user && emp.supervisor.user.isActive ? emp.supervisor.user : null;
  const req = await prisma.leaveRequest.create({
    data: {
      employeeId: emp.id, leaveTypeId: type.id, startDate: toDbDate(v.startDate), endDate: toDbDate(v.endDate), days, reason: v.reason, attachmentPath, requestedById: actor.userId,
      approvals: {
        create: [
          { level: 1, approverKind: 'ATASAN', approverUserId: supervisorUser?.id ?? null },
          ...(type.approvalLevels >= 2 ? [{ level: 2, approverKind: 'ADMIN_KEPEGAWAIAN' }] : []),
        ],
      },
    },
  });
  await audit(actor, { action: 'leave.request', entityType: 'LeaveRequest', entityId: req.id, after: { ...v, days, type: type.code } });
  const n = { type: 'leave_pending', title: `${type.name} dari ${emp.fullName}`, body: `${fmtTglPendek(v.startDate)} sampai ${fmtTglPendek(v.endDate)} (${days} hari)`, link: `/cuti/${req.id}` };
  if (supervisorUser) await notifyUsers([supervisorUser.id], n);
  else await notifyPermission('leave.approve', emp.unitId, n, actor.userId);
  return req;
}

/** Filter persetujuan yang sedang menunggu tindakan pengguna ini. */
export async function pendingLeaveApprovalWhere(actor: Actor): Promise<Prisma.LeaveApprovalWhereInput> {
  const or: Prisma.LeaveApprovalWhereInput[] = [{ approverKind: 'ATASAN', approverUserId: actor.userId }];
  const ap = scopeOf(actor, 'leave.approve');
  if (ap) or.push({ approverKind: 'ATASAN', approverUserId: null, request: { employee: ap.all ? {} : { unitId: { in: ap.unitIds } } } });
  const mg = scopeOf(actor, 'leave.manage');
  if (mg) or.push({ approverKind: 'ADMIN_KEPEGAWAIAN', request: { employee: mg.all ? {} : { unitId: { in: mg.unitIds } } } });
  return {
    decision: 'PENDING',
    request: { status: 'PENDING', ...(actor.employeeId ? { NOT: { employeeId: actor.employeeId } } : {}) },
    // Hanya tingkat yang sedang berjalan (tingkat 2 menunggu sampai tingkat 1 disetujui).
    AND: [{ OR: or }, { OR: [{ level: 1, request: { currentLevel: 1 } }, { level: 2, request: { currentLevel: 2 } }] }],
  };
}

async function currentApprovalFor(actor: Actor, requestId: string) {
  const req = await prisma.leaveRequest.findUnique({ where: { id: requestId }, include: { approvals: true, leaveType: true, employee: true } });
  if (!req) throw notFound('Pengajuan tidak ditemukan.');
  const current = req.approvals.find((a) => a.level === req.currentLevel && a.decision === 'PENDING');
  if (!current || req.status !== 'PENDING') return { req, current: null };
  const ok = await prisma.leaveApproval.count({ where: { id: current.id, ...(await pendingLeaveApprovalWhere(actor)) } });
  return { req, current: ok ? current : null };
}

export async function decideLeave(actor: Actor, requestId: string, raw: unknown) {
  await assertModuleOn();
  const v = z.object({ approve: z.boolean(), note: z.string().trim().max(1000).optional().nullable() }).parse(raw);
  const { req, current } = await currentApprovalFor(actor, requestId);
  if (!current) throw forbidden('Pengajuan ini tidak sedang menunggu persetujuan Anda.');
  if (!v.approve && !v.note) throw unprocessable('Tuliskan alasan penolakan.', { note: 'Wajib diisi saat menolak' });
  const last = req.approvals.every((a) => a.level <= current.level);
  await prisma.$transaction(async (tx) => {
    await tx.leaveApproval.update({ where: { id: current.id }, data: { decision: v.approve ? 'APPROVED' : 'REJECTED', decidedById: actor.userId, decidedAt: new Date(), note: v.note ?? null } });
    if (!v.approve) await tx.leaveRequest.update({ where: { id: req.id }, data: { status: 'REJECTED' } });
    else if (last) await tx.leaveRequest.update({ where: { id: req.id }, data: { status: 'APPROVED' } });
    else await tx.leaveRequest.update({ where: { id: req.id }, data: { currentLevel: current.level + 1 } });
    await audit(actor, { action: v.approve ? 'leave.approve' : 'leave.reject', entityType: 'LeaveRequest', entityId: req.id, meta: { level: current.level, note: v.note } }, tx);
  });
  const period = `${fmtTglPendek(fromDbDate(req.startDate))} sampai ${fmtTglPendek(fromDbDate(req.endDate))}`;
  if (!v.approve) {
    await notifyUsers([req.requestedById], { type: 'leave', title: `${req.leaveType.name} ditolak`, body: v.note ?? period, link: `/cuti/${req.id}` });
  } else if (last) {
    await rebuildRange([req.employeeId], fromDbDate(req.startDate), fromDbDate(req.endDate));
    await notifyUsers([req.requestedById], { type: 'leave', title: `${req.leaveType.name} disetujui`, body: period, link: `/cuti/${req.id}` });
  } else {
    await notifyPermission('leave.manage', req.employee.unitId, { type: 'leave_pending', title: `${req.leaveType.name} ${req.employee.fullName} menunggu persetujuan kepegawaian`, body: period, link: `/cuti/${req.id}` }, actor.userId);
  }
}

export async function cancelLeave(actor: Actor, requestId: string, reason: string) {
  const req = await prisma.leaveRequest.findUnique({ where: { id: requestId }, include: { leaveType: true } });
  if (!req) throw notFound('Pengajuan tidak ditemukan.');
  const own = req.requestedById === actor.userId;
  const manager = !own && can(actor, 'leave.manage');
  if (manager) await getEmployeeInScope(actor, 'leave.manage', req.employeeId);
  if (!own && !manager) throw notFound('Pengajuan tidak ditemukan.');
  if (!['PENDING', 'APPROVED'].includes(req.status)) throw conflict('Pengajuan ini tidak bisa dibatalkan.');
  const today = todayIn((await getSettings())['org.timezone']);
  // Pegawai hanya bisa membatalkan cuti disetujui yang belum dimulai; admin kepegawaian kapan saja.
  if (own && req.status === 'APPROVED' && fromDbDate(req.startDate) <= today) throw conflict('Cuti yang sudah berjalan hanya bisa dibatalkan admin kepegawaian.');
  if (!reason || reason.trim().length < 3) throw unprocessable('Tuliskan alasan pembatalan.', { reason: 'Wajib diisi' });
  await prisma.leaveRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason.trim() } });
  await audit(actor, { action: 'leave.cancel', entityType: 'LeaveRequest', entityId: requestId, before: { status: req.status }, meta: { reason } });
  if (req.status === 'APPROVED') await rebuildRange([req.employeeId], fromDbDate(req.startDate), fromDbDate(req.endDate));
  if (!own) await notifyEmployee(req.employeeId, { type: 'leave', title: `${req.leaveType.name} dibatalkan admin`, body: reason, link: `/cuti/${req.id}` });
}

export const leaveQuery = z.object({
  view: z.enum(['saya', 'persetujuan', 'semua']).default('saya'),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL']).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
});

export async function listLeave(actor: Actor, raw: unknown) {
  const q = leaveQuery.parse(raw);
  let where: Prisma.LeaveRequestWhereInput;
  if (q.view === 'persetujuan') {
    const ids = (await prisma.leaveApproval.findMany({ where: await pendingLeaveApprovalWhere(actor), select: { leaveRequestId: true, level: true, request: { select: { currentLevel: true } } } }))
      .filter((a) => a.level === a.request.currentLevel).map((a) => a.leaveRequestId);
    where = { id: { in: ids } };
  } else if (q.view === 'semua') {
    if (!can(actor, 'leave.manage') && !can(actor, 'leave.approve')) throw forbidden();
    where = { employee: employeeScopeWhere(actor, can(actor, 'leave.manage') ? 'leave.manage' : 'leave.approve') };
    if (q.status !== 'ALL') where = { ...where, status: q.status };
  } else {
    if (!actor.employeeId) return { total: 0, page: 1, pageSize: 25, rows: [] };
    where = { employeeId: actor.employeeId };
    if (q.status !== 'ALL') where = { ...where, status: q.status };
  }
  const size = 25;
  const [total, rows] = await Promise.all([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.findMany({ where, include: { leaveType: true, employee: { select: { id: true, fullName: true, employeeNumber: true, unit: { select: { name: true } } } }, approvals: { orderBy: { level: 'asc' } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * size, take: size }),
  ]);
  return { total, page: q.page, pageSize: size, rows };
}

export async function getLeave(actor: Actor, id: string) {
  const req = await prisma.leaveRequest.findUnique({ where: { id }, include: { leaveType: true, employee: { include: { unit: true } }, approvals: { orderBy: { level: 'asc' } } } });
  if (!req) throw notFound('Pengajuan tidak ditemukan.');
  const own = req.employeeId === actor.employeeId || req.requestedById === actor.userId;
  const { current } = await currentApprovalFor(actor, id);
  if (!own && !current) await getEmployeeInScope(actor, can(actor, 'leave.manage') ? 'leave.manage' : 'leave.approve', req.employeeId);
  const userIds = req.approvals.flatMap((a) => [a.decidedById, a.approverUserId]).filter(Boolean) as string[];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, employee: { select: { fullName: true } } } });
  const name = (uid?: string | null) => { const u = users.find((x) => x.id === uid); return u ? u.employee?.fullName ?? u.username : null; };
  const today = todayIn((await getSettings())['org.timezone']);
  return {
    ...req,
    approvals: req.approvals.map((a) => ({ ...a, decidedByName: name(a.decidedById), approverName: name(a.approverUserId) })),
    canDecide: !!current,
    canCancel: (own && (req.status === 'PENDING' || (req.status === 'APPROVED' && fromDbDate(req.startDate) > today))) || (!own && can(actor, 'leave.manage') && ['PENDING', 'APPROVED'].includes(req.status)),
  };
}

/** Kalender cuti: pengajuan disetujui dan menunggu yang beririsan dengan bulan tertentu. */
export async function leaveCalendar(actor: Actor, month: string, unitId?: string) {
  const perm = can(actor, 'leave.manage') ? 'leave.manage' : can(actor, 'leave.approve') ? 'leave.approve' : null;
  const { from, to } = monthBounds(month);
  const where: Prisma.LeaveRequestWhereInput = {
    status: { in: ['APPROVED', 'PENDING'] }, startDate: { lte: toDbDate(to) }, endDate: { gte: toDbDate(from) },
    employee: perm ? { AND: [employeeScopeWhere(actor, perm), unitId ? { unitId } : {}] } : { id: actor.employeeId ?? '00000000-0000-0000-0000-000000000000' },
  };
  return prisma.leaveRequest.findMany({ where, include: { leaveType: true, employee: { select: { id: true, fullName: true } } }, orderBy: { startDate: 'asc' } });
}

/** Tabel saldo seluruh pegawai dalam cakupan untuk satu tahun (satu kali query per tabel). */
export async function balanceTable(actor: Actor, year: number, opts: { unitId?: string; q?: string; page?: number } = {}) {
  assertCan(actor, 'leave.manage');
  const where: Prisma.EmployeeWhereInput = {
    AND: [
      { deletedAt: null, isActive: true },
      employeeScopeWhere(actor, 'leave.manage'),
      opts.unitId ? { unitId: opts.unitId } : {},
      opts.q ? { OR: [{ fullName: { contains: opts.q, mode: 'insensitive' } }, { employeeNumber: { contains: opts.q } }] } : {},
    ],
  };
  const size = 50;
  const page = Math.max(1, opts.page ?? 1);
  const [total, employees, types] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({ where, select: { id: true, fullName: true, employeeNumber: true, unit: { select: { name: true } } }, orderBy: { fullName: 'asc' }, skip: (page - 1) * size, take: size }),
    prisma.leaveType.findMany({ where: { usesBalance: true, isActive: true }, orderBy: { name: 'asc' } }),
  ]);
  const ids = employees.map((e) => e.id);
  const [balances, used] = await Promise.all([
    prisma.leaveBalance.findMany({ where: { employeeId: { in: ids }, year } }),
    prisma.leaveRequest.groupBy({
      by: ['employeeId', 'leaveTypeId', 'status'],
      where: { employeeId: { in: ids }, status: { in: ['APPROVED', 'PENDING'] }, leaveType: { usesBalance: true }, startDate: { gte: toDbDate(`${year}-01-01`), lte: toDbDate(`${year}-12-31`) } },
      _sum: { days: true },
    }),
  ]);
  const sum = (e: string, t: string, s: string) => used.find((u) => u.employeeId === e && u.leaveTypeId === t && u.status === s)?._sum.days ?? 0;
  return {
    total, page, pageSize: size, types,
    rows: employees.map((e) => ({
      employee: e,
      cells: types.map((t) => {
        const b = balances.find((x) => x.employeeId === e.id && x.leaveTypeId === t.id);
        const entitled = b ? b.entitled + b.carriedOver + b.adjustment : 0;
        const u = sum(e.id, t.id, 'APPROVED');
        const r = sum(e.id, t.id, 'PENDING');
        return { leaveTypeId: t.id, configured: !!b, base: b?.entitled ?? 0, carriedOver: b?.carriedOver ?? 0, adjustment: b?.adjustment ?? 0, note: b?.note ?? null, entitled, used: u, reserved: r, remaining: entitled - u - r };
      }),
    })),
  };
}
