import { z } from 'zod';
import { body, route } from '@/lib/api';
import { openPeriod } from '@/lib/services/assessment';

export const POST = route({ perm: 'assess.manage' }, async ({ req, actor }) => openPeriod(actor, await body(req, z.unknown())));
