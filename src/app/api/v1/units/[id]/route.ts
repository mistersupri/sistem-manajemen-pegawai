import { z } from 'zod';
import { body, route } from '@/lib/api';
import { deactivateUnit, updateUnit } from '@/lib/services/units';

export const PATCH = route<{ id: string }>({ perm: 'unit.manage' }, async ({ req, actor, params }) => updateUnit(actor, params.id, await body(req, z.unknown())));
export const DELETE = route<{ id: string }>({ perm: 'unit.manage' }, async ({ actor, params }) => deactivateUnit(actor, params.id));
