import { z } from 'zod';
import { body, route } from '@/lib/api';
import { scheduleRevisions, updateSchedule } from '@/lib/services/schedules';

export const GET = route<{ id: string }>({ perm: 'schedule.read' }, async ({ params }) => ({ revisions: await scheduleRevisions(params.id) }));
export const PATCH = route<{ id: string }>({ perm: 'schedule.manage' }, async ({ req, actor, params }) => updateSchedule(actor, params.id, await body(req, z.unknown())));
