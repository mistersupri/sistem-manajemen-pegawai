import { z } from 'zod';
import { body, route } from '@/lib/api';
import { balancesFor, setBalance } from '@/lib/services/leave';
import { getEmployeeInScope } from '@/lib/auth/actor';

export const GET = route({ perm: ['leave.manage', 'leave.request'] }, async ({ req, actor }) => {
  const employeeId = req.nextUrl.searchParams.get('employeeId') || actor.employeeId || '';
  if (employeeId !== actor.employeeId) await getEmployeeInScope(actor, 'leave.manage', employeeId);
  return { rows: await balancesFor(employeeId, Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear()) };
});
export const PUT = route({ perm: 'leave.manage' }, async ({ req, actor }) => setBalance(actor, await body(req, z.unknown())));
