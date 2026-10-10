import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { Segmented } from '@/components/app/segmented';
import { Pager } from '@/components/app/pagination';
import { ReportStatusBadge } from '@/components/app/report-status';
import { requirePage } from '@/lib/guard';
import { monthText, reviewQueue } from '@/lib/services/performance';
import { qs } from '@/lib/list';
import { getSetting } from '@/lib/settings';
import { fmtWaktu } from '@/lib/time';

export const metadata = { title: 'Penilaian Laporan' };

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage(['report.review', 'report.manage']);
  const sp = await searchParams;
  const [data, tz] = await Promise.all([reviewQueue(actor, { status: sp.status, month: sp.bulan, page: sp.page, per: sp.per }), getSetting('org.timezone')]);
  const params = { status: sp.status, bulan: sp.bulan, per: sp.per };
  return (
    <>
      <PageHeader title="Penilaian Laporan" description="Laporan kinerja bulanan bawahan langsung Anda. Nilai laporan atau kembalikan untuk diperbaiki." />
      <PageBody className="grid gap-4">
        <Segmented label="Filter status" current={data.status} items={[['SUBMITTED', 'Menunggu'], ['APPROVED', 'Sudah dinilai'], ['RETURNED', 'Dikembalikan'], ['ALL', 'Semua']].map(([k, l]) => ({ key: k, label: l, href: qs({ ...params, status: k, page: undefined }) }))} className="w-fit" />
        <div className="rounded-xl border bg-card">
          {data.rows.length === 0 ? <EmptyState title={data.status === 'SUBMITTED' ? 'Tidak ada laporan yang menunggu' : 'Tidak ada laporan'} description="Laporan muncul di sini setelah bawahan Anda mengirimnya." /> : (
            <Table className="table-stack">
              <TableHeader><TableRow><TableHead className="pl-4 lg:pl-6">Pegawai</TableHead><TableHead>Bulan</TableHead><TableHead>Hari terisi</TableHead><TableHead>Dikirim</TableHead><TableHead>Status</TableHead><TableHead className="pr-4 text-right lg:pr-6">Nilai</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="stack-head pl-4 lg:pl-6"><Link href={`/kinerja/tinjau/${r.id}`} className="font-medium text-primary hover:underline">{r.employee.fullName}</Link><span className="block text-xs text-muted-foreground">{r.employee.unit?.name ?? '-'}</span></TableCell>
                    <TableCell data-label="Bulan">{monthText(r.month)}</TableCell>
                    <TableCell data-label="Hari terisi" className="tabular">{r.filled}</TableCell>
                    <TableCell data-label="Dikirim" className="tabular text-muted-foreground">{r.submittedAt ? fmtWaktu(r.submittedAt, tz) : '-'}</TableCell>
                    <TableCell data-label="Status"><ReportStatusBadge status={r.status} /></TableCell>
                    <TableCell data-label="Nilai" className="pr-4 tabular md:text-right lg:pr-6">{r.score ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pager total={data.total} page={data.page} pageSize={data.pageSize} params={params} />
        </div>
      </PageBody>
    </>
  );
}
