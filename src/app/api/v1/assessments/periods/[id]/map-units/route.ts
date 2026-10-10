import { z } from 'zod';
import { body, route } from '@/lib/api';
import { mapUnits } from '@/lib/services/assessment-mapping';

export const POST = route<{ id: string }>({ perm: 'assess.manage', rate: { key: 'assessmap', limit: 20, windowMs: 600_000 } }, async ({ req, actor, params }) => mapUnits(actor, params.id, await body(req, z.unknown())));
