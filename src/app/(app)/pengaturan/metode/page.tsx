import { notFound } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { requirePage } from '@/lib/guard';
import { scopeOf } from '@/lib/auth/actor';
import { getSettings } from '@/lib/settings';
import { SettingsCard, type SettingField } from '../settings-form';

export const metadata = { title: 'Metode Absensi' };

const METHODS: SettingField[] = [
  { key: 'methods.faceSelf', label: 'Absen wajah mandiri', type: 'bool', hint: 'Pegawai absen dari perangkatnya sendiri lewat menu Absensi Saya.' },
  { key: 'methods.faceKiosk', label: 'Kiosk wajah', type: 'bool', hint: 'Satu perangkat bersama di kantor, dibuka petugas lewat halaman /kiosk.' },
  { key: 'methods.fieldDuty', label: 'Dinas luar (foto, waktu, dan GPS)', type: 'bool' },
  { key: 'methods.manual', label: 'Input manual oleh petugas', type: 'bool', hint: 'Untuk gangguan alat. Wajib alasan dan tercatat di audit log.' },
];

const FACE: SettingField[] = [
  { key: 'face.matchThreshold', label: 'Ambang jarak kecocokan', type: 'number', min: 0.2, max: 0.8, step: 0.01, hint: 'Makin kecil makin ketat: penolakan pegawai sah naik, penerimaan orang lain turun. Kalibrasi dengan data instansi sendiri (docs/BIOMETRIK.md).' },
  { key: 'face.minDetectionScore', label: 'Skor deteksi minimum', type: 'number', min: 0.3, max: 0.99, step: 0.01, hint: 'Di bawah ini, pegawai diminta memperbaiki posisi atau cahaya.' },
  { key: 'face.minFaceSizePx', label: 'Ukuran wajah minimum', type: 'number', min: 40, max: 600, suffix: 'piksel' },
  { key: 'face.requireLiveness', label: 'Wajib kedip (deteksi liveness sederhana)', type: 'bool', hint: 'Pemeriksaan di peramban; mengurangi pemakaian foto cetak, tetapi tidak menjamin anti-spoofing.' },
  { key: 'face.requireOfficerVerification', label: 'Pendaftaran wajah mandiri perlu verifikasi petugas', type: 'bool' },
];

const GEO: SettingField[] = [
  { key: 'geo.enforce', label: 'Batasi absen wajah mandiri di sekitar kantor', type: 'bool', hint: 'Dinas luar tidak dibatasi radius; lokasi tetap dicatat.' },
  { key: 'geo.officeLat', label: 'Lintang kantor', type: 'optnumber', min: -90, max: 90, step: 0.000001 },
  { key: 'geo.officeLng', label: 'Bujur kantor', type: 'optnumber', min: -180, max: 180, step: 0.000001 },
  { key: 'geo.radiusM', label: 'Radius', type: 'number', min: 10, max: 100000, suffix: 'meter' },
  { key: 'geo.reverseGeocode', label: 'Tampilkan alamat dari koordinat', type: 'bool', hint: 'Memakai OpenStreetMap Nominatim (gratis, pihak ketiga). Koordinat dikirim dari peramban pegawai ke layanan tersebut.' },
];

export default async function MethodsPage() {
  const actor = await requirePage(['settings.manage']);
  if (!scopeOf(actor, 'settings.manage')?.all) notFound();
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Metode Absensi" description="Metode yang tersedia, ambang pengenalan wajah, dan pembatasan lokasi." crumbs={[{ label: 'Pengaturan' }, { label: 'Metode Absensi' }]} />
      <PageBody className="grid max-w-4xl gap-6">
        <SettingsCard title="Metode yang aktif" description="Pegawai yang tidak bisa atau tidak bersedia memakai wajah tetap bisa memakai mesin absensi atau input petugas." fields={METHODS} values={s} />
        <SettingsCard title="Pengenalan wajah" fields={FACE} values={s}>
          <Alert variant="warning">
            <AlertTitle>Pengenalan wajah tidak 100% akurat</AlertTitle>
            <AlertDescription>Kegagalan verifikasi bukan pelanggaran disiplin. Pegawai yang gagal diarahkan ke metode lain atau koreksi absensi.</AlertDescription>
          </Alert>
        </SettingsCard>
        <SettingsCard title="Lokasi" fields={GEO} values={s} />
      </PageBody>
    </>
  );
}
