import { z } from 'zod';
import { body, route } from '@/lib/api';
import { deleteHoliday } from '@/lib/services/schedules';
import { setHolidayDisabled } from '@/lib/services/holidays';

export const PATCH = route<{ id: string }>({ perm: 'schedule.manage' }, async ({ req, actor, params }) => {
  const { disabled } = await body(req, z.object({ disabled: z.boolean() }));
  return setHolidayDisabled(actor, params.id, disabled);
});
export const DELETE = route<{ id: string }>({ perm: 'schedule.manage' }, async ({ actor, params }) => deleteHoliday(actor, params.id));
