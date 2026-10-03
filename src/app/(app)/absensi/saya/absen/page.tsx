import Link from 'next/link';
import { MapPin, ScanFace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { FaceCheck } from '@/components/app/face-check';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { fmtJam, todayIn, toDbDate } from '@/lib/time';

export const metadata = { title: 'Absen Sekarang' };

export default async function AbsenPage() {
  const actor = await requirePage(['attendance.self']);
  if (!actor.employeeId) return <PageBody><EmptyState title="Akun tidak terhubung dengan data pegawai" description="Absen hanya untuk akun pegawai." /></PageBody>;
  const s = await getSettings();
  const tz = s['org.timezone'];
  const today = todayIn(tz);
  const [face, todayRec, emp] = await Promise.all([
    prisma.employeeBiometric.findFirst({ where: { employeeId: actor.employeeId, status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } } }),
    prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: actor.employeeId, workDate: toDbDate(today) } } }),
    prisma.employee.findUniqueOrThrow({ where: { id: actor.employeeId }, select: { isActive: true } }),
  ]);
  const suggested = todayRec?.checkInAt && !todayRec.checkOutAt ? 'OUT' : 'IN';
  return (
    <>
      <PageHeader
        title="Absen Sekarang"
        description={todayRec?.checkInAt ? `Hari ini masuk ${fmtJam(todayRec.checkInAt, tz)}${todayRec.checkOutAt ? `, pulang ${fmtJam(todayRec.checkOutAt, tz)}` : ''}.` : 'Belum ada absen hari ini.'}
        actions={
          <>
            {s['methods.fieldDuty'] && <Button asChild variant="outline"><Link href="/dinas-luar"><MapPin />Absen dinas luar</Link></Button>}
            <Button asChild variant="outline"><Link href="/absensi/saya">Rekap presensi</Link></Button>
          </>
        }
      />
      <PageBody className="grid max-w-3xl gap-6">
        {!emp.isActive ? <EmptyState title="Status pegawai nonaktif" description="Absensi tidak bisa dicatat untuk pegawai nonaktif. Hubungi admin kepegawaian bila ini keliru." /> : !s['methods.faceSelf'] ? (
          <Card><CardContent><EmptyState icon={ScanFace} title="Absen wajah dari perangkat pribadi sedang dinonaktifkan" description="Gunakan kiosk wajah atau mesin absensi di kantor. Bila bertugas di luar, gunakan absen dinas luar." /></CardContent></Card>
        ) : !face ? (
          <Card><CardContent><EmptyState icon={ScanFace} title="Wajah Anda belum terdaftar" description="Daftarkan wajah satu kali untuk bisa absen dari perangkat ini. Anda tetap bisa absen lewat mesin atau petugas." actions={[{ href: '/absensi/saya/wajah', label: 'Daftarkan wajah', primary: true }]} /></CardContent></Card>
        ) : face.status !== 'ACTIVE' ? (
          <Card><CardContent><EmptyState icon={ScanFace} title="Pendaftaran wajah menunggu verifikasi petugas" description="Sementara itu gunakan mesin absensi atau minta petugas mencatat absensi Anda." /></CardContent></Card>
        ) : (
          <FaceCheck suggested={suggested} requireLiveness={!!s['face.requireLiveness']} wantGps={!!s['geo.enforce']} />
        )}
      </PageBody>
    </>
  );
}
