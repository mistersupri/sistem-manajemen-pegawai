import { z } from 'zod';
import { body, route } from '@/lib/api';
import { deleteStation, updateStation } from '@/lib/services/stations';

export const PATCH = route<{ id: string }>({ perm: 'device.manage' }, async ({ req, actor, params }) => {
  const { tokenHash: _h, ...r } = await updateStation(actor, params.id, await body(req, z.unknown()));
  return r;
});
export const DELETE = route<{ id: string }>({ perm: 'device.manage' }, async ({ actor, params }) => deleteStation(actor, params.id));
