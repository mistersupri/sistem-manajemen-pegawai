import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';

export default async function PerformanceIndex() {
  const actor = await requirePage();
  redirect(
    can(actor, 'report.self') && actor.employeeId ? '/kinerja/laporan'
    : can(actor, 'report.review') || can(actor, 'report.manage') ? '/kinerja/tinjau'
    : can(actor, 'assess.self') && actor.employeeId ? '/kinerja/penilaian'
    : '/kinerja/periode',
  );
}
