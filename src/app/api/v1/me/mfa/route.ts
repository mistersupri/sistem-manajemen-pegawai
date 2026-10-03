import { z } from 'zod';
import { body, route } from '@/lib/api';
import { beginMfaSetup, confirmMfaSetup, disableOwnMfa } from '@/lib/services/users';

const schema = z.discriminatedUnion('step', [
  z.object({ step: z.literal('begin') }),
  z.object({ step: z.literal('confirm'), code: z.string().regex(/^\d{6}$/, 'Kode 6 angka') }),
  z.object({ step: z.literal('disable'), password: z.string().min(1, 'Wajib diisi') }),
]);

export const POST = route({ rate: { key: 'mfa-setup', limit: 15, windowMs: 600_000 } }, async ({ req, actor }) => {
  const v = await body(req, schema);
  if (v.step === 'begin') return beginMfaSetup(actor);
  if (v.step === 'confirm') return confirmMfaSetup(actor, v.code);
  return disableOwnMfa(actor, v.password);
});
