import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL } from '@/lib/attendance/engine';

const VARIANT: Record<string, 'hadir' | 'terlambat' | 'alpa' | 'dinas' | 'netral' | 'highlight'> = {
  HADIR: 'hadir', TERLAMBAT: 'terlambat', DINAS_LUAR: 'dinas', IZIN: 'netral', SAKIT: 'netral', CUTI: 'netral', TIDAK_HADIR: 'alpa', TANPA_TRANSAKSI: 'netral',
  PENDING: 'terlambat', APPROVED: 'hadir', REJECTED: 'alpa', CANCELLED: 'netral',
  SUCCESS: 'hadir', RUNNING: 'dinas', PARTIAL: 'terlambat', FAILED: 'alpa',
  ONLINE: 'hadir', OFFLINE: 'alpa', UNKNOWN: 'netral',
  ACTIVE: 'hadir', PENDING_VERIFICATION: 'terlambat', REVOKED: 'netral',
};

export const REQUEST_LABEL: Record<string, string> = { PENDING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak', CANCELLED: 'Dibatalkan' };
export const SYNC_LABEL: Record<string, string> = { RUNNING: 'Berjalan', SUCCESS: 'Berhasil', PARTIAL: 'Sebagian', FAILED: 'Gagal' };
export const DEVICE_LABEL: Record<string, string> = { ONLINE: 'Online', OFFLINE: 'Offline', UNKNOWN: 'Belum diketahui' };
export const FACE_LABEL: Record<string, string> = { ACTIVE: 'Terdaftar', PENDING_VERIFICATION: 'Menunggu verifikasi', REVOKED: 'Dicabut' };

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const text = label ?? STATUS_LABEL[status] ?? REQUEST_LABEL[status] ?? SYNC_LABEL[status] ?? DEVICE_LABEL[status] ?? FACE_LABEL[status] ?? status;
  return <Badge variant={VARIANT[status] ?? 'netral'} className={className}>{text}</Badge>;
}
