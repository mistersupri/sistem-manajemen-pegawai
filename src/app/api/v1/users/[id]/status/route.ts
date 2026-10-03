import { z } from 'zod';
import { body, route } from '@/lib/api';
import { setUserActive } from '@/lib/services/users';

export const POST = route<{ id: string }>({ perm: 'user.manage' }, async ({ req, actor, params }) => setUserActive(actor, params.id, (await body(req, z.object({ active: z.boolean() }))).active));
