import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmButton } from '@/components/app/confirm-button';
import { requirePage } from '@/lib/guard';
import { getSetting } from '@/lib/settings';
import { getLeave } from '@/lib/services/leave';
import { fmtTanggal, fmtWaktu, fromDbDate } from '@/lib/time';
import { LeaveDecision } from './decision';

export const metadata = { title: 'Rincian cuti/izin' };

const STEP: Record<string, string> = { ATASAN: 'Atasan langsung', ADMIN_KEPEGAWAIAN: 'Admin kepegawaian' };

export default async function LeaveDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage();
  const { id } = await params;
  const [r, tz] = await Promise.all([getLeave(actor, id), getSetting('org.timezone')]);
  const own = r.employeeId === actor.employeeId;
  const start = fromDbDate(r.startDate);
  const end = fromDbDate(r.endDate);
  return (
    <>
      <PageHeader
        title={r.leaveType.name}
        description={own ? undefined : `${r.employee.fullName}${r.employee.unit ? ` · ${r.employee.unit.name}` : ''}`}
        crumbs={[{ href: '/cuti', label: 'Cuti & Izin' }, { label: 'Rincian' }]}
        actions={r.canCancel ? (
          <ConfirmButton label="Batalkan pengajuan" title="Batalkan pengajuan ini?" description={r.status === 'APPROVED' ? 'Status absensi pada tanggal tersebut akan dihitung ulang dari transaksi yang ada.' : 'Pengajuan tidak akan diproses lagi.'}
            confirmLabel="Batalkan" url={`/api/v1/leave/${r.id}/cancel`} reason={{ label: 'Alasan pembatalan', key: 'reason' }} success="Pengajuan dibatalkan." />
        ) : undefined}
      />
      <PageBody className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="grid gap-6">
          <Card>
            <CardHeader><CardTitle>Pengajuan</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={r.status} /></dd>
                <dt className="text-muted-foreground">Tanggal</dt><dd>{start === end ? fmtTanggal(start) : `${fmtTanggal(start)} sampai ${fmtTanggal(end)}`}</dd>
                <dt className="text-muted-foreground">Lama</dt><dd className="tabular">{r.days} hari {r.leaveType.countWorkdaysOnly ? 'kerja' : 'kalender'}</dd>
                <dt className="text-muted-foreground">Alasan</dt><dd className="whitespace-pre-wrap">{r.reason}</dd>
                {r.attachmentPath && <><dt className="text-muted-foreground">Lampiran</dt><dd><a className="text-primary underline" href={`/api/v1/leave/${r.id}/attachment`} target="_blank" rel="noopener">Lihat lampiran</a></dd></>}
                <dt className="text-muted-foreground">Diajukan</dt><dd>{fmtWaktu(r.createdAt, tz)}</dd>
                {r.cancelledAt && <><dt className="text-muted-foreground">Dibatalkan</dt><dd>{fmtWaktu(r.cancelledAt, tz)}{r.cancelReason ? `: ${r.cancelReason}` : ''}</dd></>}
              </dl>
            </CardContent>
          </Card>
          {r.canDecide && <LeaveDecision id={r.id} level={r.currentLevel} last={r.approvals.every((a) => a.level <= r.currentLevel)} />}
        </div>
        <Card>
          <CardHeader><CardTitle>Alur persetujuan</CardTitle></CardHeader>
          <CardContent>
            <ol className="grid gap-4">
              {r.approvals.map((a) => (
                <li key={a.id} className="grid gap-1 border-l-2 pl-4" style={{ borderColor: a.decision === 'APPROVED' ? 'var(--chart-3)' : a.decision === 'REJECTED' ? 'var(--destructive)' : 'var(--border)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">Tahap {a.level}: {STEP[a.approverKind] ?? a.approverKind}</span>
                    <StatusBadge status={a.decision === 'PENDING' && (r.status !== 'PENDING' || a.level > r.currentLevel) ? 'CANCELLED' : a.decision} label={a.decision === 'PENDING' ? (r.status !== 'PENDING' ? 'Tidak diproses' : a.level > r.currentLevel ? 'Belum sampai' : 'Menunggu') : undefined} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {a.decidedAt ? `${a.decidedByName ?? 'Petugas'}, ${fmtWaktu(a.decidedAt, tz)}` : a.approverName ? `Ditujukan ke ${a.approverName}` : a.approverKind === 'ATASAN' ? 'Pejabat penyetuju di unit pegawai' : 'Admin kepegawaian'}
                  </p>
                  {a.note && <p className="text-sm">{a.note}</p>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
