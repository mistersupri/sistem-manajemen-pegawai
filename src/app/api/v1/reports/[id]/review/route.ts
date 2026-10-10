import { z } from 'zod';
import { body, route } from '@/lib/api';
import { reviewMonthly } from '@/lib/services/performance';

export const POST = route<{ id: string }>({ perm: ['report.review', 'report.manage'] }, async ({ req, actor, params }) => reviewMonthly(actor, params.id, await body(req, z.unknown())));
