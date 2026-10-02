import { z } from 'zod';
import { body, route } from '@/lib/api';
import { setEmployeeActive } from '@/lib/services/employees';

export const POST = route<{ id: string }>({ perm: 'employee.deactivate' }, async ({ req, actor, params }) => {
  const { active, ...rest } = await body(req, z.object({ active: z.boolean() }).passthrough());
  await setEmployeeActive(actor, params.id, active, rest);
});
