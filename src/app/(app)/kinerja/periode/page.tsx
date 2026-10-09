import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { StatusBadge } from '@/components/app/status-badge';
import { requirePage } from '@/lib/guard';
import { listPeriods } from '@/lib/services/assessment';
import { monthText } from '@/lib/services/performance';
import { todayIn } from '@/lib/time';
import { getSetting } from '@/lib/settings';
import { OpenPeriod } from './forms';

export const metadata = { title: 'Kelola Penilaian' };

export default async function PeriodsPage() {
  const actor = await requirePage(['assess.manage']);
  const [periods, tz] = await Promise.all([listPeriods(actor), getSetting('org.timezone')]);
  return (
    <>
      <PageHeader title="Kelola Penilaian Kinerja" description="Buka periode bulanan: sistem membagi atasan langsung dan rekan acak sebagai penilai setiap pegawai." actions={<OpenPeriod defaultMonth={todayIn(tz).slice(0, 7)} />} />
      <PageBody className="grid gap-4">
        <div className="rounded-xl border bg-card">
          {periods.length === 0 ? <EmptyState title="Belum ada periode" description="Buka periode pertama untuk mulai membagi penilai." /> : (
            <Table className="table-stack">
              <TableHeader><TableRow><TableHead className="pl-4 lg:pl-6">Periode</TableHead><TableHead>Rekan per pegawai</TableHead><TableHead>Penilaian selesai</TableHead><TableHead className="pr-4 lg:pr-6">Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="stack-head pl-4 lg:pl-6"><Link href={`/kinerja/periode/${p.id}`} className="font-medium text-primary hover:underline">{monthText(p.month)}</Link></TableCell>
                    <TableCell data-label="Rekan per pegawai" className="tabular">{p.peerCount}</TableCell>
                    <TableCell data-label="Selesai" className="tabular">{p.done} dari {p.total}{p.total ? ` (${Math.round((p.done / p.total) * 100)}%)` : ''}</TableCell>
                    <TableCell data-label="Status" className="pr-4 lg:pr-6"><StatusBadge status={p.isClosed ? 'CANCELLED' : 'APPROVED'} label={p.isClosed ? 'Ditutup' : 'Dibuka'} /></TableCell>
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
