import { StatusBadge } from '@/components/app/status-badge';

const MAP: Record<string, { status: string; label: string }> = {
  DRAFT: { status: 'BELUM', label: 'Belum dikirim' },
  SUBMITTED: { status: 'PENDING', label: 'Menunggu penilaian' },
  APPROVED: { status: 'APPROVED', label: 'Sudah dinilai' },
  RETURNED: { status: 'REJECTED', label: 'Dikembalikan' },
};

export const REPORT_STATUS_LABEL = Object.fromEntries(Object.entries(MAP).map(([k, v]) => [k, v.label])) as Record<string, string>;

export function ReportStatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? MAP.DRAFT;
  return <StatusBadge status={m.status} label={m.label} />;
}
