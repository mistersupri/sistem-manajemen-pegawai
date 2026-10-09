import { Paperclip } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { ReportStatusBadge } from '@/components/app/report-status';
import { requirePage } from '@/lib/guard';
import { getReport, monthText } from '@/lib/services/performance';
import { fmtTanggal } from '@/lib/time';
import { ReviewForm } from './review-form';

export const metadata = { title: 'Laporan Kinerja' };

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage(['report.self', 'report.review', 'report.manage']);
  const { id } = await params;
  const r = await getReport(actor, id);
  const own = r.employeeId === actor.employeeId;
  return (
    <>
      <PageHeader
        title={`Laporan ${monthText(r.month)}`}
        description={`${r.employee.fullName}${r.employee.position ? `, ${r.employee.position}` : ''}${r.employee.unit ? `, ${r.employee.unit.name}` : ''}`}
        crumbs={own ? [{ href: '/kinerja/laporan', label: 'Laporan Kinerja' }, { label: 'Rincian' }] : [{ href: '/kinerja/tinjau', label: 'Penilaian Laporan' }, { label: r.employee.fullName }]}
        actions={<ReportStatusBadge status={r.status} />}
      />
      <PageBody className="grid max-w-4xl gap-5">
        {r.summary && <Card className="gap-1 p-4 sm:p-5"><h2 className="text-sm font-semibold">Ringkasan dari pegawai</h2><p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{r.summary}</p></Card>}
        {r.status === 'APPROVED' && <Alert variant="success"><AlertTitle>Nilai {r.score}{r.reviewerName ? `, oleh ${r.reviewerName}` : ''}</AlertTitle>{r.reviewNote && <AlertDescription>{r.reviewNote}</AlertDescription>}</Alert>}
        {r.status === 'RETURNED' && <Alert variant="warning"><AlertTitle>Dikembalikan untuk diperbaiki</AlertTitle>{r.reviewNote && <AlertDescription>{r.reviewNote}</AlertDescription>}</Alert>}
        {r.canReview && <ReviewForm id={r.id} />}
        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-b px-4 py-3 sm:px-6"><h2 className="font-semibold">Laporan harian ({r.days.length} hari)</h2></div>
          <ul className="divide-y">
            {r.days.map((d) => (
              <li key={d.id} className="px-4 py-3 sm:px-6">
                <p className="text-sm font-semibold">{fmtTanggal(d.date)}</p>
                <p className="mt-1 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{d.content}</p>
                {d.attachments.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {d.attachments.map((a) => <li key={a.id}><a className="inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2 text-xs text-primary hover:bg-secondary" href={`/api/v1/reports/attachments/${a.id}`} target="_blank" rel="noreferrer"><Paperclip className="size-3.5" />{a.fileName}</a></li>)}
                  </ul>
                )}
              </li>
            ))}
            {r.days.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground sm:px-6">Tidak ada laporan harian.</li>}
          </ul>
        </Card>
      </PageBody>
    </>
  );
}
