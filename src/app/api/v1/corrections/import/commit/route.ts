import { z } from 'zod';
import { body, route } from '@/lib/api';
import { commitCorrectionImport } from '@/lib/services/correction-import';

export const POST = route({ perm: 'correction.review' }, async ({ req, actor }) => {
  const v = await body(req, z.object({ token: z.string(), defaultReason: z.string().trim().max(1000).optional() }));
  return commitCorrectionImport(actor, v.token, v);
});
