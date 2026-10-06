import { z } from 'zod';
import { body, route } from '@/lib/api';
import { bulkUsers } from '@/lib/services/bulk';

export const POST = route({ perm: 'user.manage', rate: { key: 'bulkusers', limit: 30, windowMs: 600_000 } }, async ({ req, actor }) => bulkUsers(actor, await body(req, z.unknown())));
