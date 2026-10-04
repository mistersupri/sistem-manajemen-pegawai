import { z } from 'zod';
import { clampPage } from '../list';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { assertCan, can, employeeScopeWhere, getEmployeeInScope, type Actor } from '../auth/actor';
import { unprocessable } from '../errors';
import { getSettings } from '../settings';
import { addDays, dateRange, fromDbDate, isValidDate, toDbDate, todayIn, zonedToUtc } from '../time';
import { loadPlanContext, isScheduledWorkday } from '../attendance/plan';
import { effectiveStatus, type DayPlan } from '../attendance/engine';

export const reportFilter = z.object({
  from: z.string().refine(isValidDate, 'Tanggal tidak valid'),
  to: z.string().refine(isValidDate, 'Tanggal tidak valid'),
  unitId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  employeeId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  status: z.string().max(30).optional().or(z.literal('')).transform((v) => v || undefined),
  method: z.string().max(30).optional().or(z.literal('')).transform((v) => v || undefined),
  deviceId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  q: z.string().max(100).optional(),
}).refine((v) => v.from <= v.to, { message: 'Tanggal awal harus sebelum tanggal akhir', path: ['to'] })
  .refine((v) => dateRange(v.from, v.to).length <= 366, { message: 'Rentang maksimal 1 tahun', path: ['to'] });
export type ReportFilter = z.infer<typeof reportFilter>;

function employeeFilter(actor: Actor, f: Partial<ReportFilter>, perm: 'attendance.report' | 'attendance.monitor' | 'attendance.export'): Prisma.EmployeeWhereInput {
  return {
    AND: [
      { deletedAt: null },
      employeeScopeWhere(actor, perm),
      f.unitId ? { unitId: f.unitId } : {},
      f.employeeId ? { id: f.employeeId } : {},
      f.q ? { OR: [{ fullName: { contains: f.q, mode: 'insensitive' } }, { employeeNumber: { contains: f.q } }] } : {},
    ],
  };
}

/** Pilihan filter status: status rekap ditambah status Alfa yang dihitung dari hari yang sudah lewat. */
export const STATUS_FILTER: [string, string][] = [
  ['HADIR', 'Hadir'], ['TERLAMBAT', 'Terlambat'], ['DINAS_LUAR', 'Dinas luar'], ['IZIN', 'Izin'], ['SAKIT', 'Sakit'], ['CUTI', 'Cuti'],
  ['ALFA', 'Alfa'], ['ALFA_AWAL', 'Alfa awal (tidak absen masuk)'], ['ALFA_AKHIR', 'Alfa akhir (tidak absen pulang)'],
];

/**
 * Filter status pada rekap tersimpan. ALFA mencakup yang ditetapkan petugas (hari tanpa transaksi tidak punya
 * baris rekap). ALFA_AWAL dan ALFA_AKHIR dicari dari jam yang kosong, mengikuti effectiveStatus.
 */
function recordFilter(f: Partial<ReportFilter>, today: string): Prisma.AttendanceRecordWhereInput {
  const and: Prisma.AttendanceRecordWhereInput[] = [];
  if (f.status === 'ALFA') and.push({ status: 'TIDAK_HADIR' });
  else if (f.status === 'ALFA_AWAL') and.push({ statusLocked: false, isOffDay: false, checkInAt: null, checkOutAt: { not: null } });
  else if (f.status === 'ALFA_AKHIR') and.push({ statusLocked: false, isOffDay: false, checkInAt: { not: null }, checkOutAt: null, workDate: { lt: toDbDate(today) } });
  else if (f.status) and.push({ status: f.status, ...(['HADIR', 'TERLAMBAT'].includes(f.status) ? { NOT: [{ checkInAt: null }, { checkOutAt: null, workDate: { lt: toDbDate(today) } }] } : {}) });
  if (f.method) and.push({ OR: [{ checkInMethod: f.method }, { checkOutMethod: f.method }] });
  if (f.deviceId) {
    and.push({ employee: { rawEvents: { some: { deviceId: f.deviceId } } } });
  }
  return and.length ? { AND: and } : {};
}

export interface RecapRow {
  employeeId: string;
  name: string;
  employeeNumber: string | null;
  unit: string | null;
  scheduledDays: number;
  present: number;
  late: number;
  lateMinutes: number;
  earlyLeave: number;
  earlyLeaveMinutes: number;
  fieldDuty: number;
  permit: number;
  sick: number;
  leave: number;
  alfa: number;
  alfaAwal: number;
  alfaAkhir: number;
  attendancePct: number | null;
}

