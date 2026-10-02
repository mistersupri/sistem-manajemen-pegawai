import { fileResponse, route } from '@/lib/api';
import { exportAttendance } from '@/lib/services/exports';

export const GET = route({ perm: 'attendance.export', rate: { key: 'export', limit: 30, windowMs: 600_000 } }, async ({ req, actor }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const format = (['xlsx', 'csv', 'csv-rekap', 'pdf'] as const).find((f) => f === sp.format) ?? 'xlsx';
  const f = await exportAttendance(actor, sp, format);
  return fileResponse(f.body, f.filename, f.type);
});
