import { z } from 'zod';
import { body, route } from '@/lib/api';
import { verifyEnrollment } from '@/lib/services/biometrics';

export const POST = route<{ id: string }>({ perm: 'biometric.manage' }, async ({ req, actor, params }) => {
  const v = await body(req, z.object({ approve: z.boolean(), note: z.string().max(300).optional() }));
  await verifyEnrollment(actor, params.id, v.approve, v.note);
});
