import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { clampPage, listSchema } from '../list';
import { prisma, type Db } from '../db';
import { audit, diff } from '../audit';
import { assertCan, employeeScopeWhere, getEmployeeInScope, scopeOf, unitInScope, type Actor } from '../auth/actor';
import { conflict, forbidden, notFound, unprocessable } from '../errors';
import { dateRange, fromDbDate, isValidDate, isValidTime, monthBounds, toDbDate, todayIn } from '../time';
import { getSetting } from '../settings';
import { realUserId } from '../auth/system';
import { loadPlanContext } from '../attendance/plan';
import { rebuildRange } from '../attendance/record';

const hhmm = z.string().refine(isValidTime, 'Format jam HH:MM');
const date = z.string().refine(isValidDate, 'Tanggal tidak valid');

export const scheduleInput = z.object({
  code: z.string().trim().min(1, 'Kode wajib diisi').max(10).regex(/^[A-Za-z0-9_-]+$/, 'Hanya huruf/angka'),
  name: z.string().trim().min(2, 'Nama wajib diisi').max(80),
  kind: z.enum(['REGULER', 'SHIFT']),
  checkIn: hhmm,
  checkOut: hhmm,
  breakStart: hhmm.nullable().optional().or(z.literal('').transform(() => null)),
  breakEnd: hhmm.nullable().optional().or(z.literal('').transform(() => null)),
  lateToleranceMin: z.coerce.number().int().min(0).max(240),
  earlyLeaveToleranceMin: z.coerce.number().int().min(0).max(240),
  workdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'Pilih minimal satu hari kerja'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Warna hex, mis. #1a3a8f'),
  changeNote: z.string().trim().max(300).optional().nullable(),
}).refine((v) => v.checkIn !== v.checkOut, { message: 'Jam masuk dan pulang tidak boleh sama', path: ['checkOut'] })
  .refine((v) => !v.breakStart === !v.breakEnd, { message: 'Isi jam mulai dan selesai istirahat', path: ['breakEnd'] });

const ruleKeys = ['code', 'name', 'kind', 'checkIn', 'checkOut', 'breakStart', 'breakEnd', 'lateToleranceMin', 'earlyLeaveToleranceMin', 'workdays'] as const;
const rulesOf = (s: Record<string, unknown>) => Object.fromEntries(ruleKeys.map((k) => [k, s[k] ?? null]));

export async function listSchedules(includeInactive = false) {
  return prisma.workSchedule.findMany({
    where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ kind: 'asc' }, { checkIn: 'asc' }],
    include: { _count: { select: { assignments: { where: { deletedAt: null } } } } },
  });
}

export async function createSchedule(actor: Actor, raw: unknown, db: Db = prisma) {
  assertCan(actor, 'schedule.manage');
  const v = scheduleInput.parse(raw);
  if (await db.workSchedule.findUnique({ where: { code: v.code } })) throw conflict('Kode jadwal sudah dipakai.', { code: 'Sudah dipakai' });
  const { changeNote, ...data } = v;
  const s = await db.workSchedule.create({ data: { ...data, breakStart: data.breakStart ?? null, breakEnd: data.breakEnd ?? null } });
  await db.workScheduleRevision.create({ data: { scheduleId: s.id, version: 1, rules: rulesOf(s), changedById: realUserId(actor), changeNote: changeNote || 'Dibuat' } });
  await audit(actor, { action: 'schedule.create', entityType: 'WorkSchedule', entityId: s.id, after: rulesOf(s) }, db);
  return s;
}

/** Ubah aturan jadwal: versi naik dan salinan aturan lama tetap tersimpan sebagai riwayat. */
export async function updateSchedule(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, 'schedule.manage');
  const v = scheduleInput.parse(raw);
  const cur = await prisma.workSchedule.findFirst({ where: { id, deletedAt: null } });
  if (!cur) throw notFound('Jadwal tidak ditemukan.');
  const { changeNote, ...data } = v;
  const d = diff(rulesOf(cur), rulesOf({ ...data, breakStart: data.breakStart ?? null, breakEnd: data.breakEnd ?? null }));
  const colorChanged = cur.color !== data.color;
  if (!d.changed && !colorChanged) return cur;
  if (d.changed && !changeNote) throw unprocessable('Tuliskan alasan perubahan aturan.', { changeNote: 'Wajib diisi saat aturan berubah' });
  return prisma.$transaction(async (tx) => {
    const version = d.changed ? cur.version + 1 : cur.version;
    const s = await tx.workSchedule.update({ where: { id }, data: { ...data, breakStart: data.breakStart ?? null, breakEnd: data.breakEnd ?? null, version } });
    if (d.changed) {
      await tx.workScheduleRevision.create({ data: { scheduleId: id, version, rules: rulesOf(s), changedById: realUserId(actor), changeNote } });
      await audit(actor, { action: 'schedule.update', entityType: 'WorkSchedule', entityId: id, before: d.before, after: d.after, meta: { version, note: changeNote } }, tx);
    }
    return s;
  });
}

