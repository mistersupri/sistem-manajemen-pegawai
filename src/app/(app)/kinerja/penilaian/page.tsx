import Link from 'next/link';
import { ClipboardCheck, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { StatusBadge } from '@/components/app/status-badge';
import { requirePage } from '@/lib/guard';
import { myAssignments, myResultPeriods } from '@/lib/services/assessment';
import { monthText } from '@/lib/services/performance';
import { FOLLOW_UP, COMPETENCE } from '@/lib/assessment/indicators';

export const metadata = { title: 'Penilaian Kinerja' };

export default async function MyAssessmentsPage() {
  const actor = await requirePage(['assess.self']);
  if (!actor.employeeId) return <PageBody><EmptyState title="Akun tidak terhubung dengan data pegawai" description="Penilaian kinerja hanya untuk akun pegawai." /></PageBody>;
  const [tasks, results] = await Promise.all([myAssignments(actor), myResultPeriods(actor)]);
  void FOLLOW_UP; void COMPETENCE;
  const pending = tasks.filter((t) => t.status === 'PENDING');
  return (
    <>
      <PageHeader title="Penilaian Kinerja" description="Nilai atasan atau rekan yang ditugaskan kepada Anda. Rekan penilai dipilih acak oleh sistem dan identitas penilai tidak ditampilkan kepada yang dinilai." />
      <PageBody className="grid max-w-4xl gap-5">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6"><h2 className="font-semibold">Tugas menilai</h2><span className="text-sm text-muted-foreground tabular-nums">{pending.length} belum selesai</span></div>
          {tasks.length === 0 ? <EmptyState title="Tidak ada tugas menilai" description="Tugas muncul saat pengelola membuka periode penilaian." /> : (
            <ul className="divide-y">
              {tasks.map((t) => (
                <li key={t.id}>
                  <Link href={`/kinerja/penilaian/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 hover:bg-secondary/60 sm:px-6">
                    <span className="min-w-0">
                      <span className="block font-medium">{t.target.fullName}</span>
                      <span className="block text-sm text-muted-foreground">{[t.target.position, t.target.unit?.name].filter(Boolean).join(', ') || '-'}</span>
                    </span>
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{monthText(t.month)}</span>
                      <span className="text-muted-foreground">{t.role === 'ATASAN' ? 'Sebagai atasan' : 'Sebagai rekan'}</span>
                      {t.status === 'SUBMITTED' ? <StatusBadge status="APPROVED" label={`Selesai${t.average != null ? `, ${t.average}` : ''}`} /> : <StatusBadge status="PENDING" label="Belum dinilai" />}
                      <ClipboardCheck className="size-4 text-primary" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-b px-4 py-3 sm:px-6"><h2 className="font-semibold">Hasil penilaian saya</h2></div>
          {results.length === 0 ? <EmptyState title="Belum ada hasil" description="Hasil tampil setelah periode penilaian ditutup." /> : (
            <ul className="divide-y">
              {results.map((p) => (
                <li key={p.id}><Link href={`/kinerja/lembar/${p.id}/${actor.employeeId}`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 hover:bg-secondary/60 sm:px-6"><span className="font-medium">{monthText(p.month)}</span><span className="inline-flex items-center gap-1.5 text-sm text-primary"><FileText className="size-4" />Lihat lembar penilaian</span></Link></li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
