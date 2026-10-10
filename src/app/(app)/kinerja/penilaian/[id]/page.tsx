import { PageBody, PageHeader } from '@/components/app/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { requirePage } from '@/lib/guard';
import { getAssignment } from '@/lib/services/assessment';
import { monthText } from '@/lib/services/performance';
import { AssessForm } from './assess-form';

export const metadata = { title: 'Nilai Pegawai' };

export default async function AssessPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage(['assess.self']);
  const { id } = await params;
  const a = await getAssignment(actor, id);
  const boss = a.role === 'ATASAN';
  return (
    <>
      <PageHeader
        title={`Nilai ${a.target.fullName}`}
        description={`${[a.target.position, a.target.unit?.name].filter(Boolean).join(', ') || 'Pegawai'}. Periode ${monthText(a.period.month)}.`}
        crumbs={[{ href: '/kinerja/penilaian', label: 'Penilaian Kinerja' }, { label: a.target.fullName }]}
      />
      <PageBody className="grid max-w-4xl gap-4">
        {a.period.isClosed
          ? <Alert variant="warning"><AlertTitle>Periode sudah ditutup</AlertTitle><AlertDescription>Penilaian tidak bisa diubah lagi.</AlertDescription></Alert>
          : <Alert><AlertTitle>{boss ? 'Anda menilai sebagai atasan langsung' : 'Anda menilai sebagai rekan'}</AlertTitle><AlertDescription>Isi nilai 1 sampai 100 pada setiap indikator. Nilai 75 ke atas Baik, di bawah 75 Buruk. {boss ? '' : 'Identitas Anda tidak ditampilkan kepada pegawai yang dinilai.'}</AlertDescription></Alert>}
        <AssessForm id={a.id} boss={boss} closed={a.period.isClosed} initial={a.status === 'SUBMITTED' ? { scores: (a.scores ?? {}) as Record<string, number>, competence: a.competence, followUp: a.followUp, note: a.note } : null} />
      </PageBody>
    </>
  );
}
