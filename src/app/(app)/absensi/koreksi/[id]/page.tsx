import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmButton } from '@/components/app/confirm-button';
import { requirePage } from '@/lib/guard';
import { getCorrection, KIND_LABEL } from '@/lib/services/corrections';
import { getSettings } from '@/lib/settings';
import { STATUS_LABEL } from '@/lib/attendance/engine';
import { fmtTanggal, fmtWaktu, fromDbDate } from '@/lib/time';
import { ReviewForm } from './review';

export const metadata = { title: 'Detail koreksi' };

type Vals = { checkIn?: string | null; checkOut?: string | null; status?: string; lateMinutes?: number } | null;

export default async function CorrectionDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage(['correction.request', 'correction.review']);
  const c = await getCorrection(actor, (await params).id);
  const tz = (await getSettings())['org.timezone'];
  const date = fromDbDate(c.workDate);
  const orig = c.originalValues as Vals;
  const applied = c.appliedValues as Vals;
  const fmt = (v: Vals) => (v ? `masuk ${v.checkIn ?? '-'}, pulang ${v.checkOut ?? '-'}, ${STATUS_LABEL[v.status ?? ''] ?? v.status ?? ''}${v.lateMinutes ? `, terlambat ${v.lateMinutes} mnt` : ''}` : 'Belum ada catatan');
  return (
    <>
      <PageHeader
        title={`Koreksi ${c.employee.fullName}`}
        description={`${KIND_LABEL[c.kind] ?? c.kind} untuk ${fmtTanggal(date)}`}
        crumbs={[{ href: '/absensi/koreksi', label: 'Koreksi Absensi' }, { label: 'Detail' }]}
        actions={c.canCancel ? <ConfirmButton label="Batalkan pengajuan" title="Batalkan pengajuan koreksi?" description="Pengajuan ditandai dibatalkan dan tidak diproses." confirmLabel="Batalkan" url={`/api/v1/corrections/${c.id}/cancel`} success="Pengajuan dibatalkan." /> : undefined}
      />
      <PageBody className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2">Pengajuan <StatusBadge status={c.status} /></CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">Pegawai</dt><dd>{c.employee.fullName}<span className="block text-muted-foreground">{c.employee.unit?.name}</span></dd>
              <dt className="text-muted-foreground">Tanggal absensi</dt><dd><Link className="text-primary underline" href={`/absensi/rekap/${c.employeeId}/${date}`}>{fmtTanggal(date)}</Link></dd>
              <dt className="text-muted-foreground">Usulan</dt><dd className="tabular">{[c.proposedCheckIn && `masuk ${c.proposedCheckIn}`, c.proposedCheckOut && `pulang ${c.proposedCheckOut}`, c.proposedStatus && STATUS_LABEL[c.proposedStatus], c.dispensation && 'dispensasi'].filter(Boolean).join(', ') || '-'}</dd>
              <dt className="text-muted-foreground">Alasan</dt><dd className="whitespace-pre-wrap">{c.reason}</dd>
              {c.attachmentPath && <><dt className="text-muted-foreground">Bukti</dt><dd><a className="text-primary underline" href={`/api/v1/corrections/${c.id}/attachment`} target="_blank" rel="noopener">Buka lampiran</a></dd></>}
              <dt className="text-muted-foreground">Diajukan</dt><dd>{fmtWaktu(c.createdAt, tz)} oleh {c.requestedBy}</dd>
              <dt className="text-muted-foreground">Nilai awal</dt><dd>{fmt(orig)}</dd>
              {c.status !== 'PENDING' && c.status !== 'CANCELLED' && <><dt className="text-muted-foreground">Ditinjau</dt><dd>{c.reviewedAt ? fmtWaktu(c.reviewedAt, tz) : '-'} oleh {c.reviewedBy ?? '-'}{c.reviewNote && <span className="block">{c.reviewNote}</span>}</dd></>}
              {applied && <><dt className="text-muted-foreground">Nilai setelah koreksi</dt><dd>{fmt(applied)}</dd></>}
            </dl>
          </CardContent>
        </Card>
        {c.canReview && <ReviewForm id={c.id} proposed={{ checkIn: c.proposedCheckIn, checkOut: c.proposedCheckOut }} />}
      </PageBody>
    </>
  );
}
