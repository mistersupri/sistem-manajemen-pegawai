import { z } from 'zod';
import { body, route } from '@/lib/api';
import { createUser, listUsers } from '@/lib/services/users';

export const GET = route({ perm: 'user.manage' }, async ({ req, actor }) => ({ rows: await listUsers(actor, req.nextUrl.searchParams.get('q') || undefined) }));
export const POST = route({ perm: 'user.manage' }, async ({ req, actor }) => {
  const u = await createUser(actor, await body(req, z.unknown()));
  return { id: u.id };
});
