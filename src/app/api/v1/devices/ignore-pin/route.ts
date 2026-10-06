import { z } from 'zod';
import { body, route } from '@/lib/api';
import { ignorePins, restorePin } from '@/lib/services/devices';

const pin = z.string().min(1).max(30);

export const POST = route({ perm: ['employee.write', 'device.manage'] }, async ({ req, actor }) => {
  const v = await body(req, z.object({ pins: z.array(pin).min(1).max(2000) }));
  return ignorePins(actor, v.pins);
});

export const DELETE = route({ perm: ['employee.write', 'device.manage'] }, async ({ req, actor }) => {
  const v = await body(req, z.object({ pin }));
  return restorePin(actor, v.pin);
});
