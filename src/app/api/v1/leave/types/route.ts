import { z } from 'zod';
import { body, route } from '@/lib/api';
import { listLeaveTypes, saveLeaveType } from '@/lib/services/leave';

export const GET = route({}, async ({ req }) => ({ rows: await listLeaveTypes(req.nextUrl.searchParams.get('all') === '1') }));
export const POST = route({ perm: 'leave.manage' }, async ({ req, actor }) => saveLeaveType(actor, null, await body(req, z.unknown())));
