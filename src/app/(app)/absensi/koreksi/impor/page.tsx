import { PageBody, PageHeader } from '@/components/app/page-header';
import { requirePage } from '@/lib/guard';
import { ImportFlow } from './import-flow';

export const metadata = { title: 'Impor koreksi absensi' };

export default async function CorrectionImportPage() {
  await requirePage(['correction.review']);
  return (
    <>
      <PageHeader title="Impor koreksi absensi" description="Perbaiki absensi banyak pegawai sekaligus lewat Excel (.xlsx) atau CSV. Setiap baris diperiksa dulu, lalu tercatat sebagai koreksi petugas." crumbs={[{ href: '/absensi/koreksi', label: 'Koreksi Absensi' }, { label: 'Impor' }]} />
      <PageBody className="max-w-6xl"><ImportFlow /></PageBody>
    </>
  );
}
