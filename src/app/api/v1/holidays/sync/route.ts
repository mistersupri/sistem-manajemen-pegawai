import { z } from 'zod';
import { body, route } from '@/lib/api';
import { syncNationalHolidays } from '@/lib/services/holidays';

export const POST = route({ perm: 'schedule.manage', rate: { key: 'holiday-sync', limit: 10, windowMs: 600_000 } }, async ({ req, actor }) => {
  const { year } = await body(req, z.object({ year: z.coerce.number().int() }));
  return syncNationalHolidays(actor, year);
});
