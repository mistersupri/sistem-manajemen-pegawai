import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { FieldDuty } from '@/components/app/field-duty';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export const metadata = { title: 'Absen dinas luar' };

export default async function FieldDutyPage() {
  const actor = await requirePage(['attendance.self']);
  if (!actor.employeeId) return <PageBody><EmptyState title="Akun tidak terhubung dengan data pegawai" /></PageBody>;
  const s = await getSettings();
  const [emp, face] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { id: actor.employeeId } }),
    prisma.employeeBiometric.findFirst({ where: { employeeId: actor.employeeId, status: 'ACTIVE' } }),
  ]);
  return (
    <>
      <PageHeader title="Absen dinas luar" description="Ambil selfie di lokasi tugas. Foto diberi stempel jam server, koordinat GPS, dan keterangan." crumbs={[{ href: '/absensi/saya', label: 'Absensi Saya' }, { label: 'Dinas luar' }]} />
      <PageBody>
        {!s['methods.fieldDuty'] ? <EmptyState title="Absen dinas luar sedang dinonaktifkan" description="Ajukan dinas luar lewat menu Cuti & Izin, atau hubungi admin kepegawaian." />
          : !face ? <EmptyState title="Wajah Anda belum terdaftar atau belum diverifikasi" description="Foto dinas luar dicocokkan dengan wajah terdaftar. Sementara itu, ajukan dinas luar lewat menu Cuti & Izin." actions={[{ href: '/absensi/saya/wajah', label: 'Daftarkan wajah', primary: true }, { href: '/cuti/baru', label: 'Ajukan dinas luar' }]} />
          : <FieldDuty employee={{ name: emp.fullName, nip: emp.employeeNumber }} org={s['org.name']} storePhoto={!!s['privacy.storeFieldDutyPhotos']} geocode={!!s['geo.reverseGeocode']} />}
      </PageBody>
    </>
  );
}
