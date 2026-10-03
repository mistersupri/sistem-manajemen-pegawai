import { z } from 'zod';
import { body, route } from '@/lib/api';
import { changeOwnPassword } from '@/lib/services/users';

const schema = z.object({ current: z.string().min(1, 'Wajib diisi'), next: z.string().min(1, 'Wajib diisi'), confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: 'Konfirmasi tidak sama', path: ['confirm'] });

export const POST = route({ rate: { key: 'pwd', limit: 10, windowMs: 600_000 } }, async ({ req, actor }) => {
  const v = await body(req, schema);
  await changeOwnPassword(actor, v.current, v.next);
});
