import { route } from '@/lib/api';
import { dailyRecords } from '@/lib/services/reports';

export const GET = route({ perm: 'attendance.report' }, async ({ req, actor }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  return dailyRecords(actor, sp, { page: Number(sp.page) || 1, pageSize: Math.min(200, Number(sp.pageSize) || 50) });
});
