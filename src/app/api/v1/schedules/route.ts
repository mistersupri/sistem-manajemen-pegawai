import { z } from 'zod';
import { body, route } from '@/lib/api';
import { createSchedule, listSchedules } from '@/lib/services/schedules';

export const GET = route({ perm: ['schedule.read', 'attendance.self'] }, async ({ req }) => ({ rows: await listSchedules(req.nextUrl.searchParams.get('all') === '1') }));
export const POST = route({ perm: 'schedule.manage' }, async ({ req, actor }) => createSchedule(actor, await body(req, z.unknown())));
