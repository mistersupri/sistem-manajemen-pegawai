import type { Permission } from './auth/catalog';

// Struktur navigasi sesuai PRD. Menu hanya tampil bila pengguna punya salah satu izin.
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  perms: Permission[];
  /** Disembunyikan untuk akun admin (akun pengelola tidak absen sendiri). */
  hideForAdmin?: boolean;
  children?: NavItem[];
}

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'layout-dashboard', perms: ['dashboard.view', 'attendance.self'] },
  { href: '/pegawai', label: 'Data Pegawai', icon: 'users', perms: ['employee.read'] },
  {
    href: '/absensi', label: 'Absensi', icon: 'clock', perms: ['attendance.self', 'attendance.monitor', 'attendance.report', 'correction.request', 'correction.review'],
    children: [
      { href: '/absensi/saya/absen', label: 'Absen Sekarang', icon: 'scan-face', perms: ['attendance.self'], hideForAdmin: true },
      { href: '/absensi/saya', label: 'Rekap Presensi Saya', icon: 'table', perms: ['attendance.self'], hideForAdmin: true },
      { href: '/absensi/monitoring', label: 'Monitoring Kehadiran', icon: 'activity', perms: ['attendance.monitor'] },
      { href: '/absensi/rekap', label: 'Rekapitulasi', icon: 'table', perms: ['attendance.report'] },
      { href: '/absensi/koreksi', label: 'Koreksi Absensi', icon: 'file-pen', perms: ['correction.request', 'correction.review'] },
    ],
  },
  {
    href: '/perangkat', label: 'Perangkat Absensi', icon: 'fingerprint', perms: ['device.read'],
    children: [
      { href: '/perangkat', label: 'Daftar Perangkat', icon: 'hard-drive', perms: ['device.read'] },
      { href: '/perangkat/sinkronisasi', label: 'Status Sinkronisasi', icon: 'refresh-cw', perms: ['device.read'] },
      { href: '/perangkat/log', label: 'Log Perangkat', icon: 'list', perms: ['device.read'] },
      { href: '/perangkat/titik-absen', label: 'Titik Absen Wajah', icon: 'scan-face', perms: ['device.read'] },
    ],
  },
  { href: '/cuti', label: 'Cuti & Izin', icon: 'plane', perms: ['leave.request', 'leave.approve', 'leave.manage'] },
  {
    href: '/pengaturan', label: 'Pengaturan', icon: 'settings', perms: ['unit.manage', 'unit.read', 'user.manage', 'role.manage', 'settings.manage', 'audit.read', 'schedule.read', 'schedule.manage', 'leave.manage'],
    children: [
      { href: '/pengaturan/umum', label: 'Umum', icon: 'settings', perms: ['settings.manage'] },
      { href: '/jadwal', label: 'Jadwal Kerja', icon: 'calendar-days', perms: ['schedule.read'] },
      { href: '/pengaturan/unit', label: 'Unit Kerja', icon: 'building-2', perms: ['unit.read', 'unit.manage'] },
      { href: '/pengaturan/pengguna', label: 'Pengguna & Peran', icon: 'shield-check', perms: ['user.manage', 'role.manage'] },
      { href: '/pengaturan/aturan', label: 'Aturan Absensi', icon: 'sliders-horizontal', perms: ['settings.manage', 'schedule.manage', 'leave.manage'] },
      { href: '/pengaturan/metode', label: 'Metode Absensi', icon: 'scan-line', perms: ['settings.manage'] },
      { href: '/pengaturan/privasi', label: 'Retensi & Privasi', icon: 'lock', perms: ['settings.manage'] },
      { href: '/pengaturan/audit', label: 'Audit Log', icon: 'scroll-text', perms: ['audit.read'] },
    ],
  },
];

export const ADMIN_ROLE_CODES = ['SUPER_ADMIN', 'ADMIN_KEPEGAWAIAN', 'ADMIN_IT'];
