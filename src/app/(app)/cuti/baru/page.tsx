import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { balancesFor, listLeaveTypes } from '@/lib/services/leave';
import { addDays, todayIn } from '@/lib/time';
import { LeaveForm } from './form';

export const metadata = { title: 'Ajukan cuti/izin' };

export default async function NewLeave() {
  const actor = await requirePage(['leave.request']);
  const s = await getSettings();
  if (!actor.employeeId) return <PageBody><EmptyState title="Akun tidak terhubung dengan data pegawai" description="Pengajuan cuti dan izin hanya untuk akun pegawai." actions={[{ href: '/cuti', label: 'Kembali ke Cuti & Izin' }]} /></PageBody>;
  if (!s['modules.leave']) return <PageBody><EmptyState title="Modul cuti dan izin dinonaktifkan" description="Admin menonaktifkan pengajuan cuti dan izin di Pengaturan. Riwayat pengajuan tetap bisa dilihat." actions={[{ href: '/cuti', label: 'Lihat riwayat pengajuan' }]} /></PageBody>;
  const today = todayIn(s['org.timezone']);
  const year = Number(today.slice(0, 4));
  const [emp, types, balances] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { id: actor.employeeId }, select: { employmentStatus: true, supervisor: { select: { fullName: true } } } }),
    listLeaveTypes(),
    balancesFor(actor.employeeId, year),
  ]);
  const eligible = types.filter((t) => !t.eligibleEmploymentStatuses.length || t.eligibleEmploymentStatuses.includes(emp.employmentStatus ?? ''));
  return (
    <>
      <PageHeader title="Ajukan cuti/izin" description={emp.supervisor ? `Persetujuan pertama oleh atasan langsung: ${emp.supervisor.fullName}.` : 'Atasan langsung belum diatur; pengajuan diteruskan ke pejabat penyetuju unit Anda.'} crumbs={[{ href: '/cuti', label: 'Cuti & Izin' }, { label: 'Ajukan' }]} />
      <PageBody className="max-w-2xl">
        {eligible.length === 0 ? <EmptyState title="Belum ada jenis cuti/izin yang berlaku untuk Anda" description="Hubungi admin kepegawaian." /> : (
          <LeaveForm
            types={eligible.map((t) => {
              const b = balances.find((x) => x.leaveType.id === t.id);
              return {
                id: t.id, name: t.name, usesBalance: t.usesBalance, allowAttachment: t.allowAttachment, approvalLevels: t.approvalLevels, countWorkdaysOnly: t.countWorkdaysOnly,
                maxDaysPerRequest: t.maxDaysPerRequest, minDate: t.minNoticeDays ? addDays(today, t.minNoticeDays) : null, minNoticeDays: t.minNoticeDays,
                remaining: b?.configured ? b.remaining : null,
              };
            })}
          />
        )}
      </PageBody>
    </>
  );
}
