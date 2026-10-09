import Link from 'next/link';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { requirePage } from '@/lib/guard';
import { periodResults } from '@/lib/services/assessment';
import { monthText } from '@/lib/services/performance';
import { COMPETENCE, FOLLOW_UP } from '@/lib/assessment/indicators';
import { PeriodActions } from '../forms';

export const metadata = { title: 'Hasil Penilaian' };

export default async function PeriodResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage(['assess.manage']);
  const { id } = await params;
  const { period, results } = await periodResults(actor, id);
  return (
    <>
      <PageHeader
        title={`Hasil penilaian ${monthText(period.month)}`}
        description={`${results.length} pegawai. Nilai akhir adalah rata-rata nilai atasan dan rata-rata rekan; kesimpulan diambil dari atasan langsung.`}
        crumbs={[{ href: '/kinerja/periode', label: 'Kelola Penilaian' }, { label: monthText(period.month) }]}
        actions={<><Button asChild variant="outline"><a href={`/api/v1/assessments/periods/${id}/export`}><Download />Unduh Excel</a></Button><PeriodActions id={id} closed={period.isClosed} /></>}
      />
      <PageBody>
        <div className="rounded-xl border bg-card">
          {results.length === 0 ? <EmptyState title="Belum ada penugasan" description="Gunakan Lengkapi penilai bila ada pegawai baru." /> : (
            <Table className="table-stack">
              <TableHeader><TableRow><TableHead className="pl-4 lg:pl-6">Pegawai</TableHead><TableHead>Penilai selesai</TableHead><TableHead className="text-right">Atasan</TableHead><TableHead className="text-right">Rekan</TableHead><TableHead className="text-right">Akhir</TableHead><TableHead>Predikat</TableHead><TableHead>Kesimpulan atasan</TableHead><TableHead className="pr-4 lg:pr-6"><span className="sr-only">Lembar</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.employee.id}>
                    <TableCell className="stack-head pl-4 lg:pl-6"><span className="font-medium">{r.employee.fullName}</span><span className="block text-xs text-muted-foreground">{r.employee.unit?.name ?? '-'}{!r.hasBoss && ' • tanpa atasan langsung'}</span></TableCell>
                    <TableCell data-label="Selesai" className="tabular">{r.submitted}/{r.assigned}</TableCell>
                    <TableCell data-label="Atasan" className="tabular md:text-right">{r.bossAverage ?? '-'}</TableCell>
                    <TableCell data-label="Rekan" className="tabular md:text-right">{r.peerAverage ?? '-'}{r.peerCount ? <span className="text-xs text-muted-foreground"> ({r.peerCount})</span> : null}</TableCell>
                    <TableCell data-label="Akhir" className="tabular font-semibold md:text-right">{r.average ?? '-'}</TableCell>
                    <TableCell data-label="Predikat">{r.predicate ? <Badge variant={r.predicate === 'Baik' ? 'hadir' : 'alpa'}>{r.predicate}</Badge> : '-'}</TableCell>
                    <TableCell data-label="Kesimpulan" className="whitespace-normal text-sm">{r.competence ? `${COMPETENCE[r.competence as keyof typeof COMPETENCE]}, ${FOLLOW_UP[r.followUp as keyof typeof FOLLOW_UP] ?? ''}` : '-'}</TableCell>
                    <TableCell className="pr-4 text-right lg:pr-6">{r.average != null && <Button asChild variant="ghost" size="sm"><Link href={`/kinerja/lembar/${period.id}/${r.employee.id}`}><FileText />Lembar</Link></Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </PageBody>
    </>
  );
}
