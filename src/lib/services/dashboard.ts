import { prisma } from '../db';
import { can, employeeScopeWhere, scopeOf, type Actor } from '../auth/actor';
import { getSettings } from '../settings';
import { addDays, dateRange, fromDbDate, toDbDate, todayIn, zonedParts, zonedToUtc } from '../time';
import { loadPlanContext, isScheduledWorkday } from '../attendance/plan';
import { categoryOf } from './reports';
import { balancesFor, pendingLeaveApprovalWhere } from './leave';
import { pendingVerifications } from './biometrics';

export interface DashboardFilter {
  date?: string;
  days?: number;
  unitId?: string;
  employmentStatus?: string;
  method?: string;
}

/** Dashboard admin/pimpinan. Semua angka dihitung dari data tersimpan dalam cakupan pengguna. */
export async function adminDashboard(actor: Actor, f: DashboardFilter) {
  const s = await getSettings();
  const tz = s['org.timezone'];
  const today = todayIn(tz);
  const date = f.date && f.date <= today ? f.date : today;
  const days = Math.min(Math.max(f.days ?? 30, 7), 92);
  const from = addDays(date, -(days - 1));
  const empWhere = {
    AND: [employeeScopeWhere(actor, 'dashboard.view'), { deletedAt: null, isActive: true }, f.unitId ? { unitId: f.unitId } : {}, f.employmentStatus ? { employmentStatus: f.employmentStatus } : {}],
  };
  const employees = await prisma.employee.findMany({ where: empWhere, select: { id: true, unitId: true, employmentStatus: true, unit: { select: { name: true } } } });
  const ids = employees.map((e) => e.id);

  const byUnit = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const e of employees) {
    byUnit.set(e.unit?.name ?? 'Tanpa unit', (byUnit.get(e.unit?.name ?? 'Tanpa unit') || 0) + 1);
    byStatus.set(e.employmentStatus || 'Belum diisi', (byStatus.get(e.employmentStatus || 'Belum diisi') || 0) + 1);
  }

  const [records, ctx] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employeeId: { in: ids }, workDate: { gte: toDbDate(from), lte: toDbDate(date) }, ...(f.method ? { OR: [{ checkInMethod: f.method }, { checkOutMethod: f.method }] } : {}) },
      select: { employeeId: true, workDate: true, status: true, needsReview: true },
    }),
    loadPlanContext(ids, from, date),
  ]);
  const recKey = new Map(records.map((r) => [`${r.employeeId}:${fromDbDate(r.workDate)}`, r]));

  // Ringkasan tanggal terpilih
  const summary: Record<string, number> = { HADIR: 0, TERLAMBAT: 0, DINAS_LUAR: 0, IZIN_CUTI: 0, TIDAK_HADIR: 0, BELUM_ABSEN: 0, LIBUR: 0 };
  for (const id of ids) summary[categoryOf(ctx.planFor(id, date), recKey.get(`${id}:${date}`) ?? null)]++;

  // Tren harian
  const trend = dateRange(from, date).map((d) => {
    const t = { date: d, hadir: 0, terlambat: 0, izin: 0, tanpaTransaksi: 0, dijadwalkan: 0 };
    for (const id of ids) {
      const p = ctx.planFor(id, d);
      const r = recKey.get(`${id}:${d}`);
      if (isScheduledWorkday(p)) t.dijadwalkan++;
      if (!r) { if (isScheduledWorkday(p)) t.tanpaTransaksi++; continue; }
      if (r.status === 'HADIR' || r.status === 'DINAS_LUAR') t.hadir++;
      else if (r.status === 'TERLAMBAT') t.terlambat++;
      else if (['IZIN', 'SAKIT', 'CUTI'].includes(r.status)) t.izin++;
    }
    return t;
  });

  // Anomali yang perlu ditinjau
  const since = addDays(date, -6);
  const [reviewRecords, failedEvents, skewed, unmatchedRaw] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employeeId: { in: ids }, needsReview: true, workDate: { gte: toDbDate(since), lte: toDbDate(date) } },
      include: { employee: { select: { id: true, fullName: true } } }, orderBy: { workDate: 'desc' }, take: 20,
    }),
    prisma.attendanceEvent.findMany({
      where: { occurredAt: { gte: zonedToUtc(since, '00:00', tz) }, verification: { outcome: { notIn: ['SUCCESS', 'DUPLICATE', 'ALREADY_RECORDED'] } }, OR: [{ employeeId: { in: ids } }, ...(scopeOf(actor, 'attendance.monitor')?.all ? [{ employeeId: null }] : [])] },
      include: { verification: true, employee: { select: { id: true, fullName: true } } }, orderBy: { occurredAt: 'desc' }, take: 20,
    }),
    prisma.deviceRawEvent.count({ where: { clockSkewSuspect: true, deviceTime: { gte: zonedToUtc(since, '00:00', tz) } } }),
    prisma.deviceRawEvent.count({ where: { employeeId: null } }),
  ]);

  // Perangkat
  const devices = can(actor, 'device.read')
    ? await prisma.attendanceDevice.findMany({ where: { deletedAt: null }, select: { id: true, name: true, status: true, lastSyncAt: true, isActive: true, adapter: true }, orderBy: { name: 'asc' } })
    : [];

  // Pengajuan menunggu
  const pending = {
    corrections: can(actor, 'correction.review') ? await prisma.attendanceCorrection.count({ where: { status: 'PENDING', employee: employeeScopeWhere(actor, 'correction.review'), ...(actor.employeeId ? { NOT: { employeeId: actor.employeeId } } : {}) } }) : 0,
    leave: can(actor, 'leave.approve') || can(actor, 'leave.manage') ? await prisma.leaveApproval.count({ where: await pendingLeaveApprovalWhere(actor) }) : 0,
    biometrics: (await pendingVerifications(actor)).length,
  };

  return {
    date, from, tz, today,
    totals: { active: employees.length },
    byUnit: [...byUnit.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    byStatus: [...byStatus.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    summary, trend,
    anomalies: { reviewRecords, failedEvents, skewed, unmatchedRaw },
    devices, pending,
  };
}

/** Dashboard pegawai: hanya data milik sendiri. */
export async function employeeDashboard(actor: Actor) {
  const s = await getSettings();
  const tz = s['org.timezone'];
  const today = todayIn(tz);
  const empId = actor.employeeId!;
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: empId }, include: { unit: true, biometrics: { where: { status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } }, select: { status: true } } } });
  const monthStart = `${today.slice(0, 7)}-01`;
  const ctx = await loadPlanContext([empId], addDays(today, -1), addDays(today, 7));
  const [todayRec, yesterdayRec, recent, monthRecs, corrections, leaves] = await Promise.all([
    prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: empId, workDate: toDbDate(today) } } }),
    prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: empId, workDate: toDbDate(addDays(today, -1)) } } }),
    prisma.attendanceRecord.findMany({ where: { employeeId: empId, workDate: { lte: toDbDate(today) } }, orderBy: { workDate: 'desc' }, take: 7 }),
    prisma.attendanceRecord.findMany({ where: { employeeId: empId, workDate: { gte: toDbDate(monthStart), lte: toDbDate(today) } } }),
    prisma.attendanceCorrection.findMany({ where: { employeeId: empId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    s['modules.leave'] ? prisma.leaveRequest.findMany({ where: { employeeId: empId }, include: { leaveType: true }, orderBy: { createdAt: 'desc' }, take: 5 }) : Promise.resolve([]),
  ]);
  const monthPlans = await loadPlanContext([empId], monthStart, today);
  const scheduled = dateRange(monthStart, today).filter((d) => isScheduledWorkday(monthPlans.planFor(empId, d)));
  const recDates = new Set(monthRecs.map((r) => fromDbDate(r.workDate)));
  return {
    today, tz, employee: emp, now: zonedParts(new Date(), tz).time.slice(0, 5),
    plan: ctx.planFor(empId, today),
    todayRec,
    openOvernight: yesterdayRec?.checkInAt && !yesterdayRec.checkOutAt ? yesterdayRec : null,
    upcoming: dateRange(today, addDays(today, 6)).map((d) => ctx.planFor(empId, d)),
    recent,
    month: {
      scheduled: scheduled.length,
      present: monthRecs.filter((r) => ['HADIR', 'TERLAMBAT', 'DINAS_LUAR'].includes(r.status)).length,
      late: monthRecs.filter((r) => r.status === 'TERLAMBAT').length,
      lateMinutes: monthRecs.reduce((n, r) => n + r.lateMinutes, 0),
      leave: monthRecs.filter((r) => ['IZIN', 'SAKIT', 'CUTI'].includes(r.status)).length,
      noRecord: scheduled.filter((d) => !recDates.has(d) && d < today).length,
    },
    balances: s['modules.leave'] ? await balancesFor(empId, Number(today.slice(0, 4))) : [],
    corrections, leaves,
    faceStatus: emp.biometrics.find((b) => b.status === 'ACTIVE') ? 'ACTIVE' : emp.biometrics[0]?.status ?? null,
  };
}
