import { notFound } from 'next/navigation';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { requirePage } from '@/lib/guard';
import { scopeOf } from '@/lib/auth/actor';
import { getSettings } from '@/lib/settings';
import { SettingsCard, type SettingField } from '../settings-form';

export const metadata = { title: 'Retensi & Privasi' };

const PHOTOS: SettingField[] = [
  { key: 'privacy.storeFieldDutyPhotos', label: 'Simpan foto dinas luar', type: 'bool', hint: 'Foto bercap waktu dan lokasi sebagai bukti kehadiran di luar kantor.' },
  { key: 'privacy.photoRetentionDays', label: 'Hapus foto setelah', type: 'optnumber', min: 1, max: 3650, suffix: 'hari', hint: 'Kosongkan bila foto disimpan tanpa batas. Pemeriksaan berjalan tiap jam; transaksinya tetap tersimpan.' },
];

const CONSENT: SettingField[] = [
  { key: 'face.consentText', label: 'Teks pemberitahuan dan persetujuan data wajah', type: 'textarea', hint: 'Ditampilkan sebelum pendaftaran wajah. Setiap perubahan menaikkan versi; pendaftaran mencatat versi yang disetujui.' },
];

const SECURITY: SettingField[] = [
  { key: 'security.mfaRequiredForAdmins', label: 'Wajibkan MFA untuk peran admin', type: 'bool', hint: 'Admin yang belum memasang aplikasi autentikator diminta memasangnya saat masuk berikutnya.' },
  { key: 'security.sessionHours', label: 'Sesi berakhir setelah', type: 'number', min: 1, max: 72, suffix: 'jam' },
];

export default async function PrivacyPage() {
  const actor = await requirePage(['settings.manage']);
  if (!scopeOf(actor, 'settings.manage')?.all) notFound();
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Retensi & Privasi" description="Penyimpanan foto, persetujuan data wajah, dan keamanan akun." crumbs={[{ label: 'Pengaturan' }, { label: 'Retensi & Privasi' }]} />
      <PageBody className="grid max-w-4xl gap-6">
        <SettingsCard title="Foto absensi" description="Absen wajah mandiri dan kiosk tidak menyimpan foto; yang dikirim ke server hanya data numerik wajah untuk dicocokkan." fields={PHOTOS} values={s} />
        <SettingsCard title={`Persetujuan data wajah (versi ${s['face.consentVersion']})`} fields={CONSENT} values={s} />
        <SettingsCard title="Keamanan akun" fields={SECURITY} values={s} />
      </PageBody>
    </>
  );
}
