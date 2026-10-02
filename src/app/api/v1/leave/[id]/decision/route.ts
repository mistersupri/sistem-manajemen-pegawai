import { z } from 'zod';
import { body, route } from '@/lib/api';
import { decideLeave } from '@/lib/services/leave';

export const POST = route<{ id: string }>({ perm: ['leave.approve', 'leave.manage'] }, async ({ req, actor, params }) => decideLeave(actor, params.id, await body(req, z.unknown())));