/**
 * Rekap per pegawai untuk rentang tanggal, memakai status efektif per hari (lihat effectiveStatus):
 * hari kerja yang lewat tanpa transaksi dihitung Alfa, satu jam yang kosong dihitung Alfa awal/akhir.
 */
export async function recap(actor: Actor, raw: unknown, perm: 'attendance.report' | 'attendance.export' = 'attendance.report') {
  assertCan(actor, perm);
  const f = reportFilter.parse(raw);
  const tz = (await getSettings())['org.timezone'];
  const today = todayIn(tz);
  const employees = await prisma.employee.findMany({
    where: { AND: [employeeFilter(actor, f, perm), { OR: [{ isActive: true }, { activeEffectiveDate: { gte: toDbDate(f.from) } }] }] },
    select: { id: true, fullName: true, employeeNumber: true, unit: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
  });
  const ids = employees.map((e) => e.id);
  const [records, ctx] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: { gte: toDbDate(f.from), lte: toDbDate(f.to) }, ...(f.method || f.deviceId ? recordFilter({ method: f.method, deviceId: f.deviceId }, today) : {}) } }),
    loadPlanContext(ids, f.from, f.to),
  ]);
  const byEmp = new Map<string, typeof records>();
  for (const r of records) {
    const list = byEmp.get(r.employeeId);
    if (list) list.push(r);
    else byEmp.set(r.employeeId, [r]);
  }
  const days = dateRange(f.from, f.to);
  const rows: RecapRow[] = employees.map((e) => {
    const recs = byEmp.get(e.id) || [];
    const recByDate = new Map(recs.map((r) => [fromDbDate(r.workDate), r]));
    const plans = days.map((d) => ctx.planFor(e.id, d)).filter((p) => p.date <= today);
    const scheduled = plans.filter((p) => isScheduledWorkday(p));
    // Status efektif per hari; hari dengan filter metode/perangkat yang tidak cocok tidak dihitung Alfa.
    const statuses = plans.map((p) => {
      const r = recByDate.get(p.date) ?? null;
      if (!r && (f.method || f.deviceId)) return null;
      return effectiveStatus(r, p, today);
    });
    const count = (...s: string[]) => statuses.filter((x) => x && s.includes(x)).length;
    const counted = recs.filter((r) => fromDbDate(r.workDate) <= today);
    const present = count('HADIR', 'TERLAMBAT');
    const fieldDuty = count('DINAS_LUAR');
    return {
      employeeId: e.id, name: e.fullName, employeeNumber: e.employeeNumber, unit: e.unit?.name ?? null,
      scheduledDays: scheduled.length, present, late: count('TERLAMBAT'), lateMinutes: counted.reduce((n, r) => n + r.lateMinutes, 0),
      earlyLeave: counted.filter((r) => r.earlyLeaveMinutes > 0).length, earlyLeaveMinutes: counted.reduce((n, r) => n + r.earlyLeaveMinutes, 0),
      fieldDuty, permit: count('IZIN'), sick: count('SAKIT'), leave: count('CUTI'),
      alfa: count('ALFA', 'TIDAK_HADIR'), alfaAwal: count('ALFA_AWAL'), alfaAkhir: count('ALFA_AKHIR'),
      attendancePct: scheduled.length ? Math.round(((present + fieldDuty) / scheduled.length) * 1000) / 10 : null,
    };
  });
  const by: Record<string, (r: RecapRow) => number> = {
    HADIR: (r) => r.present, TERLAMBAT: (r) => r.late, DINAS_LUAR: (r) => r.fieldDuty, IZIN: (r) => r.permit, SAKIT: (r) => r.sick, CUTI: (r) => r.leave,
    ALFA: (r) => r.alfa, ALFA_AWAL: (r) => r.alfaAwal, ALFA_AKHIR: (r) => r.alfaAkhir,
  };
  return { filter: f, rows: f.status && by[f.status] ? rows.filter((r) => by[f.status!](r) > 0) : rows };
}

