import { z } from 'zod';
import { body, route } from '@/lib/api';
import { createAssignment, listAssignments } from '@/lib/services/schedules';

export const GET = route({ perm: 'schedule.read' }, async ({ req, actor }) => ({
  rows: await listAssignments(actor, { employeeId: req.nextUrl.searchParams.get('employeeId') || undefined, unitId: req.nextUrl.searchParams.get('unitId') || undefined }),
}));
export const POST = route({ perm: 'schedule.manage' }, async ({ req, actor }) => createAssignment(actor, await body(req, z.unknown())));
