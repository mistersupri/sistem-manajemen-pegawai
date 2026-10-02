import { PageBody, PageHeader } from '@/components/app/page-header';
import { FaceEnroll } from '@/components/app/face-enroll';
import { EmptyState } from '@/components/app/empty-state';
import { requirePage } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { biometricStatus } from '@/lib/services/biometrics';
import { prisma } from '@/lib/db';

export const metadata = { title: 'Daftarkan wajah saya' };

export default async function SelfFacePage() {
  const actor = await requirePage(['biometric.enroll_self']);
  if (!actor.employeeId) return <PageBody><EmptyState title="Akun tidak terhubung dengan data pegawai" description="Pendaftaran wajah hanya untuk akun pegawai." actions={[{ href: '/dashboard', label: 'Kembali ke beranda' }]} /></PageBody>;
  const [s, bio, emp] = await Promise.all([getSettings(), biometricStatus(actor.employeeId), prisma.employee.findUniqueOrThrow({ where: { id: actor.employeeId } })]);
  const current = bio.find((b) => b.status !== 'REVOKED');
  return (
    <>
      <PageHeader title="Daftarkan wajah" description="Satu kali, sekitar satu menit." crumbs={[{ href: '/absensi/saya', label: 'Absensi Saya' }, { label: 'Daftarkan wajah' }]} />
      <PageBody>
        {current ? (
          <EmptyState title={current.status === 'ACTIVE' ? 'Wajah Anda sudah terdaftar' : 'Pendaftaran menunggu verifikasi petugas'} description="Untuk mendaftar ulang atau menghapus data wajah, hubungi admin kepegawaian." actions={[{ href: '/absensi/saya', label: 'Kembali' }]} />
        ) : (
          <FaceEnroll employeeId={actor.employeeId} employeeName={emp.fullName} consentText={s['face.consentText']} consentVersion={s['face.consentVersion']} mode="self"
            minScore={Number(s['face.minDetectionScore'])} minSize={Number(s['face.minFaceSizePx'])} backHref="/absensi/saya" />
        )}
      </PageBody>
    </>
  );
}