/** Detail harian (satu baris per pegawai per tanggal yang punya catatan). */
const DAILY_ORDER: Record<string, (d: 'asc' | 'desc') => Prisma.AttendanceRecordOrderByWithRelationInput[]> = {
  tanggal: (d) => [{ workDate: d }, { employee: { fullName: 'asc' } }, { id: 'asc' }],
  nama: (d) => [{ employee: { fullName: d } }, { workDate: 'desc' }, { id: 'asc' }],
  masuk: (d) => [{ checkInAt: { sort: d, nulls: 'last' } }, { id: 'asc' }],
  pulang: (d) => [{ checkOutAt: { sort: d, nulls: 'last' } }, { id: 'asc' }],
  status: (d) => [{ status: d }, { workDate: 'desc' }, { id: 'asc' }],
  terlambat: (d) => [{ lateMinutes: d }, { workDate: 'desc' }, { id: 'asc' }],
};
export const DAILY_SORTS = Object.keys(DAILY_ORDER);

export async function dailyRecords(actor: Actor, raw: unknown, opts: { page?: number; pageSize?: number; sort?: string; dir?: 'asc' | 'desc'; perm?: 'attendance.report' | 'attendance.monitor' | 'attendance.export' } = {}) {
  const perm = opts.perm ?? 'attendance.report';
  assertCan(actor, perm);
  const f = reportFilter.parse(raw);
  const where: Prisma.AttendanceRecordWhereInput = {
    workDate: { gte: toDbDate(f.from), lte: toDbDate(f.to) },
    employee: employeeFilter(actor, f, perm),
    ...recordFilter(f, todayIn((await getSettings())['org.timezone'])),
  };
  const size = opts.pageSize ?? 50;
  const sort = opts.sort && DAILY_ORDER[opts.sort] ? opts.sort : 'tanggal';
  const dir = opts.dir ?? (sort === 'tanggal' ? 'desc' : 'asc');
  const total = await prisma.attendanceRecord.count({ where });
  const page = clampPage(opts.page ?? 1, size, total);
  const rows = await prisma.attendanceRecord.findMany({
    where,
    include: { employee: { select: { id: true, fullName: true, employeeNumber: true, unit: { select: { name: true } } } }, schedule: { select: { code: true, name: true, checkIn: true, checkOut: true } } },
    orderBy: DAILY_ORDER[sort](dir),
    skip: (page - 1) * size,
    take: size,
  });
  return { total, page, pageSize: size, sort, dir, rows };
}

/** Penelusuran satu rekap harian ke jadwal, aturan, transaksi sumber, koreksi, dan cuti. */
export async function traceRecord(actor: Actor, employeeId: string, date: string) {
  const perm = can(actor, 'attendance.monitor') ? 'attendance.monitor' : 'attendance.self';
  const emp = await getEmployeeInScope(actor, perm, employeeId);
  if (perm === 'attendance.self' && emp.id !== actor.employeeId) throw unprocessable('Tidak diizinkan.');
  if (!isValidDate(date)) throw unprocessable('Tanggal tidak valid.');
  const tz = (await getSettings())['org.timezone'];
  const wd = toDbDate(date);
  const [record, events, raws, corrections, leave, plan] = await Promise.all([
    prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate: wd } }, include: { schedule: true, scheduleRevision: true } }),
    prisma.attendanceEvent.findMany({ where: { employeeId, OR: [{ workDate: wd }, { occurredAt: { gte: zonedToUtc(date, '00:00', tz), lte: zonedToUtc(addDays(date, 1), '12:00', tz) } }] }, include: { verification: true, station: { select: { name: true } } }, orderBy: { occurredAt: 'asc' } }),
    prisma.deviceRawEvent.findMany({ where: { OR: [{ employeeId, workDate: wd }, ...(emp.machinePin ? [{ devicePin: emp.machinePin, deviceTime: { gte: zonedToUtc(date, '00:00', tz), lte: zonedToUtc(addDays(date, 1), '12:00', tz) } }] : [])] }, include: { device: { select: { name: true } } }, orderBy: { deviceTime: 'asc' } }),
    prisma.attendanceCorrection.findMany({ where: { employeeId, workDate: wd }, orderBy: { createdAt: 'desc' } }),
    prisma.leaveRequest.findMany({ where: { employeeId, startDate: { lte: wd }, endDate: { gte: wd } }, include: { leaveType: true } }),
    loadPlanContext([employeeId], date, date).then((c) => c.planFor(employeeId, date)),
  ]);
  return { employee: emp, date, plan, record, events: events.map(({ photoPath, ...e }) => ({ ...e, hasPhoto: !!photoPath })), raws, corrections, leave, tz };
}

