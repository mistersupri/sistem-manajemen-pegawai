// Katalog izin dan peran bawaan. Peran bawaan bisa diubah izinnya lewat halaman
// Pengguna & Peran; daftar ini hanya dipakai saat seed/sinkronisasi awal.

export const PERMISSIONS = {
  'dashboard.view': ['Dashboard', 'Lihat dashboard ringkasan'],
  'unit.read': ['Unit kerja', 'Lihat unit kerja'],
  'unit.manage': ['Unit kerja', 'Kelola unit kerja'],
  'employee.read': ['Pegawai', 'Lihat data pegawai'],
  'employee.read_sensitive': ['Pegawai', 'Lihat NIK dan data sensitif pegawai'],
  'employee.write': ['Pegawai', 'Tambah dan ubah data pegawai'],
  'employee.deactivate': ['Pegawai', 'Nonaktifkan pegawai'],
  'employee.import': ['Pegawai', 'Impor data pegawai'],
  'employee.export': ['Pegawai', 'Ekspor data pegawai'],
  'biometric.enroll_self': ['Biometrik', 'Daftarkan wajah sendiri'],
  'biometric.manage': ['Biometrik', 'Daftarkan, verifikasi, dan cabut template wajah pegawai'],
  'attendance.self': ['Absensi', 'Absen dan lihat absensi sendiri'],
  'attendance.monitor': ['Absensi', 'Pantau kehadiran'],
  'attendance.report': ['Absensi', 'Lihat rekapitulasi'],
  'attendance.export': ['Absensi', 'Ekspor laporan absensi'],
  'attendance.manual_entry': ['Absensi', 'Input absensi manual (metode alternatif)'],
  'attendance.recalculate': ['Absensi', 'Hitung ulang absensi'],
  'kiosk.operate': ['Absensi', 'Menjalankan kiosk wajah'],
  'correction.request': ['Koreksi', 'Ajukan koreksi absensi sendiri'],
  'correction.review': ['Koreksi', 'Setujui atau tolak koreksi absensi'],
  'schedule.read': ['Jadwal', 'Lihat jadwal kerja'],
  'schedule.manage': ['Jadwal', 'Kelola jadwal, penugasan, dan hari libur'],
  'leave.request': ['Cuti & izin', 'Ajukan cuti/izin sendiri'],
  'leave.approve': ['Cuti & izin', 'Menyetujui cuti/izin sebagai atasan'],
  'leave.manage': ['Cuti & izin', 'Kelola jenis cuti, saldo, dan persetujuan tingkat kepegawaian'],
  'device.read': ['Perangkat', 'Lihat perangkat dan log sinkronisasi'],
  'device.manage': ['Perangkat', 'Kelola perangkat absensi'],
  'device.sync': ['Perangkat', 'Jalankan sinkronisasi dan impor data perangkat'],
  'user.manage': ['Pengguna', 'Kelola pengguna dan penugasan peran'],
  'role.manage': ['Pengguna', 'Kelola izin pada peran'],
  'settings.manage': ['Pengaturan', 'Kelola aturan, metode absensi, dan privasi'],
  'audit.read': ['Audit', 'Lihat audit log'],
} as const satisfies Record<string, readonly [string, string]>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

// Izin pegawai hanya berlaku untuk datanya sendiri; jadwal sendiri dibaca lewat attendance.self.
const self: Permission[] = ['attendance.self', 'correction.request', 'leave.request', 'biometric.enroll_self'];

export const ROLES: Record<string, { name: string; description: string; permissions: Permission[] }> = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    description: 'Konfigurasi sistem, seluruh unit, pengguna, dan pengaturan.',
    permissions: ALL_PERMISSIONS,
  },
  ADMIN_KEPEGAWAIAN: {
    name: 'Admin Kepegawaian',
    description: 'Data pegawai, absensi, jadwal, dan cuti pada unit yang diberikan.',
    permissions: ['dashboard.view', 'unit.read', 'employee.read', 'employee.read_sensitive', 'employee.write', 'employee.deactivate',
      'employee.import', 'employee.export', 'biometric.manage', 'attendance.monitor', 'attendance.report', 'attendance.export',
      'attendance.manual_entry', 'attendance.recalculate', 'correction.review', 'schedule.read', 'schedule.manage',
      'leave.approve', 'leave.manage', 'kiosk.operate', 'device.read'],
  },
  ADMIN_IT: {
    name: 'Admin IT/Perangkat',
    description: 'Mesin absensi, koneksi, sinkronisasi, dan log teknis.',
    permissions: ['dashboard.view', 'unit.read', 'device.read', 'device.manage', 'device.sync', 'kiosk.operate', 'attendance.monitor'],
  },
  PIMPINAN: {
    name: 'Pimpinan/Approver',
    description: 'Melihat data dalam kewenangannya dan menyetujui pengajuan.',
    permissions: ['dashboard.view', 'unit.read', 'employee.read', 'attendance.monitor', 'attendance.report', 'attendance.export',
      'correction.review', 'leave.approve', 'schedule.read'],
  },
  OPERATOR_UNIT: {
    name: 'Operator Unit',
    description: 'Data operasional unit: pemantauan, input manual, jadwal, kiosk.',
    permissions: ['dashboard.view', 'unit.read', 'employee.read', 'attendance.monitor', 'attendance.manual_entry', 'schedule.read',
      'schedule.manage', 'kiosk.operate'],
  },
  PEGAWAI: {
    name: 'Pegawai',
    description: 'Profil dan absensi sendiri, absen, serta pengajuan koreksi dan cuti/izin.',
    permissions: self,
  },
  AUDITOR: {
    name: 'Auditor/Pemeriksa',
    description: 'Akses baca terbatas terhadap data dan audit log.',
    permissions: ['dashboard.view', 'unit.read', 'employee.read', 'attendance.monitor', 'attendance.report', 'schedule.read',
      'device.read', 'audit.read'],
  },
};

// Peran yang dianggap administratif untuk kewajiban MFA.
export const ADMIN_ROLE_CODES = ['SUPER_ADMIN', 'ADMIN_KEPEGAWAIAN', 'ADMIN_IT'];
