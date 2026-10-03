import { z } from 'zod';
import { body, route } from '@/lib/api';
import { createEmployee, listEmployees } from '@/lib/services/employees';

export const GET = route({ perm: 'employee.read' }, async ({ req, actor }) => listEmployees(actor, Object.fromEntries(req.nextUrl.searchParams)));
export const POST = route({ perm: 'employee.write' }, async ({ req, actor }) => {
  const { createAccount, ...data } = await body(req, z.object({ createAccount: z.boolean().optional() }).passthrough());
  const r = await createEmployee(actor, data, { createAccount: !!createAccount });
  return { id: r.employee.id, account: r.account };
});
