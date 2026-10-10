import { Paperclip } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { MonthStepper } from '@/components/app/month-stepper';
import { ReportStatusBadge } from '@/components/app/report-status';
import { requirePage } from '@/lib/guard';
import { myMonth, monthText } from '@/lib/services/performance';
import { todayIn, fmtTanggal } from '@/lib/time';
import { getSetting } from '@/lib/settings';
import { DayReportButton, SubmitMonth } from './forms';

export const metadata = { title: 'Laporan Kinerja' };

export default async function MyReportsPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const actor = await requirePage(['report.self']);
  if (!actor.employeeId) return <PageBody><EmptyState title="Akun tidak terhubung dengan data pegawai" description="Laporan kinerja hanya untuk akun pegawai." /></PageBody>;
  const sp = await searchParams;
  const today = todayIn(await getSetting('org.timezone'));
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.bulan ?? '') && sp.bulan! <= today.slice(0, 7) ? sp.bulan! : today.slice(0, 7);
  const d = await myMonth(actor, month);
  const status = d.header?.status ?? 'DRAFT';
  return (
    <>
      <PageHeader
        title="Laporan Kinerja"
        description={`Uraikan pekerjaan Anda setiap hari, lalu kirim ke atasan langsung di akhir bulan. ${monthText(month)}.`}
        actions={<MonthStepper value={month} href="?bulan=__bulan__" max={today.slice(0, 7)} />}
      />
      <PageBody className="grid max-w-4xl gap-5">
        <Card className="flex-row flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="grid gap-1">
            <div className="flex items-center gap-2"><h2 className="font-semibold">Laporan {monthText(month)}</h2><ReportStatusBadge status={status} /></div>
            <p className="text-sm text-muted-foreground tabular-nums">{d.filled} hari terisi{d.header?.score ? `, nilai atasan ${d.header.score}` : ''}</p>
          </div>
          {d.editable && <SubmitMonth month={month} filled={d.filled} summary={d.header?.summary ?? ''} />}
        </Card>

        {status === 'RETURNED' && d.header?.reviewNote && (
          <Alert variant="warning"><AlertTitle>Dikembalikan atasan untuk diperbaiki</AlertTitle><AlertDescription>{d.header.reviewNote}</AlertDescription></Alert>
        )}
        {status === 'APPROVED' && (
          <Alert variant="success"><AlertTitle>Sudah dinilai atasan: {d.header?.score}</AlertTitle>{d.header?.reviewNote && <AlertDescription>{d.header.reviewNote}</AlertDescription>}</Alert>
        )}
        {status === 'SUBMITTED' && <Alert><AlertTitle>Menunggu penilaian atasan langsung</AlertTitle><AlertDescription>Laporan terkunci selama dinilai. Anda akan mendapat notifikasi saat selesai.</AlertDescription></Alert>}

        <Card className="gap-0 overflow-hidden py-0">
          {d.days.length === 0 ? <EmptyState title="Bulan ini belum berjalan" description="Laporan harian bisa diisi mulai tanggal 1." /> : (
            <ul className="divide-y">
              {d.days.map((day) => (
                <li key={day.date} className={day.isOff ? 'bg-off px-4 py-3 text-off-foreground sm:px-6' : 'px-4 py-3 sm:px-6'}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{fmtTanggal(day.date)}{day.isOff && <span className="ml-2 font-normal">Libur</span>}</p>
                      {day.report ? (
                        <>
                          <p className="mt-1 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{day.report.content}</p>
                          {day.report.attachments.length > 0 && (
                            <ul className="mt-2 flex flex-wrap gap-2">
                              {day.report.attachments.map((a) => (
                                <li key={a.id}><a className="inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2 text-xs text-primary hover:bg-secondary" href={`/api/v1/reports/attachments/${a.id}`} target="_blank" rel="noreferrer"><Paperclip className="size-3.5" />{a.fileName}</a></li>
                              ))}
                            </ul>
                          )}
                        </>
                      ) : <p className="mt-1 text-sm text-muted-foreground">{day.isOff ? 'Tidak ada laporan.' : 'Belum diisi.'}</p>}
                    </div>
                    {d.editable && <DayReportButton date={day.date} report={day.report} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