export async function setScheduleActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, 'schedule.manage');
  const s = await prisma.workSchedule.findFirst({ where: { id, deletedAt: null } });
  if (!s) throw notFound('Jadwal tidak ditemukan.');
  await prisma.workSchedule.update({ where: { id }, data: { isActive: active } });
  await audit(actor, { action: active ? 'schedule.activate' : 'schedule.deactivate', entityType: 'WorkSchedule', entityId: id });
}

export async function scheduleRevisions(id: string) {
  return prisma.workScheduleRevision.findMany({ where: { scheduleId: id }, orderBy: { version: 'desc' } });
}

// ---------------------------------------------------------------------------
// Penugasan
// ---------------------------------------------------------------------------

export const assignmentInput = z.object({
  scheduleId: z.string().uuid().nullable(),
  employeeId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid().nullable().optional(),
  kind: z.enum(['TETAP', 'SEMENTARA']),
  startDate: date,
  endDate: date.nullable().optional(),
  note: z.string().trim().max(300).optional().nullable(),
}).refine((v) => !!v.employeeId !== !!v.unitId, { message: 'Pilih pegawai atau unit (salah satu)', path: ['employeeId'] })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: 'Tanggal selesai harus setelah tanggal mulai', path: ['endDate'] })
  .refine((v) => v.scheduleId || v.kind === 'SEMENTARA', { message: 'Penugasan tetap harus memilih jadwal', path: ['scheduleId'] });

export async function createAssignment(actor: Actor, raw: unknown, db: Db = prisma) {
  assertCan(actor, 'schedule.manage');
  const v = assignmentInput.parse(raw);
  if (v.employeeId) await getEmployeeInScope(actor, 'schedule.manage', v.employeeId, db);
  if (v.unitId && !unitInScope(actor, 'schedule.manage', v.unitId)) throw forbidden('Unit di luar kewenangan Anda.');
  if (v.scheduleId && !(await db.workSchedule.findFirst({ where: { id: v.scheduleId, deletedAt: null, isActive: true } }))) throw unprocessable('Jadwal tidak aktif.', { scheduleId: 'Pilih jadwal aktif' });
  const a = await db.employeeScheduleAssignment.create({
    data: { scheduleId: v.scheduleId, employeeId: v.employeeId ?? null, unitId: v.unitId ?? null, kind: v.kind, startDate: toDbDate(v.startDate), endDate: v.endDate ? toDbDate(v.endDate) : null, note: v.note ?? null, createdById: realUserId(actor) },
  });
  await audit(actor, { action: 'schedule.assign', entityType: 'EmployeeScheduleAssignment', entityId: a.id, after: v }, db);
  if (db === prisma) await rebuildAfterAssignment(v.employeeId ?? null, v.unitId ?? null, v.startDate, v.endDate ?? null);
  return a;
}

export async function endAssignment(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, 'schedule.manage');
  const a = await prisma.employeeScheduleAssignment.findFirst({ where: { id, deletedAt: null } });
  if (!a) throw notFound('Penugasan tidak ditemukan.');
  if (a.employeeId) await getEmployeeInScope(actor, 'schedule.manage', a.employeeId);
  if (a.unitId && !unitInScope(actor, 'schedule.manage', a.unitId)) throw notFound('Penugasan tidak ditemukan.');
  const { endDate, remove } = z.object({ endDate: date.nullable().optional(), remove: z.boolean().optional() }).parse(raw);
  if (remove) {
    await prisma.employeeScheduleAssignment.update({ where: { id }, data: { deletedAt: new Date() } });
  } else {
    if (!endDate || endDate < fromDbDate(a.startDate)) throw unprocessable('Tanggal selesai tidak valid.', { endDate: 'Harus setelah tanggal mulai' });
    await prisma.employeeScheduleAssignment.update({ where: { id }, data: { endDate: toDbDate(endDate) } });
  }
  await audit(actor, { action: remove ? 'schedule.unassign' : 'schedule.assignment_end', entityType: 'EmployeeScheduleAssignment', entityId: id, before: { endDate: a.endDate }, after: { endDate, remove } });
  await rebuildAfterAssignment(a.employeeId, a.unitId, fromDbDate(a.startDate), a.endDate ? fromDbDate(a.endDate) : null);
}

