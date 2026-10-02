import { z } from 'zod';
import { body, route } from '@/lib/api';
import { endAssignment } from '@/lib/services/schedules';

export const PATCH = route<{ id: string }>({ perm: 'schedule.manage' }, async ({ req, actor, params }) => endAssignment(actor, params.id, await body(req, z.unknown())));
