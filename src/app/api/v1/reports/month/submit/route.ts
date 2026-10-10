import { z } from 'zod';
import { body, route } from '@/lib/api';
import { submitMonth } from '@/lib/services/performance';

export const POST = route({ perm: 'report.self' }, async ({ req, actor }) => {
  const v = await body(req, z.object({ month: z.string(), summary: z.string().max(2000).nullable().optional() }));
  return submitMonth(actor, v.month, v.summary ?? null);
});
