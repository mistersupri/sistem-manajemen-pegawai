import { z } from 'zod';
import { body, route } from '@/lib/api';
import { getEmployee, updateEmployee } from '@/lib/services/employees';

export const GET = route<{ id: string }>({ perm: 'employee.read' }, async ({ actor, params }) => getEmployee(actor, params.id));
export const PATCH = route<{ id: string }>({ perm: 'employee.write' }, async ({ req, actor, params }) => {
  const { effectiveDate, changeNote, ...data } = await body(req, z.object({ effectiveDate: z.string().optional().nullable(), changeNote: z.string().optional().nullable() }).passthrough());
  const e = await updateEmployee(actor, params.id, data, { effectiveDate, changeNote });
  return { id: e.id };
});
