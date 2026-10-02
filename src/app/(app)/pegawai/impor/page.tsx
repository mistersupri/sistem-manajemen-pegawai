import { PageBody, PageHeader } from '@/components/app/page-header';
import { requirePage } from '@/lib/guard';
import { ImportFlow } from './import-flow';

export const metadata = { title: 'Impor pegawai' };

export default async function ImportPage() {
  await requirePage(['employee.import']);
  return (
    <>
      <PageHeader title="Impor data pegawai" description="Unggah Excel (.xlsx) atau CSV sesuai template. Data diperiksa per baris sebelum disimpan." crumbs={[{ href: '/pegawai', label: 'Data Pegawai' }, { label: 'Impor' }]} />
      <PageBody className="max-w-6xl"><ImportFlow /></PageBody>
    </>
  );
}
