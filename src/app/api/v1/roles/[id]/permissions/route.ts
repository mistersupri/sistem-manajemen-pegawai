import { z } from 'zod';
import { body, route } from '@/lib/api';
import { setRolePermissions } from '@/lib/services/users';

export const PUT = route<{ id: string }>({ perm: 'role.manage' }, async ({ req, actor, params }) => setRolePermissions(actor, params.id, (await body(req, z.object({ permissions: z.array(z.string()) }))).permissions));
