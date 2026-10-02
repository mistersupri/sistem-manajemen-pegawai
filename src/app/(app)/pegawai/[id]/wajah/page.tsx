import { PageBody, PageHeader } from '@/components/app/page-header';
import { FaceEnroll } from '@/components/app/face-enroll';
import { requirePage } from '@/lib/guard';
import { getEmployeeInScope } from '@/lib/auth/actor';
import { getSettings } from '@/lib/settings';
import { biometricStatus } from '@/lib/services/biometrics';
import { StatusBadge } from '@/components/app/status-badge';

export const metadata = { title: 'Daftarkan wajah' };

export default async function AdminFacePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage(['biometric.manage']);
  const { id } = await params;
  const e = await getEmployeeInScope(actor, 'biometric.manage', id);
  const [s, bio] = await Promise.all([getSettings(), biometricStatus(id)]);
  const current = bio.find((b) => b.status !== 'REVOKED');
  return (
    <>
      <PageHeader
        title={`Daftarkan wajah ${e.fullName}`}
        description={current ? <span className="inline-flex items-center gap-2">Status saat ini: <StatusBadge status={current.status} /> Pendaftaran baru akan menggantikan template lama.</span> : 'Belum ada template wajah.'}
        crumbs={[{ href: '/pegawai', label: 'Data Pegawai' }, { href: `/pegawai/${id}`, label: e.fullName }, { label: 'Wajah' }]}
      />
      <PageBody>
        <FaceEnroll employeeId={id} employeeName={e.fullName} consentText={s['face.consentText']} consentVersion={s['face.consentVersion']} mode="admin"
          minScore={Number(s['face.minDetectionScore'])} minSize={Number(s['face.minFaceSizePx'])} backHref={`/pegawai/${id}`} />
      </PageBody>
    </>
  );
}
