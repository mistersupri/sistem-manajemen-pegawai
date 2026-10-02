import { z } from 'zod';
import { body, route } from '@/lib/api';
import { createRole, listRoles } from '@/lib/services/users';

export const GET = route({ perm: ['user.manage', 'role.manage'] }, async () => ({ rows: await listRoles() }));
export const POST = route({ perm: 'role.manage' }, async ({ req, actor }) => createRole(actor, await body(req, z.unknown())));
