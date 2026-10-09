import { z } from 'zod';
import { body, route } from '@/lib/api';
import { setPeriodClosed, topUpPeriod } from '@/lib/services/assessment';

export const POST = route<{ id: string }>({ perm: 'assess.manage' }, async ({ req, actor, params }) => {
  const v = await body(req, z.object({ action: z.enum(['close', 'reopen', 'topup']) }));
  if (v.action === 'topup') return topUpPeriod(actor, params.id);
  await setPeriodClosed(actor, params.id, v.action === 'close');
  return { ok: true };
});