// Monitoring kehadiran harian
export const CATEGORY_LABEL: Record<string, string> = {
  HADIR: 'Hadir',
  TERLAMBAT: 'Terlambat',
  DINAS_LUAR: 'Dinas luar',
  IZIN_CUTI: 'Izin, sakit, cuti',
  TIDAK_HADIR: 'Alfa',
  BELUM_ABSEN: 'Belum absen',
  LIBUR: 'Libur / tanpa jadwal',
};

type RecLike = { status: string; statusLocked: boolean; checkInAt: Date | null; checkOutAt: Date | null };

/** Status efektif satu baris rekap tersimpan, memakai jadwal yang tercatat pada baris itu. */
export function recordStatus(r: RecLike & { workDate: Date; isOffDay: boolean; schedule: { checkIn: string; checkOut: string } | null }, today: string) {
  return effectiveStatus(r, { date: fromDbDate(r.workDate), isOffDay: r.isOffDay, schedule: r.schedule }, today) ?? r.status;
}

/** Kategori monitoring dari status efektif. Semua jenis Alfa (termasuk awal/akhir) masuk kategori TIDAK_HADIR. */
export function categoryOf(plan: DayPlan, rec: RecLike | null, today: string) {
  const st = effectiveStatus(rec, plan, today);
  if (!st || st === 'LIBUR') return 'LIBUR';
  if (st === 'BELUM') return 'BELUM_ABSEN';
  if (['IZIN', 'SAKIT', 'CUTI'].includes(st)) return 'IZIN_CUTI';
  if (['ALFA', 'ALFA_AWAL', 'ALFA_AKHIR', 'TIDAK_HADIR'].includes(st)) return 'TIDAK_HADIR';
  return st;
}

export async function monitoring(actor: Actor, raw: unknown) {
  assertCan(actor, 'attendance.monitor');
  const q = z.object({
    date: z.string().refine(isValidDate).optional(),
    unitId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
    category: z.string().max(20).optional().or(z.literal('')).transform((v) => v || undefined),
    method: z.string().max(30).optional().or(z.literal('')).transform((v) => v || undefined),
    q: z.string().max(100).optional(),
  }).parse(raw);
  const tz = (await getSettings())['org.timezone'];
  const today = todayIn(tz);
  const date = q.date ?? today;
  const employees = await prisma.employee.findMany({
    where: { AND: [employeeFilter(actor, { unitId: q.unitId, q: q.q }, 'attendance.monitor'), { isActive: true }] },
    select: { id: true, fullName: true, employeeNumber: true, unit: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
  });
  const ids = employees.map((e) => e.id);
  const [records, ctx] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: toDbDate(date) } }),
    loadPlanContext(ids, date, date),
  ]);
  const recMap = new Map(records.map((r) => [r.employeeId, r]));
  let rows = employees.map((e) => {
    const plan = ctx.planFor(e.id, date);
    const rec = recMap.get(e.id) ?? null;
    return { employee: e, plan, record: rec, status: effectiveStatus(rec, plan, today), category: categoryOf(plan, rec, today) };
  });
  const counts: Record<string, number> = Object.fromEntries(Object.keys(CATEGORY_LABEL).map((k) => [k, 0]));
  for (const r of rows) counts[r.category] = (counts[r.category] || 0) + 1;
  if (q.category) rows = rows.filter((r) => r.category === q.category);
  if (q.method) rows = rows.filter((r) => r.record && (r.record.checkInMethod === q.method || r.record.checkOutMethod === q.method));
  return { date, counts, rows, tz };
}

// Rekap kalender: pegawai x tanggal dalam satu bulan
/** Kode singkat status efektif di sel kalender. "-" = hari kerja yang belum lewat (hari ini atau sesudahnya). */
export const CALENDAR_CODE: Record<string, string> = {
  HADIR: 'H', TERLAMBAT: 'T', DINAS_LUAR: 'DL', IZIN: 'I', SAKIT: 'S', CUTI: 'C', TIDAK_HADIR: 'A', ALFA: 'A', ALFA_AWAL: 'AW', ALFA_AKHIR: 'AK', LIBUR: 'L', BELUM: '-',
};
export const CALENDAR_LEGEND: [string, string][] = [
  ['H', 'Hadir'], ['T', 'Terlambat'], ['DL', 'Dinas luar'], ['I', 'Izin'], ['S', 'Sakit'], ['C', 'Cuti'],
  ['A', 'Alfa (hari kerja lewat tanpa absen)'], ['AW', 'Alfa awal (tidak absen masuk)'], ['AK', 'Alfa akhir (tidak absen pulang)'],
  ['L', 'Libur atau bukan hari kerja'], ['-', 'Belum terlewati'],
];

