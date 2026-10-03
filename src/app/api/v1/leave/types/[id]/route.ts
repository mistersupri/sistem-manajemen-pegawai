import { z } from 'zod';
import { body, route } from '@/lib/api';
import { saveLeaveType } from '@/lib/services/leave';

export const PATCH = route<{ id: string }>({ perm: 'leave.manage' }, async ({ req, actor, params }) => saveLeaveType(actor, params.id, await body(req, z.unknown())));
