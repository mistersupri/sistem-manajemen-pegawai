import Link from 'next/link';
import { MapPin, ScanFace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { FaceCheck } from '@/components/app/face-check';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { plansFor } from '@/lib/attendance/plan';
import { METHOD_LABEL } from '@/lib/attendance/engine';
import { fmtJam, fmtTglPendek, fromDbDate, monthBounds, todayIn, toDbDate, BULAN } from '@/lib/time';

export const metadata = { title: 'Absensi Saya' };

export default async function MyAttendance({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const actor = await requirePage(['attendance.self']);
  if (!actor.employeeId) return <PageBody><EmptyState title="Akun tidak terhubung dengan data pegawai" description="Absensi pribadi hanya untuk akun pegawai." /></PageBody>;
  const s = await getSettings();
  const tz = s['org.timezone'];
  const today = todayIn(tz);
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.bulan ?? '') ? sp.bulan! : today.slice(0, 7);
  const { from, to: monthEnd } = monthBounds(month);
  const to = monthEnd > today ? today : monthEnd;
  const [face, todayRec, records, plans, emp] = await Promise.all([
    prisma.employeeBiometric.findFirst({ where: { employeeId: actor.employeeId, status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } } }),
    prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: actor.employeeId, workDate: toDbDate(today) } } }),
    prisma.attendanceRecord.findMany({ where: { employeeId: actor.employeeId, workDate: { gte: toDbDate(from), lte: toDbDate(monthEnd) } }, orderBy: { workDate: 'desc' } }),
    from <= to ? plansFor(actor.employeeId, from, to) : Promise.resolve([]),
    prisma.employee.findUniqueOrThrow({ where: { id: actor.employeeId }, select: { isActive: true } }),
  ]);
  const byDate = new Map(records.map((r) => [fromDbDate(r.workDate), r]));
  const rows = [...plans].reverse().filter((p) => byDate.has(p.date) || (p.schedule && !p.isOffDay));
  const suggested = todayRec?.checkInAt && !todayRec.checkOutAt ? 'OUT' : 'IN';
  const [y, m] = month.split('-').map(Number);
  return (
    <>
      <PageHeader
        title="Absensi Saya"
        description={todayRec?.checkInAt ? `Hari ini masuk ${fmtJam(todayRec.checkInAt, tz)}${todayRec.checkOutAt ? `, pulang ${fmtJam(todayRec.checkOutAt, tz)}` : ''}.` : 'Belum ada absen hari ini.'}
        actions={
          <>
            {s['methods.fieldDuty'] && <Button asChild variant="outline"><Link href="/dinas-luar"><MapPin />Absen dinas luar</Link></Button>}
            <Button asChild variant="outline"><Link href="/absensi/koreksi/baru">Ajukan koreksi</Link></Button>
          </>
        }
      />
      <PageBody className="grid gap-6">
        {!emp.isActive ? <EmptyState title="Status pegawai nonaktif" description="Absensi tidak bisa dicatat untuk pegawai nonaktif. Hubungi admin kepegawaian bila ini keliru." /> : !s['methods.faceSelf'] ? (
          <Card><CardContent><EmptyState icon={ScanFace} title="Absen wajah dari perangkat pribadi sedang dinonaktifkan" description="Gunakan kiosk wajah atau mesin absensi di kantor. Bila bertugas di luar, gunakan absen dinas luar." /></CardContent></Card>
        ) : !face ? (
          <Card><CardContent><EmptyState icon={ScanFace} title="Wajah Anda belum terdaftar" description="Daftarkan wajah satu kali untuk bisa absen dari perangkat ini. Anda tetap bisa absen lewat mesin atau petugas." actions={[{ href: '/absensi/saya/wajah', label: 'Daftarkan wajah', primary: true }]} /></CardContent></Card>
        ) : face.status !== 'ACTIVE' ? (
          <Card><CardContent><EmptyState icon={ScanFace} title="Pendaftaran wajah menunggu verifikasi petugas" description="Sementara itu gunakan mesin absensi atau minta petugas mencatat absensi Anda." /></CardContent></Card>
        ) : (
          <FaceCheck suggested={suggested} requireLiveness={!!s['face.requireLiveness']} wantGps={!!s['geo.enforce']} />
        )}

        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-wrap items-end justify-between gap-3 border-b py-4">
            <CardTitle>Riwayat {BULAN[m - 1]} {y}</CardTitle>
            <form method="get" className="flex items-end gap-2"><Label htmlFor="bulan" className="sr-only">Bulan</Label><Input id="bulan" name="bulan" type="month" defaultValue={month} max={today.slice(0, 7)} className="w-auto" /><Button type="submit" variant="outline">Tampilkan</Button></form>
          </CardHeader>
          {rows.length ? (
            <Table className="table-stack">
              <TableHeader><TableRow><TableHead className="pl-6">Tanggal</TableHead><TableHead>Jadwal</TableHead><TableHead>Masuk</TableHead><TableHead>Pulang</TableHead><TableHead>Status</TableHead><TableHead className="pr-6"><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader>
              <TableBody>{rows.map((p) => {
                const r = byDate.get(p.date);
                return (
                  <TableRow key={p.date}>
                    <TableCell className="stack-head pl-6 font-medium">{fmtTglPendek(p.date)}</TableCell>
                    <TableCell data-label="Jadwal" className="tabular text-muted-foreground">{p.isOffDay ? p.holidayName ?? 'Libur' : p.schedule ? `${p.schedule.checkIn} sampai ${p.schedule.checkOut}` : '-'}</TableCell>
                    <TableCell data-label="Masuk" className="tabular">{fmtJam(r?.checkInAt, tz) ?? '-'}<span className="block text-xs text-muted-foreground">{METHOD_LABEL[r?.checkInMethod ?? ''] ?? ''}</span></TableCell>
                    <TableCell data-label="Pulang" className="tabular">{fmtJam(r?.checkOutAt, tz) ?? '-'}<span className="block text-xs text-muted-foreground">{METHOD_LABEL[r?.checkOutMethod ?? ''] ?? ''}</span></TableCell>
                    <TableCell data-label="Status">{r ? <><StatusBadge status={r.status} />{r.lateMinutes > 0 && <span className="block text-xs text-muted-foreground">{r.lateMinutes} mnt</span>}</> : <StatusBadge status="TANPA_TRANSAKSI" />}</TableCell>
                    <TableCell className="pr-6"><div className="flex flex-wrap justify-end gap-1.5">
                      {r && <Button asChild size="sm" variant="ghost"><Link href={`/absensi/rekap/${actor.employeeId}/${p.date}`}>Rincian</Link></Button>}
                      <Button asChild size="sm" variant="outline"><Link href={`/absensi/koreksi/baru?tanggal=${p.date}`}>Koreksi</Link></Button>
                    </div></TableCell>
                  </TableRow>
                );
              })}</TableBody>
            </Table>
          ) : <EmptyState title="Belum ada data di bulan ini" description="Riwayat muncul setelah absen pertama bulan ini, lewat wajah, mesin, atau petugas." />}
        </Card>
      </PageBody>
    </>
  );
}
