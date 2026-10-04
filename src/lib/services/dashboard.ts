import { prisma } from '../db';
import { can, employeeScopeWhere, scopeOf, type Actor } from '../auth/actor';
import { getSettings } from '../settings';
import { addDays, dateRange, fromDbDate, toDbDate, todayIn, zonedParts, zonedToUtc } from '../time';
import { loadPlanContext, isScheduledWorkday } from '../attendance/plan';
import { categoryOf } from './reports';
import { effectiveStatus } from '../attendance/engine';
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

  // Anomali, perangkat, dan pengajuan menunggu dimuat bersamaan dengan rekap di bawah.
  const since = addDays(date, -6);
  const extras = Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employee: empWhere, needsReview: true, workDate: { gte: toDbDate(since), lte: toDbDate(date) } },
      include: { employee: { select: { id: true, fullName: true } } }, orderBy: { workDate: 'desc' }, take: 20,
    }),
    prisma.attendanceEvent.findMany({
      where: { occurredAt: { gte: zonedToUtc(since, '00:00', tz) }, verification: { outcome: { notIn: ['SUCCESS', 'DUPLICATE', 'ALREADY_RECORDED'] } }, OR: [{ employee: empWhere }, ...(scopeOf(actor, 'attendance.monitor')?.all ? [{ employeeId: null }] : [])] },
      include: { verification: true, employee: { select: { id: true, fullName: true } } }, orderBy: { occurredAt: 'desc' }, take: 20,
    }),
    prisma.deviceRawEvent.count({ where: { clockSkewSuspect: true, deviceTime: { gte: zonedToUtc(since, '00:00', tz) } } }),
    prisma.deviceRawEvent.count({ where: { employeeId: null } }),

    can(actor, 'device.read')
      ? prisma.attendanceDevice.findMany({ where: { deletedAt: null }, select: { id: true, name: true, status: true, lastSyncAt: true, isActive: true, adapter: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
    (async () => ({
      corrections: can(actor, 'correction.review') ? await prisma.attendanceCorrection.count({ where: { status: 'PENDING', employee: employeeScopeWhere(actor, 'correction.review'), ...(actor.employeeId ? { NOT: { employeeId: actor.employeeId } } : {}) } }) : 0,
      leave: can(actor, 'leave.approve') || can(actor, 'leave.manage') ? await prisma.leaveApproval.count({ where: await pendingLeaveApprovalWhere(actor) }) : 0,
      biometrics: (await pendingVerifications(actor)).length,
    }))(),
  ]);
  extras.catch(() => undefined); // galat tetap dilempar saat di-await di bawah; ini hanya mencegah unhandled rejection

  const byUnit = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const e of employees) {
    byUnit.set(e.unit?.name ?? 'Tanpa unit', (byUnit.get(e.unit?.name ?? 'Tanpa unit') || 0) + 1);
    byStatus.set(e.employmentStatus || 'Belum diisi', (byStatus.get(e.employmentStatus || 'Belum diisi') || 0) + 1);
  }

  // Satu baris per pegawai berisi "YYYY-MM-DDSTATUS,..." untuk seluruh rentang: jauh lebih ringan
  // daripada mengambil puluhan ribu baris rekap lewat ORM.
  const [packed, ctx] = await Promise.all([
    ids.length
      ? prisma.$queryRaw<{ e: string; d: string }[]>`
          select employee_id::text as e, string_agg(to_char(work_date, 'YYYY-MM-DD') || status || '|'
            || case when status_locked then 'L' else '-' end || case when check_in_at is null then '0' else '1' end
            || case when check_out_at is null then '0' else '1' end, ',') as d
          from attendance_records
          where employee_id = any(${ids}::uuid[]) and work_date between ${toDbDate(from)} and ${toDbDate(date)}
            and (${f.method ?? null}::text is null or check_in_method = ${f.method ?? null} or check_out_method = ${f.method ?? null})
          group by employee_id`
      : Promise.resolve([]),
    loadPlanContext(ids, from, date),
  ]);
  // Status rekap per pegawai per tanggal; peta bertingkat menghindari ratusan ribu kunci string gabungan.
  const statusOf = new Map<string, Map<string, string>>();
  for (const row of packed) {
    const m = new Map<string, string>();
    for (const item of row.d.split(',')) m.set(item.slice(0, 10), item.slice(10));
    statusOf.set(row.e, m);
  }
  const NO_RECORDS = new Map<string, string>();

  // Ringkasan tanggal terpilih
  const summary: Record<string, number> = { HADIR: 0, TERLAMBAT: 0, DINAS_LUAR: 0, IZIN_CUTI: 0, TIDAK_HADIR: 0, BELUM_ABSEN: 0, LIBUR: 0 };
  // "STATUS|L11": status rekap, terkunci (L), ada jam masuk (1), ada jam pulang (1); cukup untuk status efektif.
  const recOf = (packed: string | undefined) => {
    if (!packed) return null;
    const [status, f = '-11'] = packed.split('|');
    return { status, statusLocked: f[0] === 'L', checkInAt: f[1] === '1' ? new Date(0) : null, checkOutAt: f[2] === '1' ? new Date(0) : null };
  };
  for (const id of ids) {
    summary[categoryOf(ctx.planFor(id, date), recOf(statusOf.get(id)?.get(date)), today)]++;
  }

  // Tren harian: pegawai di luar, tanggal di dalam, agar peta per pegawai diambil sekali.
  const dates = dateRange(from, date);
  const trend = dates.map((d) => ({ date: d, hadir: 0, terlambat: 0, izin: 0, alfa: 0, belum: 0, dijadwalkan: 0 }));
  for (const id of ids) {
    const recs = statusOf.get(id) ?? NO_RECORDS;
    for (let i = 0; i < dates.length; i++) {
      const t = trend[i];
      const plan = ctx.planFor(id, dates[i]);
      if (isScheduledWorkday(plan)) t.dijadwalkan++;
      const cat = categoryOf(plan, recOf(recs.get(dates[i])), today);
      if (cat === 'HADIR' || cat === 'DINAS_LUAR') t.hadir++;
      else if (cat === 'TERLAMBAT') t.terlambat++;
      else if (cat === 'IZIN_CUTI') t.izin++;
      else if (cat === 'TIDAK_HADIR') t.alfa++;
      else if (cat === 'BELUM_ABSEN') t.belum++;
    }
  }

  const [reviewRecords, failedEvents, skewed, unmatchedRaw, devices, pending] = await extras;

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
  const recByDate = new Map(monthRecs.map((r) => [fromDbDate(r.workDate), r]));
  const monthStatus = dateRange(monthStart, today).map((d) => effectiveStatus(recByDate.get(d) ?? null, monthPlans.planFor(empId, d), today));
  const monthCount = (...st: string[]) => monthStatus.filter((x) => x && st.includes(x)).length;
  return {
    today, tz, employee: emp, now: zonedParts(new Date(), tz).time.slice(0, 5),
    plan: ctx.planFor(empId, today),
    todayRec,
    openOvernight: yesterdayRec?.checkInAt && !yesterdayRec.checkOutAt ? yesterdayRec : null,
    upcoming: dateRange(today, addDays(today, 6)).map((d) => ctx.planFor(empId, d)),
    recent,
    month: {
      scheduled: scheduled.length,
      present: monthCount('HADIR', 'TERLAMBAT', 'DINAS_LUAR'),
      late: monthCount('TERLAMBAT'),
      lateMinutes: monthRecs.reduce((n, r) => n + r.lateMinutes, 0),
      leave: monthCount('IZIN', 'SAKIT', 'CUTI'),
      // Alfa: hari kerja lewat tanpa absen, salah satu jam kosong, atau ditetapkan petugas.
      alfa: monthCount('ALFA', 'ALFA_AWAL', 'ALFA_AKHIR', 'TIDAK_HADIR'),
    },
    balances: s['modules.leave'] ? await balancesFor(empId, Number(today.slice(0, 4))) : [],
    corrections, leaves,
    faceStatus: emp.biometrics.find((b) => b.status === 'ACTIVE') ? 'ACTIVE' : emp.biometrics[0]?.status ?? null,
  };
}
