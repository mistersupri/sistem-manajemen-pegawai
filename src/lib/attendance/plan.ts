// Penentuan jadwal kerja pegawai per tanggal dari penugasan (pegawai/unit) dan hari libur.
// Prioritas: penugasan SEMENTARA pegawai > SEMENTARA unit > TETAP pegawai > TETAP unit (unit terdekat dulu).
// Penugasan TETAP hanya berlaku di hari kerja jadwal dan bukan hari libur; SEMENTARA berlaku apa adanya.
import { prisma, type Db } from '../db';
import { dateRange, fromDbDate, toDbDate, weekdayOf } from '../time';
import type { DayPlan, ScheduleRules } from './engine';

type AssignmentRow = {
  employeeId: string | null;
  unitId: string | null;
  kind: string;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
  schedule: (ScheduleRules & { isActive: boolean; deletedAt: Date | null }) | null;
};

export interface PlanContext {
  planFor(employeeId: string, date: string): DayPlan;
}

export async function loadPlanContext(employeeIds: string[], from: string, to: string, db: Db = prisma): Promise<PlanContext> {
  const employees = await db.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, unitId: true } });
  const units = await db.organizationUnit.findMany({ select: { id: true, parentId: true } });
  const parent = new Map(units.map((u) => [u.id, u.parentId]));
  const chain = (unitId: string | null) => {
    const out: string[] = [];
    for (let u = unitId; u && !out.includes(u); u = parent.get(u) ?? null) out.push(u);
    return out;
  };
  const empUnits = new Map(employees.map((e) => [e.id, chain(e.unitId)]));
  const allUnits = [...new Set([...empUnits.values()].flat())];

  const rows = await db.employeeScheduleAssignment.findMany({
    where: {
      deletedAt: null,
      startDate: { lte: toDbDate(to) },
      OR: [{ endDate: null }, { endDate: { gte: toDbDate(from) } }],
      AND: [{ OR: [{ employeeId: { in: employeeIds } }, { unitId: { in: allUnits } }] }],
    },
    include: { schedule: true },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
  });
  const revisions = await db.workScheduleRevision.findMany({
    where: { scheduleId: { in: [...new Set(rows.map((r) => r.scheduleId).filter(Boolean) as string[])] } },
    select: { id: true, scheduleId: true, version: true },
  });
  const revId = new Map(revisions.map((r) => [`${r.scheduleId}:${r.version}`, r.id]));
  const holidays = await db.holiday.findMany({ where: { disabled: false, date: { gte: toDbDate(from), lte: toDbDate(to) } } });
  const holidayMap = new Map<string, { name: string; unitId: string | null }[]>();
  for (const h of holidays) {
    const d = fromDbDate(h.date);
    holidayMap.set(d, [...(holidayMap.get(d) || []), { name: h.name, unitId: h.unitId }]);
  }

  const byEmployee = new Map<string, AssignmentRow[]>();
  const byUnit = new Map<string, AssignmentRow[]>();
  for (const r of rows as unknown as AssignmentRow[]) {
    if (r.employeeId) byEmployee.set(r.employeeId, [...(byEmployee.get(r.employeeId) || []), r]);
    else if (r.unitId) byUnit.set(r.unitId, [...(byUnit.get(r.unitId) || []), r]);
  }

  const covers = (a: AssignmentRow, date: string) => fromDbDate(a.startDate) <= date && (!a.endDate || fromDbDate(a.endDate) >= date);
  const usable = (a: AssignmentRow) => !a.schedule || (a.schedule.isActive && !a.schedule.deletedAt);
  const rules = (a: AssignmentRow): ScheduleRules | null => a.schedule && {
    ...a.schedule, workdays: a.schedule.workdays, revisionId: revId.get(`${a.schedule.id}:${a.schedule.version}`) ?? null,
  };

  return {
    planFor(employeeId, date) {
      const unitChain = empUnits.get(employeeId) ?? [];
      const find = (kind: string) => {
        const own = (byEmployee.get(employeeId) || []).find((a) => a.kind === kind && covers(a, date) && usable(a));
        if (own) return { a: own, source: kind === 'SEMENTARA' ? 'SEMENTARA' : 'PEGAWAI' } as const;
        for (const u of unitChain) {
          const ua = (byUnit.get(u) || []).find((a) => a.kind === kind && covers(a, date) && usable(a));
          if (ua) return { a: ua, source: kind === 'SEMENTARA' ? 'SEMENTARA' : 'UNIT' } as const;
        }
        return null;
      };
      const temp = find('SEMENTARA');
      if (temp) {
        if (!temp.a.schedule) return { date, schedule: null, isOffDay: true, source: 'SEMENTARA', offReason: 'LIBUR_TERJADWAL' };
        return { date, schedule: rules(temp.a), isOffDay: false, source: 'SEMENTARA' };
      }
      const fixed = find('TETAP');
      if (!fixed || !fixed.a.schedule) return { date, schedule: null, isOffDay: false, source: 'TANPA_JADWAL' };
      const schedule = rules(fixed.a)!;
      const hol = (holidayMap.get(date) || []).find((h) => !h.unitId || unitChain.includes(h.unitId));
      if (hol) return { date, schedule, isOffDay: true, source: fixed.source, offReason: 'HARI_LIBUR', holidayName: hol.name };
      if (!schedule.workdays.includes(weekdayOf(date))) return { date, schedule, isOffDay: true, source: fixed.source, offReason: 'BUKAN_HARI_KERJA' };
      return { date, schedule, isOffDay: false, source: fixed.source };
    },
  };
}

/** Jadwal satu pegawai untuk satu tanggal. */
export async function dayPlan(employeeId: string, date: string, db: Db = prisma) {
  return (await loadPlanContext([employeeId], date, date, db)).planFor(employeeId, date);
}

/** Jadwal satu pegawai untuk rentang tanggal. */
export async function plansFor(employeeId: string, from: string, to: string, db: Db = prisma) {
  const ctx = await loadPlanContext([employeeId], from, to, db);
  return dateRange(from, to).map((d) => ctx.planFor(employeeId, d));
}

/** Hari dijadwalkan bekerja (ada jadwal dan bukan hari libur). */
export const isScheduledWorkday = (p: DayPlan) => !!p.schedule && !p.isOffDay;
