import { z } from 'zod';
import { body, route } from '@/lib/api';
import { createHoliday, listHolidays } from '@/lib/services/schedules';

export const GET = route({ perm: ['schedule.read', 'attendance.self'] }, async ({ req }) => ({ rows: await listHolidays(Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear()) }));
export const POST = route({ perm: 'schedule.manage' }, async ({ req, actor }) => createHoliday(actor, await body(req, z.unknown())));
