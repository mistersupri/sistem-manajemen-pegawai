import { z } from 'zod';
import { body, route } from '@/lib/api';
import { createAssignmentsBulk } from '@/lib/services/schedules';

export const POST = route({ perm: 'schedule.manage', rate: { key: 'assign-bulk', limit: 30, windowMs: 600_000 } }, async ({ req, actor }) => createAssignmentsBulk(actor, await body(req, z.unknown())));
