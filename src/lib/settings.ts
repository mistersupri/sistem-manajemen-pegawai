import { prisma, type Db } from './db';
import { env } from './env';

// Semua aturan yang bisa diatur administrator. Nilai bawaan sengaja netral:
// aturan instansi (geofence, ambang wajah, retensi) harus ditetapkan oleh admin.
export const SETTING_DEFAULTS = {
  'org.name': 'Instansi (demo)',
  'org.logo': null as string | null,
  'org.timezone': 'Asia/Jakarta',
  'org.timezoneLabel': 'WIB',
  // Metode absensi yang aktif.
  'methods.faceSelf': true,
  'methods.faceKiosk': true,
  'methods.fieldDuty': true,
  'methods.manual': true,
  // Wajah: ambang jarak Euclidean face-api.js. Harus dikalibrasi (lihat docs/BIOMETRIK.md).
  'face.matchThreshold': 0.5,
  'face.minDetectionScore': 0.6,
  'face.minFaceSizePx': 120,
  'face.requireLiveness': false,
  'face.requireOfficerVerification': false,
  'face.consentVersion': '1',
  'face.consentText':
    'Data wajah Anda diproses untuk verifikasi kehadiran saja. Yang disimpan adalah template numerik terenkripsi, bukan foto. ' +
    'Template hanya dapat diakses oleh sistem pencocokan dan petugas kepegawaian berwenang, disimpan selama Anda aktif sebagai pegawai, ' +
    'dan dapat dihapus atas permintaan Anda melalui admin kepegawaian. Bila tidak bersedia, Anda dapat memakai metode absensi lain.',
  // Lokasi: pembatasan radius untuk absen wajah mandiri.
  'geo.enforce': false,
  'geo.officeLat': null as number | null,
  'geo.officeLng': null as number | null,
  'geo.radiusM': 200,
  // Alamat dari koordinat lewat OpenStreetMap Nominatim (layanan pihak ketiga, gratis). Bawaan: mati.
  'geo.reverseGeocode': false,
  // Aturan absensi umum.
  'rules.checkoutGraceHours': 6,
  // Tolak absen pada hari tanpa jadwal/libur. Bawaan: tetap dicatat dengan keterangan.
  'rules.blockOutsideSchedule': false,
  // Batas hari ke belakang untuk input manual petugas dan pengajuan koreksi.
  'rules.backdateDays': 31,
  'rules.duplicateWindowMinutes': 2,
  'rules.clockSkewToleranceMinutes': 10,
  // Privasi dan retensi.
  'privacy.storeFieldDutyPhotos': true,
  'privacy.photoRetentionDays': null as number | null,
  // Keamanan.
  'security.mfaRequiredForAdmins': false,
  'security.sessionHours': 12,
  // Modul.
  'modules.leave': true,
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = { [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] };

export async function getSettings(db: Db = prisma): Promise<Settings> {
  const rows = await db.systemSetting.findMany();
  const out = { ...SETTING_DEFAULTS } as Record<string, unknown>;
  for (const r of rows) if (r.key in out) out[r.key] = r.value;
  if (!rows.some((r) => r.key === 'org.timezone')) out['org.timezone'] = env().APP_TIMEZONE;
  return out as Settings;
}

export async function getSetting<K extends SettingKey>(key: K, db: Db = prisma): Promise<Settings[K]> {
  const row = await db.systemSetting.findUnique({ where: { key } });
  if (!row) return key === 'org.timezone' ? (env().APP_TIMEZONE as Settings[K]) : SETTING_DEFAULTS[key];
  return row.value as Settings[K];
}
