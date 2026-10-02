import { PageBody, PageHeader } from '@/components/app/page-header';
import { requirePage } from '@/lib/guard';
import { employeeScopeWhere } from '@/lib/auth/actor';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { listSchedules } from '@/lib/services/schedules';
import { unitOptions } from '@/lib/services/units';
import { loadPlanContext } from '@/lib/attendance/plan';
import { todayIn } from '@/lib/time';
import { BulkAssign } from './bulk-assign';

export const metadata = { title: 'Atur jadwal banyak pegawai' };

export default async function BulkSchedulePage() {
  const actor = await requirePage(['schedule.manage']);
  const today = todayIn(await getSetting('org.timezone'));
  const [employees, units, schedules] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true, deletedAt: null, ...employeeScopeWhere(actor, 'schedule.manage') },
      select: { id: true, fullName: true, employeeNumber: true, position: true, unitId: true, unit: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    }),
    unitOptions(actor, 'schedule.manage'),
    listSchedules(),
  ]);
  const ctx = await loadPlanContext(employees.map((e) => e.id), today, today);
  return (
    <>
      <PageHeader
        title="Atur jadwal banyak pegawai"
        description="Pilih pegawai, lalu terapkan satu jadwal sekaligus. Rekap yang terdampak dihitung ulang otomatis."
        crumbs={[{ href: '/jadwal?tab=penugasan', label: 'Jadwal Kerja' }, { label: 'Atur sekaligus' }]}
      />
      <PageBody>
        <BulkAssign
          today={today}
          units={units}
          schedules={schedules.map((s) => ({ id: s.id, name: s.name, code: s.code, checkIn: s.checkIn, checkOut: s.checkOut, color: s.color }))}
          employees={employees.map((e) => {
            const p = ctx.planFor(e.id, today);
            return { id: e.id, name: e.fullName, nip: e.employeeNumber, position: e.position, unitId: e.unitId, unit: e.unit?.name ?? null, current: p.schedule ? p.schedule.code : null, currentSource: p.source };
          })}
        />
      </PageBody>
    </>
  );
}