export async function listAssignments(actor: Actor, filter: { employeeId?: string; unitId?: string; excludeDaily?: boolean }) {
  assertCan(actor, 'schedule.read');
  if (filter.employeeId) await getEmployeeInScope(actor, 'schedule.read', filter.employeeId);
  if (filter.unitId && !unitInScope(actor, 'schedule.read', filter.unitId)) throw notFound();
  const s = scopeOf(actor, 'schedule.read')!;
  return prisma.employeeScheduleAssignment.findMany({
    where: {
      deletedAt: null,
      ...(filter.excludeDaily ? { NOT: { kind: 'SEMENTARA', note: 'Perubahan harian' } } : {}),
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      ...(filter.unitId ? { unitId: filter.unitId } : {}),
      ...(!filter.employeeId && !filter.unitId && !s.all ? { OR: [{ unitId: { in: s.unitIds } }, { employee: { unitId: { in: s.unitIds } } }] } : {}),
    },
    include: { schedule: true, employee: { select: { id: true, fullName: true } }, unit: { select: { id: true, name: true } } },
    orderBy: [{ startDate: 'desc' }],
    take: 500,
  });
}

const ASSIGN_ORDER: Record<string, (d: 'asc' | 'desc') => Prisma.EmployeeScheduleAssignmentOrderByWithRelationInput[]> = {
  mulai: (d) => [{ startDate: d }, { id: 'asc' }],
  untuk: (d) => [{ employee: { fullName: d } }, { unit: { name: d } }, { startDate: 'desc' }],
  jadwal: (d) => [{ schedule: { code: d } }, { startDate: 'desc' }],
};
export const assignmentListQuery = z.object({
  q: z.string().trim().max(100).optional().or(z.literal('')).transform((v) => v || undefined),
  kind: z.enum(['TETAP', 'SEMENTARA', '']).catch('').default(''),
  scheduleId: z.string().max(40).optional().or(z.literal('')).catch(undefined).transform((v) => v || undefined),
  state: z.enum(['berlaku', 'akan', 'berakhir', '']).catch('').default(''),
}).and(listSchema(['mulai', 'untuk', 'jadwal'] as const, { sort: 'mulai', dir: 'desc' }));

/**
 * Daftar penugasan untuk tab Penugasan. Perubahan harian (dari kalender atau atur massal) disaring di database,
 * karena jumlahnya bisa ribuan dan dikelola di kalender bulanan.
 */
export async function listAssignmentsPage(actor: Actor, raw: unknown, today: string) {
  assertCan(actor, 'schedule.read');
  const q = assignmentListQuery.parse(raw);
  const s = scopeOf(actor, 'schedule.read')!;
  const t = toDbDate(today);
  const and: Prisma.EmployeeScheduleAssignmentWhereInput[] = [
    { deletedAt: null },
    { NOT: { kind: 'SEMENTARA', note: 'Perubahan harian' } },
  ];
  if (!s.all) and.push({ OR: [{ unitId: { in: s.unitIds } }, { employee: { unitId: { in: s.unitIds } } }] });
  if (q.kind) and.push({ kind: q.kind });
  if (q.scheduleId === 'LIBUR') and.push({ scheduleId: null });
  else if (q.scheduleId) and.push({ scheduleId: q.scheduleId });
  if (q.state === 'berlaku') and.push({ startDate: { lte: t }, OR: [{ endDate: null }, { endDate: { gte: t } }] });
  if (q.state === 'akan') and.push({ startDate: { gt: t } });
  if (q.state === 'berakhir') and.push({ endDate: { lt: t } });
  if (q.q) and.push({ OR: [{ employee: { fullName: { contains: q.q, mode: 'insensitive' } } }, { employee: { employeeNumber: { contains: q.q } } }, { unit: { name: { contains: q.q, mode: 'insensitive' } } }, { note: { contains: q.q, mode: 'insensitive' } }] });
  const where = { AND: and };
  const total = await prisma.employeeScheduleAssignment.count({ where });
  const page = clampPage(q.page, q.per, total);
  const rows = await prisma.employeeScheduleAssignment.findMany({
    where,
    include: { schedule: true, employee: { select: { id: true, fullName: true } }, unit: { select: { id: true, name: true } } },
    orderBy: ASSIGN_ORDER[q.sort](q.dir),
    skip: (page - 1) * q.per,
    take: q.per,
  });
  return { total, page, pageSize: q.per, sort: q.sort, dir: q.dir, rows };
}

