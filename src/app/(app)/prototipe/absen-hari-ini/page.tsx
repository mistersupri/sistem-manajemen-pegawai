import { PageBody, PageHeader } from '@/components/app/page-header';
import { requirePage } from '@/lib/guard';
import { Harness } from './harness';
import './picker.css';

export const metadata = { title: 'Prototipe: Absensi hari ini', robots: { index: false } };

// Permukaan prototipe (skill prototype): tiga arah desain kartu beranda pegawai. Dihapus setelah satu varian dipilih.
export default async function PrototypePage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  await requirePage(['attendance.self', 'dashboard.view']);
  const v = parseInt((await searchParams).v ?? '', 10);
  return (
    <>
      <PageHeader title="Halo, Maya" description="Senin, 5 Oktober 2026. Staf Bidang A (contoh data prototipe)." />
      <PageBody className="max-w-3xl">
        <Harness initial={Number.isNaN(v) ? 0 : v - 1} />
      </PageBody>
    </>
  );
}
