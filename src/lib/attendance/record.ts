// Menyusun ulang rekap harian (AttendanceRecord) dari transaksi sumber. Transaksi mentah tidak
// pernah diubah; rekap selalu bisa dihitung ulang dan ditelusuri ke sumbernya.
import { prisma, type Db } from '../db';
import { addDays, dateRange, fromDbDate, toDbDate, zonedToUtc } from '../time';
import { getSettings } from '../settings';
import { buildRecord, isOvernight, type ApprovedCorrection, type DayPlan, type SourceEvent } from './engine';
import { loadPlanContext, type PlanContext } from './plan';
import { notifyEmployee } from '../services/notifications';

/** HH:MM usulan koreksi menjadi instan; jam pulang shift malam jatuh di hari berikutnya. */
export function correctionInstant(plan: DayPlan, hhmm: string | null, isOut: boolean, tz: string) {
  if (!hhmm) return null;
  let day = plan.date;
  if (isOut && plan.schedule && isOvernight(plan.schedule) && hhmm <= plan.schedule.checkOut) day = addDays(plan.date, 1);
  return zonedToUtc(day, hhmm, tz);
}

async function rebuildOne(employeeId: string, date: string, ctx: PlanContext, tz: string, db: Db) {
  const plan = ctx.planFor(employeeId, date);
  const wd = toDbDate(date);
  const [events, raws, corr, leave] = await Promise.all([
    db.attendanceEvent.findMany({
      where: { employeeId, workDate: wd, verification: { outcome: 'SUCCESS' } },
      select: { id: true, occurredAt: true, direction: true, method: true },
    }),
    db.deviceRawEvent.findMany({ where: { employeeId, workDate: wd }, select: { id: true, deviceTime: true } }),
    db.attendanceCorrection.findFirst({
      where: { employeeId, workDate: wd, status: 'APPROVED' },
      orderBy: { reviewedAt: 'desc' },
    }),
    db.leaveRequest.findFirst({
      where: { employeeId, status: 'APPROVED', startDate: { lte: wd }, endDate: { gte: wd } },
      include: { leaveType: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const sources: SourceEvent[] = [
    ...events.map((e) => ({ id: e.id, at: e.occurredAt, direction: e.direction, method: e.method })),
    ...raws.map((r) => ({ id: r.id, at: r.deviceTime, direction: null, method: 'DEVICE' })),
  ];
  const correction: ApprovedCorrection | null = corr && {
    id: corr.id,
    checkIn: correctionInstant(plan, corr.proposedCheckIn, false, tz),
    checkOut: correctionInstant(plan, corr.proposedCheckOut, true, tz),
    status: corr.proposedStatus,
    dispensation: corr.dispensation,
  };
  // Cuti/izin hanya menandai hari yang dijadwalkan bekerja (atau pegawai tanpa jadwal).
  const leaveApplies = leave && !plan.isOffDay;
  const built = buildRecord({
    plan, tz, events: sources, correction,
    leave: leaveApplies ? { id: leave.id, status: leave.leaveType.attendanceStatus } : null,
    fieldDuty: events.some((e) => e.method === 'FIELD_DUTY'),
  });

  const existing = await db.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate: wd } } });
  if (!built) {
    if (existing) await db.attendanceRecord.delete({ where: { id: existing.id } });
    return null;
  }
  const data = {
    scheduleId: plan.schedule?.id ?? null,
    scheduleRevisionId: plan.schedule?.revisionId ?? null,
    isOffDay: plan.isOffDay,
    checkInAt: built.checkInAt,
    checkOutAt: built.checkOutAt,
    checkInMethod: built.checkInMethod,
    checkOutMethod: built.checkOutMethod,
    checkInSourceId: built.checkInSourceId,
    checkOutSourceId: built.checkOutSourceId,
    status: built.status,
    statusLocked: built.statusLocked,
    lateMinutes: built.lateMinutes,
    earlyLeaveMinutes: built.earlyLeaveMinutes,
    dispensation: built.dispensation,
    needsReview: built.needsReview,
    reviewReason: built.reviewReason,
    leaveRequestId: built.leaveRequestId,
    note: built.notes.join('; ') || null,
  };
  const saved = existing
    ? await db.attendanceRecord.update({ where: { id: existing.id }, data })
    : await db.attendanceRecord.create({ data: { employeeId, workDate: wd, ...data } });
  await announceNewScans(employeeId, date, existing, saved, tz, db);
  return saved;
}

// Pemberitahuan "absen tercatat" hanya untuk scan baru yang baru saja terjadi, bukan hasil hitung ulang data lama.
const FRESH_MS = 3 * 3600_000;
async function announceNewScans(
  employeeId: string, date: string,
  before: { checkInAt: Date | null; checkOutAt: Date | null } | null,
  after: { checkInAt: Date | null; checkOutAt: Date | null },
  tz: string, db: Db,
) {
  const now = Date.now();
  const fresh = (d: Date | null) => !!d && now - d.getTime() < FRESH_MS && d.getTime() <= now + 5 * 60_000;
  const items: { kind: 'masuk' | 'pulang'; at: Date }[] = [];
  if (after.checkInAt && !before?.checkInAt && fresh(after.checkInAt)) items.push({ kind: 'masuk', at: after.checkInAt });
  if (after.checkOutAt && !before?.checkOutAt && fresh(after.checkOutAt)) items.push({ kind: 'pulang', at: after.checkOutAt });
  for (const it of items) {
    await notifyEmployee(employeeId, {
      type: 'attendance', title: it.kind === 'masuk' ? 'Absen masuk tercatat' : 'Absen pulang tercatat',
      body: `Pukul ${new Intl.DateTimeFormat('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(it.at).replace('.', ':')}`,
      link: `/absensi/rekap/${employeeId}/${date}`, dedupeKey: `scan-${it.kind}:${date}:${employeeId}`,
    }, db).catch(() => undefined);
  }
}

/** Susun ulang rekap satu pegawai pada satu tanggal kerja. */
export async function rebuildRecord(employeeId: string, date: string, db: Db = prisma) {
  const tz = (await getSettings(db))['org.timezone'];
  const ctx = await loadPlanContext([employeeId], date, date, db);
  return rebuildOne(employeeId, date, ctx, tz, db);
}

/** Susun ulang rekap untuk banyak pegawai dan rentang tanggal (mis. setelah aturan jadwal berubah). */
export async function rebuildRange(employeeIds: string[], from: string, to: string, db: Db = prisma) {
  const tz = (await getSettings(db))['org.timezone'];
  const ctx = await loadPlanContext(employeeIds, from, to, db);
  let changed = 0;
  for (const id of employeeIds) {
    for (const d of dateRange(from, to)) {
      await rebuildOne(id, d, ctx, tz, db);
      changed++;
    }
  }
  return { evaluated: changed };
}

/** Tanggal kerja yang memiliki transaksi untuk pegawai pada rentang tertentu. */
export async function datesWithActivity(employeeId: string, from: string, to: string, db: Db = prisma) {
  const range = { gte: toDbDate(from), lte: toDbDate(to) };
  const [a, b, c] = await Promise.all([
    db.attendanceEvent.findMany({ where: { employeeId, workDate: range }, select: { workDate: true }, distinct: ['workDate'] }),
    db.deviceRawEvent.findMany({ where: { employeeId, workDate: range }, select: { workDate: true }, distinct: ['workDate'] }),
    db.attendanceRecord.findMany({ where: { employeeId, workDate: range }, select: { workDate: true } }),
  ]);
  return [...new Set([...a, ...b, ...c].map((x) => x.workDate && fromDbDate(x.workDate)).filter(Boolean) as string[])].sort();
}
