import { z } from 'zod';
import { body, route } from '@/lib/api';
import { setScheduleActive } from '@/lib/services/schedules';

export const POST = route<{ id: string }>({ perm: 'schedule.manage' }, async ({ req, actor, params }) => setScheduleActive(actor, params.id, (await body(req, z.object({ active: z.boolean() }))).active));