/** Hitung ulang rekap yang terdampak perubahan penugasan (hanya sampai hari ini). */
async function rebuildAfterAssignment(employeeId: string | null, unitId: string | null, from: string, to: string | null) {
  const today = todayIn(await getSetting('org.timezone'));
  const end = to && to < today ? to : today;
  if (from > end) return;
  let ids: string[];
  if (employeeId) ids = [employeeId];
  else {
    const units = await prisma.organizationUnit.findMany({ select: { id: true, parentId: true } });
    const all = new Set([unitId!]);
    let grew = true;
    while (grew) { grew = false; for (const u of units) if (u.parentId && all.has(u.parentId) && !all.has(u.id)) { all.add(u.id); grew = true; } }
    ids = (await prisma.employee.findMany({ where: { unitId: { in: [...all] }, deletedAt: null }, select: { id: true } })).map((e) => e.id);
  }
  await rebuildActive(ids, from, end);
}

/** Susun ulang hanya pegawai/tanggal yang punya aktivitas, agar cepat. */
export async function rebuildActive(employeeIds: string[] | null, from: string, to: string) {
  const range = { gte: toDbDate(from), lte: toDbDate(to) };
  const where = employeeIds ? { employeeId: { in: employeeIds } } : {};
  const [ev, raw, rec, lv, co] = await Promise.all([
    prisma.attendanceEvent.findMany({ where: { ...where, workDate: range }, select: { employeeId: true }, distinct: ['employeeId'] }),
    prisma.deviceRawEvent.findMany({ where: { ...where, workDate: range }, select: { employeeId: true }, distinct: ['employeeId'] }),
    prisma.attendanceRecord.findMany({ where: { ...where, workDate: range }, select: { employeeId: true }, distinct: ['employeeId'] }),
    prisma.leaveRequest.findMany({ where: { ...where, status: 'APPROVED', startDate: { lte: toDbDate(to) }, endDate: { gte: toDbDate(from) } }, select: { employeeId: true }, distinct: ['employeeId'] }),
    prisma.attendanceCorrection.findMany({ where: { ...where, status: 'APPROVED', workDate: range }, select: { employeeId: true }, distinct: ['employeeId'] }),
  ]);
  const ids = [...new Set([...ev, ...raw, ...rec, ...lv, ...co].map((x) => x.employeeId).filter(Boolean) as string[])];
  if (!ids.length) return { employees: 0 };
  await rebuildRange(ids, from, to);
  return { employees: ids.length };
}

// ---------------------------------------------------------------------------
// Grid jadwal bulanan per unit
// ---------------------------------------------------------------------------

