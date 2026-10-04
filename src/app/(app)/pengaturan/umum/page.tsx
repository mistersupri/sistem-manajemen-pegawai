import { notFound } from 'next/navigation';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { requirePage } from '@/lib/guard';
import { scopeOf } from '@/lib/auth/actor';
import { getSettings } from '@/lib/settings';
import { SettingsCard, type SettingField } from '../settings-form';
import { LogoCard } from './logo';

export const metadata = { title: 'Umum' };

const ORG: SettingField[] = [
  { key: 'org.name', label: 'Nama instansi', type: 'text', wide: true },
  { key: 'org.timezone', label: 'Zona waktu', type: 'select', hint: 'Dipakai untuk tanggal kerja, jadwal, dan laporan. Unit kerja bisa punya zona waktu sendiri.', options: [['Asia/Jakarta', 'WIB (Asia/Jakarta)'], ['Asia/Makassar', 'WITA (Asia/Makassar)'], ['Asia/Jayapura', 'WIT (Asia/Jayapura)']].map(([value, label]) => ({ value, label })) },
  { key: 'org.timezoneLabel', label: 'Label zona waktu', type: 'text', hint: 'Mis. WIB.' },
];

export default async function GeneralPage() {
  const actor = await requirePage(['settings.manage']);
  if (!scopeOf(actor, 'settings.manage')?.all) notFound();
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Umum" description="Identitas instansi: nama, zona waktu, dan logo." crumbs={[{ label: 'Pengaturan' }, { label: 'Umum' }]} />
      <PageBody className="grid max-w-4xl gap-6">
        <SettingsCard title="Instansi" fields={ORG} values={s} />
        <LogoCard hasLogo={!!s['org.logo']} />
      </PageBody>
    </>
  );
}
