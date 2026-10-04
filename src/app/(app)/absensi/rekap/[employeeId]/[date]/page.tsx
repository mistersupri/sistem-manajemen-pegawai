import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Dayline } from '@/components/app/dayline';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { traceRecord } from '@/lib/services/reports';
import { METHOD_LABEL, effectiveStatus } from '@/lib/attendance/engine';
import { OUTCOME_MESSAGE, type Outcome } from '@/lib/services/attendance';
import { KIND_LABEL } from '@/lib/services/corrections';
import { fmtJam, fmtTanggal, fmtWaktu, isValidDate, todayIn } from '@/lib/time';
import { AdminCorrection } from '../../../koreksi/admin-correction';

export const metadata = { title: 'Rincian absensi' };

export default async function TracePage({ params }: { params: Promise<{ employeeId: string; date: string }> }) {
  const actor = await requirePage(['attendance.monitor', 'attendance.self']);
  const { employeeId, date } = await params;
  if (!isValidDate(date)) notFound();
  const t = await traceRecord(actor, employeeId, date);
  const { record: r, plan: p, tz } = t;
  const isSelf = employeeId === actor.employeeId;
  const SRC: Record<string, string> = { SEMENTARA: 'penugasan sementara', PEGAWAI: 'jadwal pegawai', UNIT: 'jadwal unit kerja', TANPA_JADWAL: 'tanpa jadwal' };
  return (
    <>
      <PageHeader
        title={t.employee.fullName}
        description={`${fmtTanggal(date)}${t.employee.employeeNumber ? `, NIP ${t.employee.employeeNumber}` : ''}`}
        crumbs={isSelf && !can(actor, 'attendance.report') ? [{ href: '/absensi/saya', label: 'Rekap Presensi Saya' }, { label: 'Rincian' }] : [{ href: '/absensi/rekap', label: 'Rekapitulasi' }, { label: 'Rincian' }]}
        actions={
          <>
            {!isSelf && can(actor, 'correction.review') && <AdminCorrection employeeId={employeeId} date={date} current={{ checkIn: fmtJam(r?.checkInAt, tz), checkOut: fmtJam(r?.checkOutAt, tz), status: r?.status ?? null }} />}
            {isSelf && <Button asChild><Link href={`/absensi/koreksi/baru?tanggal=${date}`}>Ajukan koreksi</Link></Button>}
          </>
        }
      />
      <PageBody className="grid gap-6">
        <Card>
          <CardHeader><CardTitle>Hasil rekap</CardTitle><CardDescription>Disusun otomatis dari transaksi sumber di bawah, koreksi yang disetujui, dan cuti/izin yang disetujui.</CardDescription></CardHeader>
          <CardContent className="grid gap-5">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-sm text-muted-foreground">Status</dt><dd className="mt-1 flex flex-wrap gap-1">{(() => { const st = effectiveStatus(r ?? null, t.plan, todayIn(t.tz)); return st ? <StatusBadge status={st} /> : <StatusBadge status="LIBUR" label="Tanpa jadwal" />; })()}{r?.dispensation && <StatusBadge status="CANCELLED" label="Dispensasi" />}{r?.needsReview && <StatusBadge status="PENDING" label="Perlu ditinjau" />}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Masuk</dt><dd className="mt-1 text-xl font-semibold tabular">{fmtJam(r?.checkInAt, tz) ?? '-'}</dd><dd className="text-xs text-muted-foreground">{METHOD_LABEL[r?.checkInMethod ?? ''] ?? ''}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Pulang</dt><dd className="mt-1 text-xl font-semibold tabular">{fmtJam(r?.checkOutAt, tz) ?? '-'}</dd><dd className="text-xs text-muted-foreground">{METHOD_LABEL[r?.checkOutMethod ?? ''] ?? ''}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Terlambat / pulang awal</dt><dd className="mt-1 tabular">{r?.lateMinutes ?? 0} mnt / {r?.earlyLeaveMinutes ?? 0} mnt</dd></div>
            </dl>
            {p.schedule && !p.isOffDay && (
              <div>
                <Dayline scheduleIn={p.schedule.checkIn} scheduleOut={p.schedule.checkOut} checkIn={fmtJam(r?.checkInAt, tz)} checkOut={fmtJam(r?.checkOutAt, tz)} late={(r?.lateMinutes ?? 0) > 0} />
                <div className="flex justify-between text-xs text-muted-foreground" aria-hidden><span>05.00</span><span>09.00</span><span>13.00</span><span>17.00</span><span>22.00</span></div>
              </div>
            )}
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
              <dt className="text-muted-foreground">Jadwal</dt>
              <dd>{p.isOffDay ? `Libur${p.holidayName ? ` (${p.holidayName})` : p.offReason === 'BUKAN_HARI_KERJA' ? ' (bukan hari kerja)' : ''}` : p.schedule ? `${p.schedule.name} ${p.schedule.checkIn} sampai ${p.schedule.checkOut}, toleransi ${p.schedule.lateToleranceMin} menit` : 'Tanpa jadwal'}{`, dari ${SRC[p.source]}`}</dd>
              <dt className="text-muted-foreground">Versi aturan dipakai</dt><dd>{r?.scheduleRevision ? `${r.schedule?.code} versi ${r.scheduleRevision.version}` : '-'}</dd>
              {r?.reviewReason && <><dt className="text-muted-foreground">Perlu ditinjau</dt><dd>{r.reviewReason}</dd></>}
              {r?.note && <><dt className="text-muted-foreground">Catatan</dt><dd>{r.note}</dd></>}
              <dt className="text-muted-foreground">Terakhir dihitung</dt><dd>{r ? fmtWaktu(r.updatedAt, tz) : '-'}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4"><CardTitle>Transaksi wajah, dinas luar, dan petugas</CardTitle><CardDescription>Termasuk percobaan yang gagal. Data ini tidak bisa diubah atau dihapus.</CardDescription></CardHeader>
          {t.events.length ? (
            <Table className="table-stack"><TableHeader><TableRow><TableHead className="pl-6">Waktu server</TableHead><TableHead>Jenis</TableHead><TableHead>Metode</TableHead><TableHead>Hasil verifikasi</TableHead><TableHead className="pr-6">Detail</TableHead></TableRow></TableHeader>
              <TableBody>{t.events.map((e) => (
                <TableRow key={e.id} className={r?.checkInSourceId === e.id || r?.checkOutSourceId === e.id ? 'bg-accent/40' : undefined}>
                  <TableCell className="stack-head pl-6 tabular">{fmtWaktu(e.occurredAt, tz)}{(r?.checkInSourceId === e.id || r?.checkOutSourceId === e.id) && <span className="block text-xs font-medium text-primary">dipakai di rekap</span>}</TableCell>
                  <TableCell data-label="Jenis">{e.direction === 'IN' ? 'Masuk' : 'Pulang'}</TableCell>
                  <TableCell data-label="Metode">{METHOD_LABEL[e.method] ?? e.method}{e.station && <span className="block text-xs text-muted-foreground">Titik absen: {e.station.name}</span>}</TableCell>
                  <TableCell data-label="Hasil"><StatusBadge status={e.verification?.outcome === 'SUCCESS' ? 'SUCCESS' : 'FAILED'} label={e.verification?.outcome === 'SUCCESS' ? 'Berhasil' : (OUTCOME_MESSAGE[e.verification?.outcome as Outcome] ?? e.verification?.outcome ?? '-').split('.')[0]} /></TableCell>
                  <TableCell data-label="Detail" className="pr-6 whitespace-normal text-sm text-muted-foreground">
                    {[e.verification?.distance != null && `jarak wajah ${e.verification.distance.toFixed(3)} (ambang ${e.verification.threshold})`, e.verification?.distanceToOfficeM != null && `${e.verification.distanceToOfficeM} m dari kantor`, e.latitude != null && `GPS ${e.latitude.toFixed(5)}, ${e.longitude?.toFixed(5)}`, e.note, e.verification?.message !== OUTCOME_MESSAGE.SUCCESS && e.verification?.message].filter(Boolean).join(', ')}
                    {e.hasPhoto && <>, <a className="text-primary underline" href={`/api/v1/attendance/photo/${e.id}`} target="_blank" rel="noopener">foto</a></>}
                  </TableCell>
                </TableRow>
              ))}</TableBody></Table>
          ) : <p className="px-6 py-4 text-sm text-muted-foreground">Tidak ada.</p>}
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4"><CardTitle>Scan mesin absensi (raw event)</CardTitle><CardDescription>Waktu perangkat dan waktu diterima server dicatat terpisah.</CardDescription></CardHeader>
          {t.raws.length ? (
            <Table className="table-stack"><TableHeader><TableRow><TableHead className="pl-6">Waktu perangkat</TableHead><TableHead>Diterima server</TableHead><TableHead>Perangkat</TableHead><TableHead className="pr-6">Catatan</TableHead></TableRow></TableHeader>
              <TableBody>{t.raws.map((x) => (
                <TableRow key={x.id} className={r?.checkInSourceId === x.id || r?.checkOutSourceId === x.id ? 'bg-accent/40' : undefined}>
                  <TableCell className="stack-head pl-6 tabular">{fmtWaktu(x.deviceTime, tz)}{(r?.checkInSourceId === x.id || r?.checkOutSourceId === x.id) && <span className="block text-xs font-medium text-primary">dipakai di rekap</span>}</TableCell>
                  <TableCell data-label="Diterima" className="tabular text-muted-foreground">{fmtWaktu(x.receivedAt, tz)}</TableCell>
                  <TableCell data-label="Perangkat">{x.device?.name ?? 'Impor berkas'}</TableCell>
                  <TableCell data-label="Catatan" className="pr-6 text-sm text-muted-foreground">{[x.clockSkewSuspect && 'jam perangkat menyimpang', !x.employeeId && 'ID mesin belum dipetakan'].filter(Boolean).join(', ') || '-'}</TableCell>
                </TableRow>
              ))}</TableBody></Table>
          ) : <p className="px-6 py-4 text-sm text-muted-foreground">Tidak ada.</p>}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Koreksi</CardTitle></CardHeader>
            <CardContent>{t.corrections.length ? <ul className="divide-y text-sm">{t.corrections.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2"><Link className="text-primary hover:underline" href={`/absensi/koreksi/${c.id}`}>{KIND_LABEL[c.kind] ?? c.kind}</Link><StatusBadge status={c.status} /></li>
            ))}</ul> : <p className="text-sm text-muted-foreground">Tidak ada.</p>}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Cuti dan izin</CardTitle></CardHeader>
            <CardContent>{t.leave.length ? <ul className="divide-y text-sm">{t.leave.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2"><Link className="text-primary hover:underline" href={`/cuti/${l.id}`}>{l.leaveType.name}</Link><StatusBadge status={l.status} /></li>
            ))}</ul> : <p className="text-sm text-muted-foreground">Tidak ada.</p>}</CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
