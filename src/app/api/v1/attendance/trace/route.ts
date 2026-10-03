import { route } from '@/lib/api';
import { traceRecord } from '@/lib/services/reports';

export const GET = route({ perm: ['attendance.monitor', 'attendance.self'] }, async ({ req, actor }) =>
  traceRecord(actor, req.nextUrl.searchParams.get('employeeId') || '', req.nextUrl.searchParams.get('date') || ''));
