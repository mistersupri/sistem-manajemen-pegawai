import { z } from 'zod';
import { body, route } from '@/lib/api';
import { scheduleGrid, setDay } from '@/lib/services/schedules';

export const GET = route({ perm: 'schedule.read' }, async ({ req, actor }) =>
  scheduleGrid(actor, req.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7), req.nextUrl.searchParams.get('unitId') || undefined));
export const PUT = route({ perm: 'schedule.manage' }, async ({ req, actor }) => {
  const v = await body(req, z.object({ employeeId: z.string().uuid(), date: z.string(), value: z.string().min(1) }));
  return setDay(actor, v.employeeId, v.date, v.value);
});
