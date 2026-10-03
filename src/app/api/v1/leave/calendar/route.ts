import { route } from '@/lib/api';
import { leaveCalendar } from '@/lib/services/leave';

export const GET = route({ perm: ['leave.request', 'leave.approve', 'leave.manage'] }, async ({ req, actor }) => ({
  rows: await leaveCalendar(actor, req.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7), req.nextUrl.searchParams.get('unitId') || undefined),
}));
