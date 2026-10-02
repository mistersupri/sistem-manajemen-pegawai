import { z } from 'zod';
import { body, route } from '@/lib/api';
import { setDaysBulk } from '@/lib/services/schedules';

export const POST = route({ perm: 'schedule.manage', rate: { key: 'set-days', limit: 60, windowMs: 600_000 } }, async ({ req, actor }) => setDaysBulk(actor, await body(req, z.unknown())));
