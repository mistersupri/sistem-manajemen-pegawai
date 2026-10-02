import { z } from 'zod';
import { body, route } from '@/lib/api';
import { manualAttendance } from '@/lib/services/attendance';

export const POST = route({ perm: 'attendance.manual_entry' }, async ({ req, actor }) => {
  const r = await manualAttendance(actor, await body(req, z.unknown()));
  return { eventId: r.event.id, status: r.record?.status ?? null };
});