export async function scheduleGrid(actor: Actor, month: string, unitId?: string, opts: { q?: string; page?: number; per?: number } = {}) {
  assertCan(actor, 'schedule.read');
  if (unitId && !unitInScope(actor, 'schedule.read', unitId)) throw notFound();
  const { from, to } = monthBounds(month);
  const per = [25, 50, 100].includes(opts.per ?? 0) ? opts.per! : 50;
  const where: Prisma.EmployeeWhereInput = {
    AND: [
      { deletedAt: null, isActive: true }, employeeScopeWhere(actor, 'schedule.read'), unitId ? { unitId } : {},
      opts.q ? { OR: [{ fullName: { contains: opts.q, mode: 'insensitive' } }, { employeeNumber: { contains: opts.q } }] } : {},
    ],
  };
  const total = await prisma.employee.count({ where });
  const page = clampPage(opts.page ?? 1, per, total);
  const employees = await prisma.employee.findMany({
    where,
    select: { id: true, fullName: true, employeeNumber: true, unit: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
    skip: (page - 1) * per,
    take: per,
  });
  const ctx = await loadPlanContext(employees.map((e) => e.id), from, to);
  const temps = await prisma.employeeScheduleAssignment.findMany({
    where: { deletedAt: null, kind: 'SEMENTARA', employeeId: { in: employees.map((e) => e.id) }, startDate: { gte: toDbDate(from), lte: toDbDate(to) } },
    select: { employeeId: true, startDate: true, endDate: true },
  });
  const override = new Set(temps.filter((t) => t.endDate && fromDbDate(t.endDate) === fromDbDate(t.startDate)).map((t) => `${t.employeeId}:${fromDbDate(t.startDate)}`));
  const dates = dateRange(from, to);
  return {
    dates, total, page, pageSize: per,
    rows: employees.map((e) => ({
      employee: e,
      days: dates.map((d) => {
        const p = ctx.planFor(e.id, d);
        return { date: d, scheduleId: p.schedule?.id ?? null, code: p.schedule?.code ?? null, isOffDay: p.isOffDay, offReason: p.offReason ?? null, holidayName: p.holidayName ?? null, source: p.source, overridden: override.has(`${e.id}:${d}`) };
      }),
    })),
  };
}

/**
 * Ubah jadwal satu sel (pegawai + tanggal). value: id jadwal, 'LIBUR', atau 'BAWAAN'
 * (hapus perubahan harian sehingga kembali ke jadwal tetap).
 */
export async function setDay(actor: Actor, employeeId: string, day: string, value: string) {
  assertCan(actor, 'schedule.manage');
  await getEmployeeInScope(actor, 'schedule.manage', employeeId);
  if (!isValidDate(day)) throw unprocessable('Tanggal tidak valid.');
  const existing = await prisma.employeeScheduleAssignment.findMany({
    where: { employeeId, kind: 'SEMENTARA', deletedAt: null, startDate: toDbDate(day), endDate: toDbDate(day) },
  });
  await prisma.$transaction(async (tx) => {
    if (existing.length) await tx.employeeScheduleAssignment.updateMany({ where: { id: { in: existing.map((x) => x.id) } }, data: { deletedAt: new Date() } });
    if (value !== 'BAWAAN') {
      const scheduleId = value === 'LIBUR' ? null : value;
      if (scheduleId && !(await tx.workSchedule.findFirst({ where: { id: scheduleId, isActive: true, deletedAt: null } }))) throw unprocessable('Jadwal tidak aktif.');
      await tx.employeeScheduleAssignment.create({ data: { employeeId, scheduleId, kind: 'SEMENTARA', startDate: toDbDate(day), endDate: toDbDate(day), note: 'Perubahan harian', createdById: realUserId(actor) } });
    }
    await audit(actor, { action: 'schedule.set_day', entityType: 'Employee', entityId: employeeId, meta: { date: day, value } }, tx);
  });
  const today = todayIn(await getSetting('org.timezone'));
  if (day <= today) await rebuildRange([employeeId], day, day);
  return (await loadPlanContext([employeeId], day, day)).planFor(employeeId, day);
}

export const bulkDaysInput = z.object({
  employeeIds: z.array(z.string().uuid()).min(1, 'Pilih minimal satu pegawai').max(2000, 'Maksimal 2.000 pegawai sekali proses'),
  from: date,
  to: date,
  // 0 = Minggu. Kosong = semua hari dalam rentang.
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  // id jadwal, 'LIBUR', atau 'BAWAAN' (kembali ke jadwal tetap), sama seperti setDay.
  value: z.string().min(1, 'Pilih jadwal'),
}).refine((v) => v.to >= v.from, { message: 'Tanggal sampai harus setelah tanggal dari', path: ['to'] });

/**
 * Versi massal dari setDay: ubah harian untuk banyak pegawai x tanggal sekaligus, dalam satu transaksi.
 * Perubahan harian lama pada tanggal-tanggal itu diganti.
 */
export async function setDaysBulk(actor: Actor, raw: unknown) {
  assertCan(actor, 'schedule.manage');
  const v = bulkDaysInput.parse(raw);
  const ids = [...new Set(v.employeeIds)];
  const allowed = await prisma.employee.findMany({ where: { id: { in: ids }, deletedAt: null, ...employeeScopeWhere(actor, 'schedule.manage') }, select: { id: true } });
  if (allowed.length !== ids.length) throw forbidden('Sebagian pegawai yang dipilih di luar kewenangan Anda atau sudah dihapus.');
  const range = dateRange(v.from, v.to);
  if (range.length > 366) throw unprocessable('Rentang tanggal maksimal satu tahun.', { to: 'Terlalu panjang' });
  const days = v.weekdays.length ? range.filter((d) => v.weekdays.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) : range;
  if (!days.length) throw unprocessable('Tidak ada tanggal yang cocok dengan hari yang dipilih.', { weekdays: 'Tidak ada tanggal cocok' });
  if (days.length * ids.length > 20000) throw unprocessable(`Terlalu banyak sekaligus (${days.length * ids.length} hari-pegawai). Perkecil rentang atau jumlah pegawai.`);
  const scheduleId = v.value === 'LIBUR' || v.value === 'BAWAAN' ? null : v.value;
  if (scheduleId && !(await prisma.workSchedule.findFirst({ where: { id: scheduleId, isActive: true, deletedAt: null } }))) throw unprocessable('Jadwal tidak aktif.', { value: 'Pilih jadwal aktif' });

  const dbDays = days.map(toDbDate);
  const old = (await prisma.employeeScheduleAssignment.findMany({
    where: { employeeId: { in: ids }, kind: 'SEMENTARA', deletedAt: null, startDate: { in: dbDays }, endDate: { in: dbDays } },
    select: { id: true, startDate: true, endDate: true },
  })).filter((x) => x.endDate && x.startDate.getTime() === x.endDate.getTime());
  const createdById = realUserId(actor);
  await prisma.$transaction(async (tx) => {
    if (old.length) await tx.employeeScheduleAssignment.updateMany({ where: { id: { in: old.map((x) => x.id) } }, data: { deletedAt: new Date() } });
    if (v.value !== 'BAWAAN') {
      await tx.employeeScheduleAssignment.createMany({
        data: ids.flatMap((employeeId) => dbDays.map((d) => ({ employeeId, scheduleId, kind: 'SEMENTARA', startDate: d, endDate: d, note: 'Perubahan harian', createdById }))),
      });
    }
    await audit(actor, { action: 'schedule.set_days_bulk', entityType: 'Employee', meta: { from: v.from, to: v.to, weekdays: v.weekdays, value: v.value, employees: ids.length, days: days.length, employeeIds: ids } }, tx);
  }, { timeout: 60_000 });

  const today = todayIn(await getSetting('org.timezone'));
  const end = v.to < today ? v.to : today;
  if (v.from <= end) await rebuildActive(ids, v.from, end);
  return { employees: ids.length, days: days.length, replaced: old.length };
}

// ---------------------------------------------------------------------------
// Hari libur
// ---------------------------------------------------------------------------

export const holidayInput = z.object({ date, name: z.string().trim().min(2, 'Nama wajib diisi').max(120), unitId: z.string().uuid().nullable().optional().or(z.literal('')).transform((v) => v || null), kind: z.enum(['NASIONAL', 'CUTI_BERSAMA', 'INSTANSI']).default('INSTANSI') });

export async function listHolidays(year: number) {
  return prisma.holiday.findMany({ where: { date: { gte: toDbDate(`${year}-01-01`), lte: toDbDate(`${year}-12-31`) } }, include: { unit: { select: { name: true } } }, orderBy: { date: 'asc' } });
}

export async function createHoliday(actor: Actor, raw: unknown, db: Db = prisma) {
  assertCan(actor, 'schedule.manage');
  const v = holidayInput.parse(raw);
  const s = scopeOf(actor, 'schedule.manage')!;
  if (!v.unitId && !s.all) throw forbidden('Hari libur untuk semua unit hanya bisa dibuat pengguna dengan cakupan seluruh unit.');
  if (v.unitId && !unitInScope(actor, 'schedule.manage', v.unitId)) throw forbidden('Unit di luar kewenangan Anda.');
  const dup = await db.holiday.findFirst({ where: { date: toDbDate(v.date), unitId: v.unitId ?? null } });
  if (dup) throw conflict('Tanggal tersebut sudah tercatat sebagai hari libur.', { date: 'Sudah ada' });
  const h = await db.holiday.create({ data: { date: toDbDate(v.date), name: v.name, unitId: v.unitId ?? null, kind: v.kind, source: 'MANUAL' } });
  await audit(actor, { action: 'holiday.create', entityType: 'Holiday', entityId: h.id, after: v }, db);
  if (db === prisma) await rebuildActive(null, v.date, v.date);
  return h;
}

export async function deleteHoliday(actor: Actor, id: string) {
  assertCan(actor, 'schedule.manage');
  const h = await prisma.holiday.findUnique({ where: { id } });
  if (!h) throw notFound('Hari libur tidak ditemukan.');
  if (h.unitId ? !unitInScope(actor, 'schedule.manage', h.unitId) : !scopeOf(actor, 'schedule.manage')!.all) throw forbidden();
  await prisma.holiday.delete({ where: { id } });
  await audit(actor, { action: 'holiday.delete', entityType: 'Holiday', entityId: id, before: { date: fromDbDate(h.date), name: h.name } });
  await rebuildActive(null, fromDbDate(h.date), fromDbDate(h.date));
}

