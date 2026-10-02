import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { requirePage } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { addDays, isValidDate, todayIn } from '@/lib/time';
import { CorrectionForm } from './form';

export const metadata = { title: 'Ajukan koreksi' };

export default async function NewCorrection({ searchParams }: { searchParams: Promise<{ tanggal?: string }> }) {
  const actor = await requirePage(['correction.request']);
  if (!actor.employeeId) return <PageBody><EmptyState title="Akun tidak terhubung dengan data pegawai" /></PageBody>;
  const s = await getSettings();
  const today = todayIn(s['org.timezone']);
  const t = (await searchParams).tanggal;
  return (
    <>
      <PageHeader title="Ajukan koreksi absensi" description={`Untuk tanggal ${s['rules.backdateDays']} hari terakhir. Atasan atau petugas kepegawaian akan meninjau.`} crumbs={[{ href: '/absensi/koreksi', label: 'Koreksi Absensi' }, { label: 'Ajukan' }]} />
      <PageBody className="max-w-2xl"><CorrectionForm defaultDate={isValidDate(t) ? t : ''} min={addDays(today, -Number(s['rules.backdateDays']))} max={today} /></PageBody>
    </>
  );
}