export interface CalendarCell {
  date: string;
  code: string | null; // null = hari yang belum terjadi
  status: string | null;
  checkIn: string | null;
  checkOut: string | null;
  lateMinutes: number;
  missingIn: boolean; // ada absen pulang tanpa absen masuk
  missingOut: boolean; // hari sudah lewat, ada absen masuk tanpa absen pulang
  corrected: boolean;
  note: string | null;
}

export async function calendarRecap(actor: Actor, raw: unknown, perm: 'attendance.report' | 'attendance.export' = 'attendance.report') {
  assertCan(actor, perm);
  const q = z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Bulan tidak valid'),
    unitId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
    q: z.string().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(50),
  }).parse(raw);
  const tz = (await getSettings())['org.timezone'];
  const today = todayIn(tz);
  const from = `${q.month}-01`;
  const to = addDays(`${addDays(from, 32).slice(0, 7)}-01`, -1);
  const dates = dateRange(from, to);
  const where = { AND: [employeeFilter(actor, { unitId: q.unitId, q: q.q }, perm), { OR: [{ isActive: true }, { activeEffectiveDate: { gte: toDbDate(from) } }] }] };
  const [total, employees] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where, select: { id: true, fullName: true, employeeNumber: true, unit: { select: { name: true } } },
      orderBy: { fullName: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
    }),
  ]);
  const ids = employees.map((e) => e.id);
  const range = { gte: toDbDate(from), lte: toDbDate(to) };
  const [records, corrections, holidays, ctx] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: range }, select: { employeeId: true, workDate: true, status: true, statusLocked: true, checkInAt: true, checkOutAt: true, lateMinutes: true, note: true } }),
    prisma.attendanceCorrection.findMany({ where: { employeeId: { in: ids }, workDate: range, status: 'APPROVED' }, select: { employeeId: true, workDate: true } }),
    prisma.holiday.findMany({ where: { date: range, unitId: null, disabled: false }, select: { date: true, name: true, kind: true } }),
    loadPlanContext(ids, from, to),
  ]);
  const rec = new Map(records.map((r) => [`${r.employeeId}:${fromDbDate(r.workDate)}`, r]));
  const fixed = new Set(corrections.map((c) => `${c.employeeId}:${fromDbDate(c.workDate)}`));
  const hol = new Map(holidays.map((h) => [fromDbDate(h.date), { name: h.name, kind: h.kind }]));
  const hhmm = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d) : null);

  const columns = dates.map((d) => {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    return { date: d, day: Number(d.slice(8)), weekday: wd, weekend: wd === 0 || wd === 6, holiday: hol.get(d) ?? null, isToday: d === today };
  });
  const rows = employees.map((e) => ({
    employee: e,
    cells: dates.map((d): CalendarCell => {
      const r = rec.get(`${e.id}:${d}`);
      const p = ctx.planFor(e.id, d);
      const checkIn = hhmm(r?.checkInAt ?? null);
      const checkOut = hhmm(r?.checkOutAt ?? null);
      const st = effectiveStatus(r ?? null, p, today);
      const code = st ? CALENDAR_CODE[st] ?? st : isScheduledWorkday(p) ? null : 'L';
      const presence = !!r && ['HADIR', 'TERLAMBAT', 'DINAS_LUAR'].includes(r.status);
      return {
        date: d, code, status: st, checkIn, checkOut, lateMinutes: r?.lateMinutes ?? 0,
        missingIn: presence && !checkIn && !!checkOut,
        missingOut: presence && !!checkIn && !checkOut && d < today,
        corrected: fixed.has(`${e.id}:${d}`),
        note: !r && !isScheduledWorkday(p) ? (p.holidayName ?? null) : r?.note ?? null,
      };
    }),
  }));
  return { month: q.month, from, to, today, tz, columns, rows, total, page: q.page, pageSize: q.pageSize };
}
