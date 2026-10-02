import { z } from 'zod';
import { body, route } from '@/lib/api';
import { assignRole } from '@/lib/services/users';

export const POST = route<{ id: string }>({ perm: 'user.manage' }, async ({ req, actor, params }) => assignRole(actor, params.id, await body(req, z.unknown())));
