import { z } from 'zod';
import { body, route } from '@/lib/api';
import { createUnit, listUnits } from '@/lib/services/units';

export const GET = route({ perm: ['unit.read', 'unit.manage'] }, async ({ actor }) => ({ rows: await listUnits(actor) }));
export const POST = route({ perm: 'unit.manage' }, async ({ req, actor }) => createUnit(actor, await body(req, z.unknown())));
