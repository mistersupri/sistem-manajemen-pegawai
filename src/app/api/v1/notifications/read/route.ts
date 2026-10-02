import { z } from 'zod';
import { body, route } from '@/lib/api';
import { markRead } from '@/lib/services/notifications';

export const POST = route({}, async ({ req, actor }) => {
  const v = await body(req, z.object({ ids: z.array(z.string().uuid()).max(500).optional(), all: z.boolean().optional() }));
  await markRead(actor.userId, v.all ? 'all' : v.ids ?? []);
});
