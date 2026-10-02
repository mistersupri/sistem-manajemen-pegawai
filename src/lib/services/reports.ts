import { z } from 'zod';
import { clampPage } from '../list';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { assertCan, can, employeeScopeWhere, getEmployeeInScope, type Actor } from '../auth/actor';
import { unprocessable } from '../errors';
import { getSettings } from '../settings';
import { addDays, dateRange, fromDbDate, isValidDate, toDbDate, todayIn, zonedToUtc } from '../time';
import { loadPlanContext, isScheduledWorkday } from '../attendance/plan';
import type { DayPlan } from '../attendance/engine';

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

function recordFilter(f: Partial<ReportFilter>): Prisma.AttendanceRecordWhereInput {
  const and: Prisma.AttendanceRecordWhereInput[] = [];
  if (f.status && f.status !== 'TANPA_TRANSAKSI') and.push({ status: f.status });
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
  absent: number;
  noRecord: number;
  attendancePct: number | null;
}

/**
 * Rekap per pegawai untuk rentang tanggal. "Tanpa transaksi" = hari kerja terjadwal yang sudah lewat
 * tanpa catatan apa pun; ini BUKAN otomatis "tidak hadir". Status tidak hadir hanya dari penetapan petugas.
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
    prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: { gte: toDbDate(f.from), lte: toDbDate(f.to) }, ...recordFilter(f) } }),
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
    const recDates = new Set(recs.map((r) => fromDbDate(r.workDate)));
    const plans = days.map((d) => ctx.planFor(e.id, d));
    const scheduled = plans.filter((p) => isScheduledWorkday(p) && p.date <= today);
    const count = (s: string) => recs.filter((r) => r.status === s).length;
    const present = count('HADIR') + count('TERLAMBAT');
    const fieldDuty = count('DINAS_LUAR');
    const noRecord = f.status && f.status !== 'TANPA_TRANSAKSI' ? 0 : scheduled.filter((p) => !recDates.has(p.date)).length;
    return {
      employeeId: e.id, name: e.fullName, employeeNumber: e.employeeNumber, unit: e.unit?.name ?? null,
      scheduledDays: scheduled.length, present, late: count('TERLAMBAT'), lateMinutes: recs.reduce((n, r) => n + r.lateMinutes, 0),
      earlyLeave: recs.filter((r) => r.earlyLeaveMinutes > 0).length, earlyLeaveMinutes: recs.reduce((n, r) => n + r.earlyLeaveMinutes, 0),
      fieldDuty, permit: count('IZIN'), sick: count('SAKIT'), leave: count('CUTI'), absent: count('TIDAK_HADIR'), noRecord,
      attendancePct: scheduled.length ? Math.round(((present + fieldDuty) / scheduled.length) * 1000) / 10 : null,
    };
  });
  return { filter: f, rows: f.status === 'TANPA_TRANSAKSI' ? rows.filter((r) => r.noRecord > 0) : rows };
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
    ...recordFilter(f),
    ...(f.status === 'TANPA_TRANSAKSI' ? { id: '00000000-0000-0000-0000-000000000000' } : {}),
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

// ---------------------------------------------------------------------------
// Monitoring kehadiran harian
// ---------------------------------------------------------------------------

export const CATEGORY_LABEL: Record<string, string> = {
  HADIR: 'Hadir',
  TERLAMBAT: 'Terlambat',
  DINAS_LUAR: 'Dinas luar',
  IZIN_CUTI: 'Izin, sakit, cuti',
  TIDAK_HADIR: 'Tidak hadir',
  BELUM_ABSEN: 'Belum ada transaksi',
  LIBUR: 'Libur / tanpa jadwal',
};

export function categoryOf(plan: DayPlan, rec: { status: string } | null) {
  if (rec) {
    if (['IZIN', 'SAKIT', 'CUTI'].includes(rec.status)) return 'IZIN_CUTI';
    return rec.status;
  }
  return isScheduledWorkday(plan) ? 'BELUM_ABSEN' : 'LIBUR';
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
  const date = q.date ?? todayIn(tz);
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
    return { employee: e, plan, record: rec, category: categoryOf(plan, rec) };
  });
  const counts: Record<string, number> = Object.fromEntries(Object.keys(CATEGORY_LABEL).map((k) => [k, 0]));
  for (const r of rows) counts[r.category] = (counts[r.category] || 0) + 1;
  if (q.category) rows = rows.filter((r) => r.category === q.category);
  if (q.method) rows = rows.filter((r) => r.record && (r.record.checkInMethod === q.method || r.record.checkOutMethod === q.method));
  return { date, counts, rows, tz };
}

// ---------------------------------------------------------------------------
// Rekap kalender: pegawai x tanggal dalam satu bulan
// ---------------------------------------------------------------------------

/** Kode singkat status di sel kalender. "-" = hari kerja lewat tanpa transaksi (bukan otomatis tidak hadir). */
export const CALENDAR_CODE: Record<string, string> = {
  HADIR: 'H', TERLAMBAT: 'T', DINAS_LUAR: 'DL', IZIN: 'I', SAKIT: 'S', CUTI: 'C', TIDAK_HADIR: 'A', LIBUR: 'L', TANPA_TRANSAKSI: '-',
};
export const CALENDAR_LEGEND: [string, string][] = [
  ['H', 'Hadir'], ['T', 'Terlambat'], ['DL', 'Dinas luar'], ['I', 'Izin'], ['S', 'Sakit'], ['C', 'Cuti'],
  ['A', 'Tidak hadir (ditetapkan petugas)'], ['L', 'Libur atau bukan hari kerja'], ['-', 'Belum ada transaksi'],
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
    prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: range }, select: { employeeId: true, workDate: true, status: true, checkInAt: true, checkOutAt: true, lateMinutes: true, note: true } }),
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
      let code: string | null;
      if (r) code = CALENDAR_CODE[r.status] ?? r.status;
      else if (!isScheduledWorkday(p)) code = 'L';
      else code = d < today ? '-' : null;
      const presence = !!r && ['HADIR', 'TERLAMBAT', 'DINAS_LUAR'].includes(r.status);
      return {
        date: d, code, status: r?.status ?? null, checkIn, checkOut, lateMinutes: r?.lateMinutes ?? 0,
        missingIn: presence && !checkIn && !!checkOut,
        missingOut: presence && !!checkIn && !checkOut && d < today,
        corrected: fixed.has(`${e.id}:${d}`),
        note: !r && !isScheduledWorkday(p) ? (p.holidayName ?? null) : r?.note ?? null,
      };
    }),
  }));
  return { month: q.month, from, to, today, tz, columns, rows, total, page: q.page, pageSize: q.pageSize };
}
