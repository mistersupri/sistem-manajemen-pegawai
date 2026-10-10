import { z } from 'zod';
import { body, route } from '@/lib/api';
import { reassign, removeAssignment } from '@/lib/services/assessment-mapping';

export const PATCH = route<{ id: string }>({ perm: 'assess.manage' }, async ({ req, actor, params }) => {
  const v = await body(req, z.object({ assessorId: z.string().uuid('Pilih penilai') }));
  await reassign(actor, params.id, v.assessorId);
  return { ok: true };
});

export const DELETE = route<{ id: string }>({ perm: 'assess.manage' }, async ({ actor, params }) => removeAssignment(actor, params.id));
