import { z } from 'zod';
import { body, route } from '@/lib/api';
import { generateBalances } from '@/lib/services/leave';

export const POST = route({ perm: 'leave.manage' }, async ({ req, actor }) => generateBalances(actor, (await body(req, z.object({ year: z.number().int().min(2000).max(2100) }))).year));
