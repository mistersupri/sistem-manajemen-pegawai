import { z } from 'zod';
import { body, route } from '@/lib/api';
import { biometricStatus, enrollFace, revokeFace } from '@/lib/services/biometrics';
import { getEmployeeInScope } from '@/lib/auth/actor';
import { can } from '@/lib/auth/actor';
import { forbidden } from '@/lib/errors';

export const GET = route<{ id: string }>({}, async ({ actor, params }) => {
  if (params.id !== actor.employeeId && !can(actor, 'biometric.manage')) throw forbidden();
  if (params.id !== actor.employeeId) await getEmployeeInScope(actor, 'biometric.manage', params.id);
  return { rows: await biometricStatus(params.id) };
});
export const POST = route<{ id: string }>({ perm: ['biometric.manage', 'biometric.enroll_self'], rate: { key: 'enroll', limit: 10, windowMs: 600_000 } }, async ({ req, actor, params }) =>
  enrollFace(actor, params.id, await body(req, z.unknown())));
export const DELETE = route<{ id: string }>({ perm: 'biometric.manage' }, async ({ req, actor, params }) => {
  const { reason } = await body(req, z.object({ reason: z.string() }));
  await revokeFace(actor, params.id, reason);
});
