import { z } from 'zod';
import { body, route } from '@/lib/api';
import { commitImport } from '@/lib/services/employee-import';

export const POST = route({ perm: 'employee.import' }, async ({ req, actor }) => {
  const v = await body(req, z.object({ token: z.string(), updateExisting: z.boolean(), createAccounts: z.boolean() }));
  return commitImport(actor, v.token, v);
});
